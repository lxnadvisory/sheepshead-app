/** Inline red error shown in a form when its Supabase save failed. */
export default function SaveErrorBox({ message }) {
  return (
    <div role="alert" style={{
      background: 'rgba(239,68,68,0.12)',
      border: '1px solid var(--danger)',
      borderRadius: 'var(--radius-sm)',
      padding: '8px 12px',
      color: 'var(--danger)',
      fontSize: 13, fontWeight: 600, lineHeight: 1.45,
      wordBreak: 'break-word',
    }}>
      ⛔ {message}
      <div style={{ fontSize: 11, fontWeight: 500, marginTop: 4, color: 'var(--text-secondary)' }}>
        Nothing was added to the ledger. Your entry is still here — tap Retry.
      </div>
    </div>
  )
}
