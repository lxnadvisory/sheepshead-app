const STORAGE_KEYS = ['shed:players', 'shed:sessions']

/** Read all app data from localStorage and trigger a browser download. */
export function exportData() {
  const snapshot = { _v: 1, _ts: new Date().toISOString() }
  STORAGE_KEYS.forEach(k => {
    try { snapshot[k] = JSON.parse(localStorage.getItem(k) ?? 'null') }
    catch { snapshot[k] = null }
  })

  const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = `sheepshead-backup-${new Date().toISOString().slice(0, 10)}.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/** Returns null if valid, or an error message string if invalid. */
export function validateBackup(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj))
    return 'Not a valid backup file.'
  if (!Array.isArray(obj['shed:players']))
    return 'Missing or invalid player roster.'
  if (!Array.isArray(obj['shed:sessions']))
    return 'Missing or invalid sessions data.'
  if (obj['shed:players'].some(p => typeof p.id !== 'string'))
    return 'Backup contains invalid player data.'
  return null
}

/**
 * Reads and validates a .json file.
 * Resolves with the parsed object, or rejects with an Error.
 */
export function readBackupFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = e => {
      try {
        const obj = JSON.parse(e.target.result)
        const err = validateBackup(obj)
        if (err) { reject(new Error(err)); return }
        resolve(obj)
      } catch {
        reject(new Error('Could not parse file — make sure it is a valid sheepshead backup.'))
      }
    }
    reader.onerror = () => reject(new Error('Could not read the file.'))
    reader.readAsText(file)
  })
}

/** Writes validated backup data to localStorage. Caller should reload after this. */
export function applyBackup(obj) {
  STORAGE_KEYS.forEach(k => {
    if (obj[k] != null) localStorage.setItem(k, JSON.stringify(obj[k]))
  })
}
