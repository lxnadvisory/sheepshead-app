/**
 * Read-only spot check of src/lib/analytics.js against the live database.
 * Only SELECTs — never writes. Needs VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
 * in .env.local (or .env).
 *
 *   node scripts/analytics-check.mjs
 */
import fs from 'fs'
import { createClient } from '@supabase/supabase-js'
import { computeAnalytics, normalize, nightLabel } from '../src/lib/analytics.js'

function readEnv() {
  const env = {}
  for (const f of ['.env', '.env.local']) {
    if (!fs.existsSync(f)) continue
    fs.readFileSync(f, 'utf8').split(/\r?\n/).forEach(line => {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?(.*?)"?\s*$/)
      if (m) env[m[1]] = m[2]
    })
  }
  return env
}

async function selectAll(sb, table) {
  const out = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from(table).select('*').range(from, from + 999)
    if (error) throw error
    out.push(...data)
    if (data.length < 1000) return out
  }
}

const env = readEnv()
const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY)
const [players, sessions, hands] = await Promise.all(['players', 'sessions', 'hands'].map(t => selectAll(sb, t)))
const rows = { players, sessions, hands }
const name = pid => {
  const p = players.find(x => x.id === pid)
  return p ? `${p.first_name} ${p.last_name ?? ''}`.trim() : 'Unknown'
}

const a = computeAnalytics(rows)
console.log(`\n${a.kpis.nights} nights · ${a.kpis.hands} hands · ${a.kpis.players} players\n`)
console.log('Player'.padEnd(22), 'Net $'.padStart(7), 'Hands'.padStart(6), 'Picks'.padStart(6), 'Nights'.padStart(7))
for (const pid of a.ranking) {
  const p = a.players[pid]
  console.log(name(pid).padEnd(22), String(p.net).padStart(7), String(p.hands).padStart(6), String(p.picks).padStart(6), String(p.nights).padStart(7))
}

console.log('\nPer night (net $ by player):')
for (const n of a.nightResults) {
  console.log(`  ${nightLabel(n.night)} — ${n.hands} hands: ` + n.players.map(r => `${name(r.pid)} ${r.net > 0 ? '+' : ''}${r.net}`).join(', '))
}

const results = []
const check = (label, ok, detail = '') => results.push({ label, ok, detail })

const total = Object.values(a.players).reduce((s, p) => s + p.net, 0)
check('All-player net sums to $0', Math.abs(total) < 0.001 && a.check.ok, `sum ${total.toFixed(2)}, stored deltas ${a.check.sum}`)

const may6 = a.allNights.filter(n => n.endsWith('-05-06'))
const may6Sessions = sessions.filter(s => normalize(rows).hands.some(h => h.sessionId === s.id && h.night === may6[0]))
check('May 6 counts as one night', may6.length === 1, `${may6.length} night key(s), ${may6Sessions.length} sessions`)

const ari = players.find(p => p.first_name === 'Ari')
if (ari && may6[0]) {
  const night = computeAnalytics(rows, { scope: may6[0] })
  const ap = night.players[ari.id]
  const norm = normalize(rows)
  const seated = norm.hands.filter(h => h.night === may6[0] && !h.isFup && h.seats.some(s => s.pid === ari.id))
  const satOut = seated.filter(h => h.seats.find(s => s.pid === ari.id).role === 'out').length
  check("Ari's May 6 hands count only when seated", ap?.hands === seated.length - satOut,
    `${ap?.hands} hands played (seated on ${seated.length}: #${seated.map(h => h.num).join(', #')}; sat out ${satOut}); net ${ap?.net}`)
}

// F-ups: none live, so inject a synthetic one into a copy and compare
const live = rows.sessions.find(s => rows.hands.some(h => h.session_id === s.id))
const offender = live.seat_order[0]
const fupRow = {
  id: 'synthetic-fup', session_id: live.id, hand_number: 999, hand_type: 'FUP',
  picker_name: offender, offender_id: offender, partner_name: null, is_alone: false,
  points: 0, tier: 'FUP', mult: 1,
  seat_deltas: live.seat_order.map((pid, i) => i === 0 ? -(live.seat_order.length - 1) : 1),
  seat_roles: live.seat_order.map((_, i) => i === 0 ? 'picker' : 'opp'),
  cracked_by: '', recracked_by: '', blitzes: {},
}
const withFup = computeAnalytics({ ...rows, hands: [...rows.hands, fupRow] })
const before = a.players[offender], after = withFup.players[offender]
check('F-ups add no picks or hands', after.picks === before.picks && after.hands === before.hands && withFup.kpis.hands === a.kpis.hands,
  `offender picks ${before.picks}→${after.picks}, hands ${before.hands}→${after.hands}, total hands ${a.kpis.hands}→${withFup.kpis.hands}`)
check('F-ups still count in net $ and F-up total', after.net === before.net - (live.seat_order.length - 1) && after.fups === before.fups + 1,
  `offender net ${before.net}→${after.net}, F-ups ${before.fups}→${after.fups}`)

console.log('\nChecks:')
results.forEach(r => console.log(`  ${r.ok ? 'PASS' : 'FAIL'}  ${r.label}${r.detail ? ` — ${r.detail}` : ''}`))

console.log(`\nData check: ${a.misaligned.length} hands with scores likely on the wrong seats:`)
const bySession = {}
a.misaligned.forEach(m => { (bySession[m.night] ??= []).push(m.num + (m.proven ? '' : '*')) })
Object.entries(bySession).forEach(([n, nums]) => console.log(`  ${nightLabel(n)}: #${nums.join(', #')}`))
console.log('  (* roles happen to agree, but the hand was saved before the same seat move)')

process.exit(results.every(r => r.ok) ? 0 : 1)
