/**
 * Client-side keyword parser for Sheepshead voice input.
 * No external API calls — works entirely in the browser.
 */

// ── Levenshtein distance ──────────────────────────────────────────────────────
function lev(a, b) {
  if (a === b) return 0
  const m = a.length, n = b.length
  if (m === 0) return n
  if (n === 0) return m
  const row = Array.from({ length: n + 1 }, (_, i) => i)
  for (let i = 1; i <= m; i++) {
    let prev = i
    for (let j = 1; j <= n; j++) {
      const curr = a[i-1] === b[j-1] ? row[j-1] : 1 + Math.min(row[j], prev, row[j-1])
      row[j-1] = prev; prev = curr
    }
    row[n] = prev
  }
  return row[n]
}

// Allow 1 edit for names ≥ 4 chars; exact match for shorter
function fuzzy(input, target) {
  const d = lev(input.toLowerCase(), target.toLowerCase())
  return d <= (target.length >= 4 ? 1 : 0)
}

// ── Name variant building ─────────────────────────────────────────────────────
function getNameVariants(pid, getPlayer, getDisplayName) {
  const p = getPlayer(pid)
  if (!p) return []
  const first   = (p.firstName ?? p.name ?? '').toLowerCase().trim()
  const last    = (p.lastName ?? '').toLowerCase().trim()
  const display = getDisplayName(pid).toLowerCase()
  const variants = new Set([display])
  if (first)        variants.add(first)
  if (last)         variants.add(last)
  if (first && last) {
    variants.add(`${first} ${last}`)
    variants.add(`${first} ${last[0]}`)
  }
  return [...variants].filter(v => v.length >= 1)
}

// Returns { matches: [pid,...], ambiguous: bool } for a given text string
function findPlayers(text, players, getPlayer, getDisplayName) {
  const matches = players.filter(pid =>
    getNameVariants(pid, getPlayer, getDisplayName).some(v => fuzzy(text, v))
  )
  return { matches, ambiguous: matches.length > 1 }
}

// ── Keyword tables (pre-normalized: no apostrophes, no hyphens) ───────────────

// Multi-word phrases — checked longest-first before single-word keywords
const PHRASES = [
  { words: ['didnt',  'make', 'it'],              type: 'outcome',  value: 'bumped'      },
  { words: ['did',    'not',  'make', 'it'],       type: 'outcome',  value: 'bumped'      },
  { words: ['picker', 'got',  'no',   'tricks'],   type: 'modifier', value: 'smith'       },
  { words: ['shed',   'clean'],                    type: 'outcome',  value: 'shedClean'   },
  { words: ['all',    'tricks'],                   type: 'outcome',  value: 'shedClean'   },
  { words: ['picker', 'no',   'tricks'],           type: 'modifier', value: 'smith'       },
  { words: ['picker', 'zero', 'tricks'],           type: 'modifier', value: 'smith'       },
  { words: ['no',     'tricks'],                   type: 'outcome',  value: 'noTricks'    },
  { words: ['barn',   'clean'],                    type: 'outcome',  value: 'noTricks'    },
  { words: ['no',     'schneider'],                type: 'outcome',  value: 'noSchneider' },
  { words: ['smith',  'rule'],                     type: 'modifier', value: 'smith'       },
  { words: ['made',   'it'],                       type: 'outcome',  value: 'won'         },
  { words: ['got',    'it'],                       type: 'outcome',  value: 'won'         },
  { words: ['last',   'round'],                    type: 'modifier', value: 'lastRound'   },
  { words: ['black',  'blitz'],                    type: 'blitz',    value: 'black'       },
  { words: ['blitz',  'black'],                    type: 'blitz',    value: 'black'       },
  { words: ['red',    'blitz'],                    type: 'blitz',    value: 'red'         },
  { words: ['blitz',  'red'],                      type: 'blitz',    value: 'red'         },
  { words: ['re',     'crack'],                    type: 'modifier', value: 'recrack'     },
  { words: ['re',     'cracked'],                  type: 'modifier', value: 'recrack'     },
].sort((a, b) => b.words.length - a.words.length)  // longest first

// Single-word keywords
const WORD_KW = {
  pick:      { type: 'role',     value: 'pick'     },
  picker:    { type: 'role',     value: 'pick'     },
  picked:    { type: 'role',     value: 'pick'     },
  picks:     { type: 'role',     value: 'pick'     },
  partner:   { type: 'role',     value: 'partner'  },
  with:      { type: 'role',     value: 'partner'  },
  alone:     { type: 'role',     value: 'alone'    },
  loner:     { type: 'role',     value: 'alone'    },
  solo:      { type: 'role',     value: 'alone'    },
  won:       { type: 'outcome',  value: 'won'      },
  win:       { type: 'outcome',  value: 'won'      },
  lost:      { type: 'outcome',  value: 'bumped'   },
  bumped:    { type: 'outcome',  value: 'bumped'   },
  set:       { type: 'outcome',  value: 'bumped'   },
  clean:     { type: 'outcome',  value: 'shedClean'},
  crack:     { type: 'modifier', value: 'crack'    },
  cracked:   { type: 'modifier', value: 'crack'    },
  cracks:    { type: 'modifier', value: 'crack'    },
  recrack:   { type: 'modifier', value: 'recrack'  },
  recracked: { type: 'modifier', value: 'recrack'  },
  blitz:     { type: 'blitz',    value: 'both'     },
  blitzed:   { type: 'blitz',    value: 'both'     },
  doubler:   { type: 'modifier', value: 'doubler'  },
  double:    { type: 'modifier', value: 'doubler'  },
}

// Outcome → points config
const OUTCOME = {
  won:         { points: 75,  exact: false, shedClean: false, noTricks: false },
  bumped:      { points: 45,  exact: false, shedClean: false, noTricks: false },
  noSchneider: { points: 15,  exact: false, shedClean: false, noTricks: false },
  noTricks:    { points: 0,   exact: true,  shedClean: false, noTricks: true  },
  shedClean:   { points: 120, exact: true,  shedClean: true,  noTricks: false },
}

// ── Tokenizer ─────────────────────────────────────────────────────────────────
function tokenize(words, players, getPlayer, getDisplayName) {
  const tokens = []
  let i = 0
  while (i < words.length) {
    let hit = false

    // 1. Multi-word phrase match
    for (const ph of PHRASES) {
      const len = ph.words.length
      if (i + len <= words.length && ph.words.every((w, j) => w === words[i + j])) {
        tokens.push({ type: ph.type, value: ph.value, pos: i, span: len })
        i += len; hit = true; break
      }
    }
    if (hit) continue

    // 2. Two-word name match (before single-word keywords, prefer longer name)
    if (i + 1 < words.length) {
      const two = words[i] + ' ' + words[i + 1]
      const r = findPlayers(two, players, getPlayer, getDisplayName)
      if (r.matches.length > 0) {
        tokens.push({ type: 'name', matches: r.matches, ambiguous: r.ambiguous, text: two, pos: i, span: 2 })
        i += 2; hit = true
      }
    }
    if (hit) continue

    // 3. Single-word keyword
    const w = words[i]
    if (WORD_KW[w]) {
      tokens.push({ type: WORD_KW[w].type, value: WORD_KW[w].value, pos: i, span: 1 })
      i++; continue
    }

    // 4. Single-word name match
    const r1 = findPlayers(w, players, getPlayer, getDisplayName)
    if (r1.matches.length > 0) {
      tokens.push({ type: 'name', matches: r1.matches, ambiguous: r1.ambiguous, text: w, pos: i, span: 1 })
      i++; continue
    }

    // 5. Number (digit string or "zero")
    const num = (w === 'zero' || w === 'oh') ? 0 : parseInt(w, 10)
    if (!isNaN(num) && num >= 0 && num <= 120) {
      tokens.push({ type: 'number', value: num, pos: i, span: 1 })
      i++; continue
    }

    // 6. Unknown
    tokens.push({ type: 'unknown', word: w, pos: i, span: 1 })
    i++
  }
  return tokens
}

// ── Role assignment helpers ───────────────────────────────────────────────────
// Find the nearest unassigned name token (by word-index distance)
function nearest(nameTokens, pos, used) {
  let best = null, bestDist = Infinity
  for (const nt of nameTokens) {
    if (used.has(nt.pos)) continue
    const d = Math.abs(nt.pos - pos)
    if (d < bestDist) { bestDist = d; best = nt }
  }
  return best
}

// ── Main export ───────────────────────────────────────────────────────────────
/**
 * Parse a voice transcript into hand-entry fields.
 *
 * @param {string}   transcript
 * @param {string[]} players        Active player IDs for this session
 * @param {Function} getPlayer      (pid) => player object
 * @param {Function} getDisplayName (pid) => string
 * @returns {{ fields, status, messages, summary }}
 */
export function parseVoiceCommand(transcript, players, getPlayer, getDisplayName) {
  // Normalize: lowercase, remove punctuation except apostrophes/hyphens,
  // then remove apostrophes and convert hyphens to spaces
  const words = transcript
    .toLowerCase()
    .replace(/[^a-z0-9'\-\s]/g, ' ')
    .replace(/'/g, '')
    .replace(/-/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)

  if (words.length === 0) {
    return {
      fields:   { picker: null, partner: null, isLoner: false, pickerPoints: null, shedClean: false, pickerNoTricks: false, doublerCount: 0, crackers: [], recrackers: [], blitzes: {}, lastRound: false },
      status:   'warning',
      messages: ['No speech detected'],
      summary:  'Nothing heard — try again',
    }
  }

  const tokens = tokenize(words, players, getPlayer, getDisplayName)
  const byType = (t) => tokens.filter(x => x.type === t)
  const byValue = (t, v) => tokens.filter(x => x.type === t && x.value === v)

  const nameTokens = byType('name')
  const used = new Set()   // name token positions consumed by role/modifier assignment

  const fields = {
    picker:         null,
    partner:        null,
    isLoner:        false,
    pickerPoints:   null,
    shedClean:      false,
    pickerNoTricks: false,
    smith:          false,
    doublerCount:   0,
    crackers:       [],
    recrackers:     [],
    blitzes:        {},
    lastRound:      false,
  }

  const messages = []
  let pointsExact = false
  let hasAmbiguity = false
  let hasUnresolved = false

  // Helper: claim a name token for a role
  function claim(tok) {
    if (!tok) return null
    if (tok.ambiguous) {
      hasAmbiguity = true
      messages.push(`Ambiguous name "${tok.text}" — couldn't tell which player`)
      used.add(tok.pos)
      return null
    }
    used.add(tok.pos)
    return tok.matches[0]
  }

  // ── Role assignment ───────────────────────────────────────────────────────

  // "alone/loner/solo": implies picker = nearest name, isLoner = true
  const aloneToken = byValue('role', 'alone')[0]
  if (aloneToken) {
    fields.isLoner = true
    const pid = claim(nearest(nameTokens, aloneToken.pos, used))
    if (pid) fields.picker = pid
  }

  // "pick": nearest name is picker
  const pickToken = byValue('role', 'pick')[0]
  if (pickToken && !fields.picker) {
    const nt = nearest(nameTokens, pickToken.pos, used)
    if (nt) {
      const pid = claim(nt)
      if (pid) fields.picker = pid
    } else {
      hasUnresolved = true
      messages.push('Heard "pick" but no player name nearby')
    }
  }

  // "partner/with": nearest unassigned name (skip if loner)
  if (!fields.isLoner) {
    const partnerToken = byValue('role', 'partner')[0]
    if (partnerToken) {
      const nt = nearest(nameTokens, partnerToken.pos, used)
      if (nt) {
        const pid = claim(nt)
        if (pid) fields.partner = pid
      } else {
        hasUnresolved = true
        messages.push('Heard "partner" but no player name nearby')
      }
    }
  }

  // ── Outcome / points ──────────────────────────────────────────────────────

  // Explicit number overrides all tier estimates
  const numTokens = byType('number')
  if (numTokens.length > 0) {
    fields.pickerPoints = numTokens[numTokens.length - 1].value  // use last number
    pointsExact = true
  }

  // Outcome keywords (higher specificity wins: shed clean > no tricks > no schneider > won/bumped)
  const scToken  = byValue('outcome', 'shedClean')[0]
  const ntToken  = byValue('outcome', 'noTricks')[0]
  const nsToken  = byValue('outcome', 'noSchneider')[0]
  const wonToken = byValue('outcome', 'won')[0]
  const bmpToken = byValue('outcome', 'bumped')[0]

  const hasOutcome = !!(scToken || ntToken || nsToken || wonToken || bmpToken || numTokens.length > 0)

  if (scToken) {
    fields.shedClean = true
    if (!pointsExact) { fields.pickerPoints = 120; pointsExact = true }
  }
  if (ntToken) {
    fields.pickerNoTricks = true; fields.shedClean = false
    if (!pointsExact) { fields.pickerPoints = 0; pointsExact = true }
  }
  if (!pointsExact) {
    if (nsToken) {
      fields.pickerPoints = 15
      messages.push('Estimated 15 pts (no schneider) — enter exact count if known')
    } else if (wonToken) {
      fields.pickerPoints = 75
      messages.push('Estimated 75 pts (won) — enter exact count if known')
    } else if (bmpToken) {
      fields.pickerPoints = 45
      messages.push('Estimated 45 pts (bumped) — enter exact count if known')
    }
  }

  // ── Multiplier modifiers ──────────────────────────────────────────────────

  // Doubler — count tokens, no player
  const doublerTokens = byValue('modifier', 'doubler')
  if (doublerTokens.length > 0) fields.doublerCount = Math.min(doublerTokens.length, 4)

  // Last round — no player
  if (byValue('modifier', 'lastRound').length > 0) fields.lastRound = true

  // Crack — nearest unassigned name (not picker)
  for (const ct of byValue('modifier', 'crack')) {
    const nt = nearest(nameTokens, ct.pos, used)
    if (nt) {
      const pid = claim(nt)
      if (pid && pid !== fields.picker && !fields.crackers.includes(pid)) {
        fields.crackers.push(pid)
      }
    } else {
      hasUnresolved = true
      messages.push('Heard "crack" but no player name nearby')
    }
  }

  // Re-crack — nearest unassigned name (picker or partner side)
  for (const rt of byValue('modifier', 'recrack')) {
    const nt = nearest(nameTokens, rt.pos, used)
    if (nt) {
      const pid = claim(nt)
      if (pid && !fields.recrackers.includes(pid)) fields.recrackers.push(pid)
    } else {
      hasUnresolved = true
      messages.push('Heard "re-crack" but no player name nearby')
    }
  }

  // Blitz — nearest unassigned name with color
  for (const bt of byType('blitz')) {
    const nt = nearest(nameTokens, bt.pos, used)
    if (nt) {
      const pid = claim(nt)
      if (pid) {
        const existing = fields.blitzes[pid] ?? { black: false, red: false }
        if      (bt.value === 'black') fields.blitzes[pid] = { ...existing, black: true }
        else if (bt.value === 'red')   fields.blitzes[pid] = { ...existing, red:   true }
        else                           fields.blitzes[pid] = { black: true,  red:   true }
      }
    } else {
      hasUnresolved = true
      messages.push('Heard "blitz" but no player name nearby')
    }
  }

  // Smith Rule — phrase-triggered modifier (bare "smith" stays a player name)
  if (byValue('modifier', 'smith').length > 0) {
    fields.smith = true
    if (!hasOutcome) {
      fields.pickerPoints = 45
      messages.push('Smith Rule set with no outcome — assumed loss (BUMPED). Type exact points if different.')
    } else if (wonToken && !scToken) {
      messages.push('Smith Rule on a WIN is rare — verify this is correct.')
    }
  }

  // ── Missing-field warnings ────────────────────────────────────────────────
  if (!fields.picker) messages.push('No picker identified')
  if (!fields.isLoner && !fields.partner) messages.push('No partner identified — say name + "partner", or "alone"')
  if (fields.pickerPoints === null) messages.push('No outcome detected — adjust points manually')

  // ── Status ────────────────────────────────────────────────────────────────
  const isClean =
    fields.picker !== null &&
    (fields.isLoner || fields.partner !== null) &&
    pointsExact &&
    !hasAmbiguity &&
    !hasUnresolved

  const status = isClean ? 'clean' : 'warning'

  // ── Human summary ─────────────────────────────────────────────────────────
  const parts = []
  if (fields.picker)          parts.push(`${getDisplayName(fields.picker)} picker`)
  if (fields.isLoner)         parts.push('loner')
  else if (fields.partner)    parts.push(`${getDisplayName(fields.partner)} partner`)
  if (fields.pickerPoints !== null) {
    parts.push(`${fields.pickerPoints} pts${!pointsExact ? ' (est.)' : ''}`)
  }
  if (fields.shedClean)       parts.push('shed clean')
  if (fields.pickerNoTricks)  parts.push('no tricks')
  if (fields.smith)           parts.push('smith rule')

  const summary = parts.length > 0
    ? `Parsed: ${parts.join(', ')}`
    : 'Could not parse — fill in manually'

  return { fields, status, messages, summary }
}
