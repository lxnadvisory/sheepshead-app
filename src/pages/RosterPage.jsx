import { useState, useRef } from 'react'
import Avatar from '../components/Avatar'
import { getFullName } from '../utils/displayName'

// Crop + resize image to a square JPEG at the given pixel size using a canvas.
function cropToSquare(file, size = 256) {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = (ev) => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        canvas.width  = size
        canvas.height = size
        const ctx = canvas.getContext('2d')

        // Center-crop source to a square
        const srcSize = Math.min(img.width, img.height)
        const sx = (img.width  - srcSize) / 2
        const sy = (img.height - srcSize) / 2

        // Draw and clip to circle so the stored image is already cropped
        ctx.beginPath()
        ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2)
        ctx.clip()
        ctx.drawImage(img, sx, sy, srcSize, srcSize, 0, 0, size, size)

        resolve(canvas.toDataURL('image/jpeg', 0.85))
      }
      img.src = ev.target.result
    }
    reader.readAsDataURL(file)
  })
}

function PlayerRow({ player, onUpdate, onRemove }) {
  const [editing,   setEditing]   = useState(false)
  const [firstName, setFirstName] = useState(player.firstName ?? player.name ?? '')
  const [lastName,  setLastName]  = useState(player.lastName  ?? '')
  const [venmo,     setVenmo]     = useState(player.venmo     ?? '')
  const [phone,     setPhone]     = useState(player.phone     ?? '')
  const [email,     setEmail]     = useState(player.email     ?? '')
  const fileRef = useRef(null)

  const save = () => {
    if (!firstName.trim()) return
    onUpdate(player.id, {
      firstName: firstName.trim(), lastName: lastName.trim(),
      venmo: venmo.trim(), phone: phone.trim(), email: email.trim(),
    })
    setEditing(false)
  }

  const handlePhotoChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''   // allow re-selecting the same file
    const dataUrl = await cropToSquare(file, 256)
    onUpdate(player.id, { photo: dataUrl })
  }

  const removePhoto = () => onUpdate(player.id, { photo: null })

  if (editing) {
    return (
      <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-focus)', borderRadius: 'var(--radius)', padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* Clickable avatar for photo upload */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
          <div
            role="button"
            tabIndex={0}
            onClick={() => fileRef.current?.click()}
            onKeyDown={e => e.key === 'Enter' && fileRef.current?.click()}
            title="Tap to upload photo"
            style={{ position: 'relative', cursor: 'pointer', borderRadius: '50%', outline: 'none' }}
          >
            <Avatar player={player} size={72} />
            {/* Camera overlay */}
            <div style={{
              position: 'absolute', inset: 0, borderRadius: '50%',
              background: 'rgba(0,0,0,0.45)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 22,
            }}>📷</div>
          </div>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Tap to {player.photo ? 'change' : 'add'} photo</span>
          {player.photo && (
            <button onClick={removePhoto} style={{ background: 'none', border: 'none', color: 'var(--danger)', fontSize: 11, cursor: 'pointer', padding: 0, fontWeight: 600 }}>
              Remove photo
            </button>
          )}
        </div>

        <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handlePhotoChange} />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div><label>First Name</label><input value={firstName} onChange={e => setFirstName(e.target.value)} onKeyDown={e => e.key === 'Enter' && save()} autoFocus /></div>
          <div><label>Last Name</label><input  value={lastName}  onChange={e => setLastName(e.target.value)}  placeholder="optional" onKeyDown={e => e.key === 'Enter' && save()} /></div>
          <div><label>Venmo</label><input      value={venmo}     onChange={e => setVenmo(e.target.value)}     placeholder="@handle"  onKeyDown={e => e.key === 'Enter' && save()} /></div>
          <div><label>Phone</label><input      value={phone}     onChange={e => setPhone(e.target.value)}     placeholder="optional" onKeyDown={e => e.key === 'Enter' && save()} /></div>
          <div style={{ gridColumn: '1 / -1' }}><label>Email</label><input value={email} onChange={e => setEmail(e.target.value)} placeholder="optional" onKeyDown={e => e.key === 'Enter' && save()} /></div>
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost btn-sm" onClick={() => setEditing(false)}>Cancel</button>
          <button className="btn btn-primary btn-sm" onClick={save} disabled={!firstName.trim()}>Save</button>
        </div>
      </div>
    )
  }

  const display = getFullName(player) || player.name || player.id

  return (
    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
      {/* Avatar — clicking also opens file picker */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => fileRef.current?.click()}
        onKeyDown={e => e.key === 'Enter' && fileRef.current?.click()}
        title="Tap to upload photo"
        style={{ position: 'relative', flexShrink: 0, cursor: 'pointer', borderRadius: '50%', outline: 'none' }}
      >
        <Avatar player={player} size={42} />
        <span style={{
          position: 'absolute', bottom: -2, right: -2,
          width: 18, height: 18, borderRadius: '50%',
          background: 'var(--primary)', border: '2px solid var(--bg-surface)',
          color: '#fff', fontSize: 10, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1,
        }}>+</span>
        <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handlePhotoChange} />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 15 }}>{display}</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {player.venmo && <span>@{player.venmo}</span>}
          {player.phone && <span>{player.phone}</span>}
          {player.email && <span>{player.email}</span>}
          {player.photo && <button onClick={removePhoto} style={{ background: 'none', border: 'none', color: 'var(--danger)', fontSize: 11, cursor: 'pointer', padding: 0, fontWeight: 600 }}>Remove photo</button>}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6 }}>
        <button className="btn btn-ghost btn-sm" onClick={() => setEditing(true)}>Edit</button>
        <button className="btn btn-danger btn-sm" onClick={() => onRemove(player.id)}>✕</button>
      </div>
    </div>
  )
}

export default function RosterPage({ players, addPlayer, updatePlayer, removePlayer }) {
  const [showAdd,   setShowAdd]   = useState(false)
  const [firstName, setFirstName] = useState('')
  const [lastName,  setLastName]  = useState('')
  const [venmo,     setVenmo]     = useState('')
  const [phone,     setPhone]     = useState('')
  const [email,     setEmail]     = useState('')

  const handleAdd = () => {
    if (!firstName.trim()) return
    addPlayer({ firstName, lastName, venmo, phone, email })
    setFirstName(''); setLastName(''); setVenmo(''); setPhone(''); setEmail('')
    setShowAdd(false)
  }

  return (
    <div style={{ maxWidth: 560, margin: '0 auto', padding: '24px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800 }}>Roster</h1>
          <div style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 2 }}>{players.length} players</div>
        </div>
        <button className="btn btn-primary" onClick={() => setShowAdd(s => !s)}>
          {showAdd ? 'Cancel' : '+ Add Player'}
        </button>
      </div>

      {showAdd && (
        <div className="card animate-fade" style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>New Player</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
            <div><label>First Name</label><input value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="e.g. Jake" onKeyDown={e => e.key === 'Enter' && handleAdd()} autoFocus /></div>
            <div><label>Last Name</label><input  value={lastName}  onChange={e => setLastName(e.target.value)}  placeholder="optional" onKeyDown={e => e.key === 'Enter' && handleAdd()} /></div>
            <div><label>Venmo Handle</label><input value={venmo}   onChange={e => setVenmo(e.target.value)}     placeholder="e.g. Jake-Carey" onKeyDown={e => e.key === 'Enter' && handleAdd()} /></div>
            <div><label>Phone</label><input        value={phone}   onChange={e => setPhone(e.target.value)}     placeholder="optional" onKeyDown={e => e.key === 'Enter' && handleAdd()} /></div>
            <div style={{ gridColumn: '1 / -1' }}><label>Email</label><input value={email} onChange={e => setEmail(e.target.value)} placeholder="optional" onKeyDown={e => e.key === 'Enter' && handleAdd()} /></div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button className="btn btn-primary" onClick={handleAdd} disabled={!firstName.trim()}>Add to Roster</button>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {players.map(p => (
          <PlayerRow key={p.id} player={p} onUpdate={updatePlayer} onRemove={removePlayer} />
        ))}
        {players.length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>No players yet.</div>
        )}
      </div>
    </div>
  )
}
