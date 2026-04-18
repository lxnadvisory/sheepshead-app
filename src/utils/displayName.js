/**
 * Returns the smart display name for a player.
 * Uses first name by default; appends last initial if another player shares the same first name.
 *
 * @param {object[]} allPlayers  - full roster array (player objects with firstName/lastName)
 * @param {string}   pid         - player id
 * @returns {string}
 */
export function getDisplayName(allPlayers, pid) {
  const p = allPlayers.find(x => x.id === pid)
  if (!p) return pid
  const first = p.firstName ?? p.name ?? pid
  const hasDup = allPlayers.some(x => x.id !== pid && (x.firstName ?? x.name ?? '') === first)
  if (hasDup) {
    const last = p.lastName?.trim()
    if (last) return `${first} ${last[0]}.`
  }
  return first
}

/**
 * Returns "First Last" (or just "First" if no last name).
 */
export function getFullName(p) {
  if (!p) return ''
  const first = p.firstName ?? p.name ?? ''
  const last = p.lastName?.trim()
  return last ? `${first} ${last}` : first
}
