import { MIN_TOGETHER } from '../../lib/analytics'

// Sequential blue, dark (low win %) → light (high win %) for the dark surface
const RAMP = ['#0d366b', '#104281', '#184f95', '#1c5cab', '#256abf', '#2a78d6', '#3987e5', '#5598e7', '#6da7ec', '#86b6ef']
const shade = pct => RAMP[Math.min(RAMP.length - 1, Math.floor(pct * RAMP.length))]
const inkOn = pct => Math.floor(pct * RAMP.length) >= 7 ? '#0b0b0b' : '#f1f5f9'

/** Picker rows × partner columns; shade = picker win % with that partner. */
export default function Heatmap({ chemistry, ctx }) {
  const { rows, cols, cell } = chemistry
  if (!rows.length) return <div className="an-empty">No partner hands yet.</div>
  return (
    <div className="an-scroll">
      <table className="an-heat">
        <thead>
          <tr>
            <th className="an-heat-corner"><span>Picker ↓</span><span>Partner →</span></th>
            {cols.map(c => (
              <th key={c} className="an-heat-col">
                <button type="button" className="an-linkish" onClick={() => ctx.openPlayer(c)}>{ctx.name(c)}</button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r}>
              <th className="an-heat-row">
                <button type="button" className="an-linkish" onClick={() => ctx.openPlayer(r)}>{ctx.name(r)}</button>
              </th>
              {cols.map(c => {
                const x = r === c ? null : cell(r, c)
                if (!x) return <td key={c} className="an-heat-cell an-heat-none" />
                const enough = x.hands >= MIN_TOGETHER
                const pct = x.wins / x.hands
                const title = `${ctx.name(r)} picking, ${ctx.name(c)} partner: won ${x.wins} of ${x.hands}`
                return (
                  <td key={c} className="an-heat-cell" title={title}
                    style={enough ? { background: shade(pct), color: inkOn(pct) } : undefined}>
                    {enough
                      ? <><span className="an-num">{Math.round(pct * 100)}%</span><span className="an-heat-n">{x.hands}</span></>
                      : <><span className="an-muted">—</span><span className="an-heat-n">{x.hands}</span></>}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="an-heat-legend">
        <span>Picker win %</span>
        <span className="an-heat-ramp">{RAMP.map(c => <i key={c} style={{ background: c }} />)}</span>
        <span className="an-muted">0% → 100% · small number = hands together · “—” under {MIN_TOGETHER}</span>
      </div>
    </div>
  )
}
