// Compact inline icons for crack / re-crack / blitz / loner attribution on a hand.
// Used in HandItem (GameNightPage) and Scoreboard cells.
export default function HandIcons({ hand, pid, size = 11, showLoner = false }) {
  const isCracker   = (hand.crackers   ?? []).includes(pid)
  const isRecracker = (hand.recrackers ?? []).includes(pid)
  const blkBlitz    = hand.blitzes?.[pid]?.black ?? false
  const redBlitz    = hand.blitzes?.[pid]?.red   ?? false
  const isLoner     = showLoner && hand.isLoner && pid === hand.picker

  if (!isCracker && !isRecracker && !blkBlitz && !redBlitz && !isLoner) return null

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 1, fontSize: size, lineHeight: 1, verticalAlign: 'middle' }}>
      {isLoner     && <span title="Loner">🐺</span>}
      {isCracker   && <span title="Cracked"     style={{ color: '#f97316' }}>👊</span>}
      {isRecracker && <span title="Re-cracked"  style={{ color: '#a855f7' }}>👊</span>}
      {blkBlitz    && <span title="Black Blitz" style={{ color: '#6b7280', fontFamily: 'monospace' }}>♠♣</span>}
      {redBlitz    && <span title="Red Blitz"   style={{ color: '#ef4444', fontFamily: 'monospace' }}>♥♦</span>}
    </span>
  )
}
