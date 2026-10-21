import Avatar from '../components/Avatar'
import { chasing, nightLabel, MIN_TOGETHER } from '../lib/analytics'
import { Card, Money, PlayerName, ScopeFilter, StreakBadge, fmtBase, fmtRate, money } from '../components/analytics/ui'
import RunningMoney from '../components/analytics/RunningMoney'

const ordinal = n => {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

function Tile({ label, value, sub, color }) {
  return (
    <div className="an-tile">
      <div className="an-tile-label">{label}</div>
      <div className="an-tile-value an-num" style={color ? { color } : undefined}>{value}</div>
      {sub && <div className="an-tile-sub">{sub}</div>}
    </div>
  )
}

export default function PlayerProfile({ a, allTime, pid, ctx, scope, setScope, onBack }) {
  const p = a.players[pid]
  const single = a.single
  const scopeText = single ? nightLabel(a.night, { long: true }) : 'All-time'

  const top = (
    <div className="an-prof-top">
      <button type="button" className="an-back" onClick={onBack}>← All players</button>
      <ScopeFilter scope={scope} setScope={setScope} nights={a.allNights} compact />
    </div>
  )

  if (!p) {
    const known = !!allTime.players[pid]
    return (
      <>
        {top}
        <Card>
          <div className="an-prof-head">
            <Avatar player={ctx.player(pid)} size={72} />
            <div>
              <h1 className="an-prof-name">{ctx.name(pid)}</h1>
              <div className="an-prof-sub">{known ? `Didn't play · ${scopeText}` : 'No hands recorded yet'}</div>
            </div>
          </div>
        </Card>
      </>
    )
  }

  const inView = Object.keys(a.players).filter(id => a.players[id].hands > 0).length
  const nights = a.nightResults.filter(n => n.players.some(r => r.pid === pid)).reverse()
  const group = a.groupPickRate
  const chase = chasing(a, pid, 4)
  const lonerL = p.loners - p.lonerWins
  const pctOrCount = r => fmtRate(r, single)

  return (
    <>
      {top}

      <Card className="an-prof-card">
        <div className="an-prof-head">
          <Avatar player={ctx.player(pid)} size={76} />
          <div className="an-prof-id">
            <h1 className="an-prof-name">{ctx.name(pid)} <StreakBadge n={p.current} /></h1>
            <div className="an-prof-sub">
              {ordinal(p.rank)} of {inView} · {p.nights} night{p.nights === 1 ? '' : 's'} · {p.hands} hands
            </div>
          </div>
          <div className="an-prof-net">
            <Money value={p.net} className="an-hero" />
            <div className="an-prof-base">base <span className="an-num">{fmtBase(p.base)}</span></div>
          </div>
        </div>
      </Card>

      <Card title="Running money" aside={single ? 'by hand' : 'by night'}>
        <RunningMoney running={a.running} ctx={{ ...ctx, color: () => ctx.colorSlot(pid) != null ? ctx.color(pid) : 'var(--primary)' }} only={pid} minHeight={13} />
      </Card>

      <div className="an-tiles">
        <Tile label="Pick rate" value={pctOrCount(p.pickRate)}
          sub={[!single && `${p.picks} of ${p.hands} hands`, group != null && `group avg ${Math.round(group * 100)}%`].filter(Boolean).join(' · ')} />
        <Tile label="Picker win %" value={pctOrCount(p.pickWin)}
          sub={!single && p.picks ? `${p.pickWin.num} of ${p.picks} picks` : null} />
        <Tile label="$ per pick" value={p.perPick == null ? '—' : money(p.perPick)}
          color={p.perPick > 0 ? 'var(--success)' : p.perPick < 0 ? 'var(--danger)' : undefined}
          sub={p.picks ? `${money(p.pickNet)} on ${p.picks} picks` : 'no picks'} />
        <Tile label="Partner win %" value={pctOrCount(p.partnerWin)}
          sub={!single && p.partnerHands ? `${p.partnerWin.num} of ${p.partnerHands}` : null} />
        <Tile label="Defense bump rate" value={pctOrCount(p.defense)}
          sub={!single && p.defense.den ? `${p.defense.num} of ${p.defense.den} on defense` : null} />
        <Tile label="Cracks" value={p.cracks}
          sub={p.cracks ? `win ${pctOrCount(p.crackWin)} · ${money(p.crackNet)}` : 'none yet'} />
        <Tile label="Loners" value={p.loners ? `${p.lonerWins}–${lonerL}` : '—'}
          sub={p.loners ? money(p.lonerNet) : 'never gone alone'} />
        <Tile label="Longest streaks" value={<><span>🔥{p.hot}</span> <span className="an-muted">/</span> <span>🥶{p.cold}</span></>}
          sub="hot / cold hands in a row" />
      </div>

      <div className="an-prof-pair">
        <Card title="Best partner" aside={`min ${MIN_TOGETHER} hands`}>
          {p.bestPartner ? (
            <div className="an-pair">
              <PlayerName pid={p.bestPartner.pid} ctx={ctx} size={40} />
              <div className="an-pair-stat an-num">{Math.round(p.bestPartner.pct * 100)}%</div>
              <div className="an-pair-sub">{p.bestPartner.wins} of {p.bestPartner.hands} won together</div>
            </div>
          ) : <div className="an-muted">Not enough hands together yet.</div>}
        </Card>
        <Card title="Nemesis" aside="beat them most when they picked">
          {p.nemesis ? (
            <div className="an-pair">
              <PlayerName pid={p.nemesis.pid} ctx={ctx} size={40} />
              <div className="an-pair-stat an-num">{p.nemesis.count}×</div>
              <div className="an-pair-sub">on the winning defense, of {p.nemesis.picksLost} lost picks</div>
            </div>
          ) : <div className="an-muted">Never been bumped as picker.</div>}
        </Card>
      </div>

      <Card title="Night by night">
        <div className="an-nights">
          {nights.map(n => {
            const r = n.players.find(x => x.pid === pid)
            return (
              <div key={n.night} className="an-night">
                <div className="an-night-date">{nightLabel(n.night, { long: true })}</div>
                <div className="an-night-finish">{ordinal(r.rank)} of {n.players.length}</div>
                <div className="an-night-hands an-num">{r.hands} hands</div>
                <Money value={r.net} className="an-night-net" />
              </div>
            )
          })}
        </div>
      </Card>

      {chase.length > 0 && (
        <Card title="Chasing">
          <div className="an-chase">
            {chase.map(c => (
              <div key={c.award.id} className={`an-chase-item ${c.holds ? 'holds' : ''}`}>
                <span className="an-chase-emoji" aria-hidden>{c.award.emoji}</span>
                <div>
                  <div className="an-chase-title">{c.award.title}{c.holds ? ' · holding' : ''}</div>
                  <div className="an-chase-text">{c.text}</div>
                </div>
                {!c.holds && c.closeness > 0 && (
                  <span className="an-chase-bar" aria-hidden><span style={{ width: `${Math.min(100, Math.round(c.closeness * 100))}%` }} /></span>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}
    </>
  )
}
