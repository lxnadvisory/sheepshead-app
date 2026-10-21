import { useEffect, useMemo, useRef, useState } from 'react'
import { nightLabel } from '../../lib/analytics'
import { money } from './ui'

function niceTicks(min, max, count = 5) {
  const span = max - min || 1
  const step0 = span / count
  const mag = Math.pow(10, Math.floor(Math.log10(step0)))
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => span / s <= count) ?? 10 * mag
  const lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step
  const ticks = []
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.round(v * 100) / 100)
  return ticks
}

function useSize(ref) {
  const [size, setSize] = useState({ w: 0, fs: 14 })
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => setSize({ w: el.clientWidth, fs: parseFloat(getComputedStyle(el).fontSize) || 14 })
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref])
  return size
}

/**
 * Cumulative net $ per player, one line each, labeled at the line ends.
 * Hover/tap shows a crosshair with everyone's running total at that point;
 * hovering a line or label isolates it; tapping a label opens the profile.
 */
export default function RunningMoney({ running, ctx, only = null, minHeight = 18 }) {
  const wrapRef = useRef(null)
  const { w, fs } = useSize(wrapRef)
  const [hoverIdx, setHoverIdx] = useState(null)
  const [hl, setHl] = useState(null)

  const series = useMemo(() => {
    const list = running.series.filter(s => s.points.length && (!only || s.pid === only))
    // Grey lines underneath, coloured on top
    return list.sort((a, b) => (ctx.colorSlot(a.pid) == null ? 0 : 1) - (ctx.colorSlot(b.pid) == null ? 0 : 1))
  }, [running, only, ctx])

  const xsN = running.xs.length
  const labelGap = fs * 1.3
  const height = Math.max(fs * minHeight, only ? 0 : series.length * labelGap + fs * 3)
  const longest = Math.max(4, ...series.map(s => (ctx.name(s.pid) + money(s.points.at(-1).y)).length + 1))
  const m = { l: fs * 3.2, r: only ? fs * 4.5 : Math.min(w * 0.42, longest * fs * 0.58 + fs * 1.6), t: fs * 0.8, b: fs * 2 }
  const iw = Math.max(10, w - m.l - m.r), ih = Math.max(10, height - m.t - m.b)

  const ys = series.flatMap(s => s.points.map(p => p.y))
  const ticks = niceTicks(Math.min(0, ...ys), Math.max(0, ...ys))
  const y0 = ticks[0], y1 = ticks[ticks.length - 1]
  const X = i => m.l + (xsN > 1 ? (i / (xsN - 1)) * iw : iw / 2)
  const Y = v => m.t + ih - ((v - y0) / (y1 - y0 || 1)) * ih

  // End labels: sorted by height, pushed apart so they never overlap; a leader
  // line joins a moved label back to its line end.
  const labels = useMemo(() => {
    const ls = series.map(s => {
      const last = s.points.at(-1)
      return { pid: s.pid, x: X(last.x), y: Y(last.y), ly: Y(last.y), value: last.y }
    }).sort((a, b) => a.y - b.y)
    // Keep every label inside the plot band: push down from the top, then up from the bottom
    const top = m.t + labelGap / 2, bottom = m.t + ih
    ls.forEach((l, i) => { l.ly = Math.max(l.ly, top, i ? ls[i - 1].ly + labelGap : top) })
    for (let i = ls.length - 1; i >= 0; i--) {
      ls[i].ly = Math.min(ls[i].ly, i === ls.length - 1 ? bottom : ls[i + 1].ly - labelGap)
    }
    return ls
  }, [series, w, height]) // eslint-disable-line react-hooks/exhaustive-deps

  const xLabel = i => {
    const x = running.xs[i]
    if (!x || !x.label) return ''
    return running.mode === 'night' ? nightLabel(x.label) : x.label
  }
  const every = Math.max(1, Math.ceil((xsN * fs * 4.2) / Math.max(iw, 1)))

  const onMove = e => {
    const r = e.currentTarget.getBoundingClientRect()
    const px = e.clientX - r.left            // relative to the plot rect
    const i = Math.max(0, Math.min(xsN - 1, Math.round((px / iw) * (xsN - 1))))
    setHoverIdx(i)
    // Isolate the line under the pointer, if one is close
    const py = e.clientY - r.top + m.t
    let near = null, best = fs
    series.forEach(s => { const pt = s.points.find(q => q.x === i); if (pt && Math.abs(Y(pt.y) - py) < best) { best = Math.abs(Y(pt.y) - py); near = s.pid } })
    setHl(near)
  }

  const tip = hoverIdx == null ? null : series
    .map(s => ({ pid: s.pid, p: s.points.find(p => p.x === hoverIdx) }))
    .filter(r => r.p).sort((a, b) => b.p.y - a.p.y)

  const colorOf = pid => ctx.color(pid)
  const dim = pid => hl && hl !== pid

  return (
    <div ref={wrapRef} className="an-chart" onPointerLeave={() => { setHoverIdx(null); setHl(null) }}>
      {w > 0 && (
        <svg width={w} height={height} role="img" aria-label="Running money by player">
          {ticks.map(t => (
            <g key={t}>
              <line x1={m.l} x2={m.l + iw} y1={Y(t)} y2={Y(t)} stroke={t === 0 ? '#5b6478' : 'var(--border)'} strokeWidth={t === 0 ? 1.5 : 1} />
              <text x={m.l - fs * 0.5} y={Y(t)} dy="0.32em" textAnchor="end" className="an-axis">{money(t, { sign: false })}</text>
            </g>
          ))}
          {running.xs.map((x, i) => (i > 0 && (i % every === 0 || i === xsN - 1)) && (
            <text key={i} x={X(i)} y={height - fs * 0.5} textAnchor="middle" className="an-axis">{xLabel(i)}</text>
          ))}

          {hoverIdx != null && <line x1={X(hoverIdx)} x2={X(hoverIdx)} y1={m.t} y2={m.t + ih} stroke="var(--text-secondary)" strokeWidth={1} opacity={0.5} />}

          {series.map(s => {
            const d = s.points.map((p, k) => `${k ? 'L' : 'M'}${X(p.x).toFixed(1)},${Y(p.y).toFixed(1)}`).join(' ')
            const grey = ctx.colorSlot(s.pid) == null && !only
            return (
              <g key={s.pid} opacity={dim(s.pid) ? 0.18 : 1} style={{ transition: 'opacity .15s' }}>
                <path d={d} fill="none" stroke={colorOf(s.pid)} strokeWidth={hl === s.pid ? 3.5 : grey ? 1.5 : 2.5}
                  strokeLinejoin="round" strokeLinecap="round" />
                <circle cx={X(s.points.at(-1).x)} cy={Y(s.points.at(-1).y)} r={4} fill={colorOf(s.pid)} stroke="var(--bg-surface)" strokeWidth={2} />
              </g>
            )
          })}

          {hoverIdx != null && tip.map(r => (
            <circle key={r.pid} cx={X(hoverIdx)} cy={Y(r.p.y)} r={4} fill={colorOf(r.pid)} stroke="var(--bg-surface)" strokeWidth={2} opacity={dim(r.pid) ? 0.2 : 1} />
          ))}

          <rect x={m.l} y={m.t} width={iw} height={ih} fill="transparent"
            onPointerMove={onMove} onPointerDown={onMove} />

          {labels.map(l => (
            <g key={l.pid} className="an-endlabel" opacity={dim(l.pid) ? 0.25 : 1}
              onPointerEnter={() => setHl(l.pid)} onClick={() => ctx.openPlayer(l.pid)}>
              {Math.abs(l.ly - l.y) > 1 && !only && (
                <polyline points={`${l.x + 5},${l.y} ${m.l + iw + fs * 0.6},${l.ly}`} fill="none" stroke={colorOf(l.pid)} strokeWidth={1} opacity={0.6} />
              )}
              <rect x={m.l + iw + fs * 0.6} y={l.ly - labelGap / 2} width={m.r - fs * 0.6} height={labelGap} fill="transparent" />
              {!only && <rect x={m.l + iw + fs * 0.8} y={l.ly - 1.5} width={fs * 0.7} height={3} rx={1.5} fill={colorOf(l.pid)} />}
              <text x={m.l + iw + fs * (only ? 0.7 : 1.8)} y={l.ly} dy="0.34em" className="an-endlabel-text">
                {!only && <tspan className="an-endlabel-name">{ctx.name(l.pid)} </tspan>}
                <tspan className="an-num" fill={l.value > 0 ? 'var(--success)' : l.value < 0 ? 'var(--danger)' : 'var(--text-secondary)'}>{money(l.value)}</tspan>
              </text>
            </g>
          ))}
        </svg>
      )}

      {hoverIdx != null && tip.length > 0 && (
        <div className="an-tip" style={{ left: Math.min(X(hoverIdx) + 12, Math.max(0, w - fs * 13)), top: m.t }}>
          <div className="an-tip-title">{running.mode === 'night' ? (hoverIdx === 0 ? 'Start' : nightLabel(running.xs[hoverIdx].label, { long: true })) : (hoverIdx === 0 ? 'Start' : `Hand ${hoverIdx} (${running.xs[hoverIdx].label})`)}</div>
          {tip.slice(0, 12).map(r => (
            <div key={r.pid} className="an-tip-row">
              <span className="an-tip-key" style={{ background: colorOf(r.pid) }} />
              <span className="an-tip-name">{ctx.name(r.pid)}</span>
              <span className="an-num">{money(r.p.y)}</span>
            </div>
          ))}
          {tip.length > 12 && <div className="an-tip-more">+{tip.length - 12} more</div>}
        </div>
      )}
    </div>
  )
}
