function hashCode(str) {
  let h = 0
  for (let i = 0; i < (str?.length ?? 0); i++) {
    h = ((h << 5) - h) + str.charCodeAt(i)
    h |= 0
  }
  return Math.abs(h)
}

/**
 * Circular avatar — shows uploaded photo or coloured initials.
 * @param {{ player: object, size?: number, style?: object }} props
 */
export default function Avatar({ player, size = 36, style = {} }) {
  const name   = player?.firstName ?? player?.name ?? '?'
  const hue    = hashCode(name) % 360
  const letter = name[0]?.toUpperCase() ?? '?'

  const base = {
    width: size, height: size,
    borderRadius: '50%',
    flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',
    ...style,
  }

  if (player?.photo) {
    return (
      <div style={base}>
        <img
          src={player.photo}
          alt={name}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      </div>
    )
  }

  return (
    <div style={{
      ...base,
      background: `hsl(${hue}, 45%, 28%)`,
      color: `hsl(${hue}, 60%, 80%)`,
      fontSize: Math.round(size * 0.4),
      fontWeight: 700,
      letterSpacing: '-0.02em',
    }}>
      {letter}
    </div>
  )
}
