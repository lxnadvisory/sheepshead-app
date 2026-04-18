import { useState, useRef, useEffect } from 'react'
import { useStore } from './store/useStore'
import RosterPage    from './pages/RosterPage'
import GameNightPage from './pages/GameNightPage'
import AnalyticsPage from './pages/AnalyticsPage'
import DisplayMode   from './components/DisplayMode'
import { exportData, readBackupFile, applyBackup } from './utils/backup'

const TABS = [
  { id: 'game',      label: 'Game Night',  icon: '♠' },
  { id: 'roster',    label: 'Roster',      icon: '♟' },
  { id: 'analytics', label: 'Stats',       icon: '◈' },
]

export default function App() {
  const [tab, setTab] = useState('game')

  // TV Display mode
  const [showDisplay, setShowDisplay] = useState(false)

  // Settings dropdown
  const [showSettings,  setShowSettings]  = useState(false)
  const [confirmImport, setConfirmImport] = useState(null)  // parsed backup object awaiting confirm
  const [appToast,      setAppToast]      = useState(null)  // { msg, color, key }
  const settingsRef = useRef(null)
  const importRef   = useRef(null)

  const store = useStore()
  const activeSession = store.getActiveSession()

  // Close settings on outside click
  useEffect(() => {
    if (!showSettings) return
    const close = (e) => {
      if (!settingsRef.current?.contains(e.target)) setShowSettings(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [showSettings])

  const showToast = (msg, color = 'var(--success)') =>
    setAppToast({ msg, color, key: Date.now() })

  const handleExport = () => {
    exportData()
    setShowSettings(false)
    showToast('✓ Backup downloaded')
  }

  const handleImportFile = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setShowSettings(false)
    try {
      const data = await readBackupFile(file)
      setConfirmImport(data)
    } catch (err) {
      showToast(err.message, 'var(--danger)')
    }
  }

  const doImport = () => {
    applyBackup(confirmImport)
    setConfirmImport(null)
    window.location.reload()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      {/* Top bar */}
      <header style={{
        background: 'var(--bg-surface)',
        borderBottom: '1px solid var(--border)',
        padding: '12px 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        position: 'sticky',
        top: 0,
        zIndex: 50,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 22 }}>♠</span>
          <div>
            <div style={{ fontWeight: 800, fontSize: 17, letterSpacing: '-0.01em' }}>The Shed</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.04em' }}>SHEEPSHEAD</div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {activeSession && (
            <span className="badge badge-success">
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor', display: 'inline-block' }} />
              Live
            </span>
          )}

          {/* TV Display */}
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setShowDisplay(true)}
            title="Open TV display mode"
            style={{ gap: 5, fontSize: 12, opacity: 0.75 }}
          >
            <span style={{ fontSize: 14 }}>📺</span>
            <span>TV</span>
          </button>

          {/* Settings */}
          <div ref={settingsRef} style={{ position: 'relative' }}>
            <button
              className="btn btn-ghost btn-icon btn-sm"
              onClick={() => setShowSettings(s => !s)}
              title="Data backup / restore"
              style={{ fontSize: 15, opacity: showSettings ? 1 : 0.7 }}
            >
              ⚙
            </button>

            {showSettings && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 6px)', right: 0,
                background: 'var(--bg-surface)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
                boxShadow: 'var(--shadow-lg)',
                padding: 6,
                minWidth: 168,
                zIndex: 200,
                display: 'flex', flexDirection: 'column', gap: 2,
              }}>
                <div style={{ padding: '4px 10px 6px', fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Data
                </div>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={handleExport}
                  style={{ justifyContent: 'flex-start', width: '100%' }}
                >
                  ↓ Export Backup
                </button>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => importRef.current?.click()}
                  style={{ justifyContent: 'flex-start', width: '100%' }}
                >
                  ↑ Import Backup
                </button>
                <input
                  ref={importRef}
                  type="file"
                  accept=".json"
                  style={{ display: 'none' }}
                  onChange={handleImportFile}
                />
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Page content */}
      <main style={{ flex: 1, paddingBottom: 72 }}>
        {tab === 'game'      && <GameNightPage
          players={store.players}
          sessions={store.sessions}
          startSession={store.startSession}
          endSession={store.endSession}
          deleteSession={store.deleteSession}
          addHand={store.addHand}
          updateHand={store.updateHand}
          deleteHand={store.deleteHand}
          activateLastRound={store.activateLastRound}
          addSessionPlayer={store.addSessionPlayer}
          getPlayer={store.getPlayer}
          getDisplayName={store.getDisplayName}
          getActiveSession={store.getActiveSession}
          getSessionTotals={store.getSessionTotals}
          onShowDisplay={() => setShowDisplay(true)}
        />}
        {tab === 'roster'    && <RosterPage
          players={store.players}
          addPlayer={store.addPlayer}
          updatePlayer={store.updatePlayer}
          removePlayer={store.removePlayer}
        />}
        {tab === 'analytics' && <AnalyticsPage
          players={store.players}
          sessions={store.sessions}
          getPlayer={store.getPlayer}
          getDisplayName={store.getDisplayName}
          getAnalytics={store.getAnalytics}
        />}
      </main>

      {/* Bottom nav */}
      <nav style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        background: 'var(--bg-surface)',
        borderTop: '1px solid var(--border)',
        display: 'flex',
        zIndex: 50,
      }}>
        {TABS.map(t => {
          const active = tab === t.id
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 4,
                padding: '10px 0 14px',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: active ? 'var(--primary)' : 'var(--text-muted)',
                fontSize: 13,
                fontWeight: active ? 700 : 500,
                transition: 'color 0.15s',
                position: 'relative',
              }}
            >
              {active && (
                <div style={{
                  position: 'absolute',
                  top: 0, left: '50%',
                  transform: 'translateX(-50%)',
                  width: 36, height: 2,
                  background: 'var(--primary)',
                  borderRadius: '0 0 2px 2px',
                }} />
              )}
              <span style={{ fontSize: 18 }}>{t.icon}</span>
              <span style={{ fontSize: 11, letterSpacing: '0.02em' }}>{t.label}</span>
              {t.id === 'game' && activeSession && (
                <span style={{
                  position: 'absolute', top: 6, right: 'calc(50% - 18px)',
                  width: 7, height: 7, borderRadius: '50%',
                  background: 'var(--success)',
                  border: '1.5px solid var(--bg-surface)',
                }} />
              )}
            </button>
          )
        })}
      </nav>

      {/* Import confirmation modal */}
      {confirmImport && (
        <div className="modal-overlay" onClick={() => setConfirmImport(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <div className="modal-header">
              <span style={{ fontWeight: 800, fontSize: 16 }}>Replace all data?</span>
              <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setConfirmImport(null)}>✕</button>
            </div>
            <div className="modal-body">
              <p style={{ color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.65 }}>
                This will replace your current roster, all sessions, and all hand history with the contents of the backup file. This cannot be undone.
              </p>
              <div style={{ marginTop: 12, padding: '10px 14px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', fontSize: 13, color: 'var(--text-muted)' }}>
                Backup contains{' '}
                <strong style={{ color: 'var(--text-secondary)' }}>{confirmImport['shed:players']?.length ?? 0} players</strong>
                {' '}and{' '}
                <strong style={{ color: 'var(--text-secondary)' }}>{confirmImport['shed:sessions']?.length ?? 0} sessions</strong>.
                {confirmImport._ts && (
                  <span> Exported {new Date(confirmImport._ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}.</span>
                )}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setConfirmImport(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={doImport}>Replace All Data</button>
            </div>
          </div>
        </div>
      )}

      {/* TV Display Mode overlay */}
      {showDisplay && (
        <DisplayMode
          session={activeSession}
          getPlayer={store.getPlayer}
          getDisplayName={store.getDisplayName}
          onExit={() => setShowDisplay(false)}
        />
      )}

      {/* App-level toast */}
      {appToast && (
        <div
          key={appToast.key}
          onAnimationEnd={() => setAppToast(null)}
          style={{
            position: 'fixed', top: 76, left: '50%',
            animation: 'toastFade 2.2s ease forwards',
            background: 'var(--bg-elevated)',
            border: `1px solid ${appToast.color}`,
            borderRadius: 'var(--radius)',
            padding: '10px 22px',
            fontSize: 14, fontWeight: 700,
            color: appToast.color,
            zIndex: 600,
            boxShadow: 'var(--shadow-lg)',
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
          }}
        >
          {appToast.msg}
        </div>
      )}
    </div>
  )
}
