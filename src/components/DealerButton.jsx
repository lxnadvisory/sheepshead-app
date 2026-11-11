/** The dealer marker: a white disc with a bold black "D", like a poker dealer button. */
export default function DealerButton({ size = 18, style = {}, title = 'Dealer' }) {
  return (
    <span title={title} aria-label={title} style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: '#ffffff', color: '#000000',
      border: `${Math.max(1, Math.round(size / 18))}px solid #1f2937`,
      boxShadow: '0 1px 3px rgba(0,0,0,0.6)',
      fontSize: Math.round(size * 0.58), fontWeight: 900, lineHeight: 1,
      fontFamily: 'Arial, Helvetica, sans-serif',
      ...style,
    }}>D</span>
  )
}
