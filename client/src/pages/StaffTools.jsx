import { useEffect, useMemo, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { getFiles } from '../api'
import './StaffTools.css'

function formatSize(bytes) {
  if (typeof bytes !== 'number') return '—'
  if (bytes < 1024) return `${bytes} B`
  const kb = bytes / 1024
  if (kb < 1024) return `${kb.toFixed(0)} KB`
  const mb = kb / 1024
  return `${mb.toFixed(1)} MB`
}

export default function StaffTools() {
  const { user } = useAuth()
  const [files, setFiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [q, setQ] = useState('')

  const isStaff = user?.role === 'staff'
  if (!isStaff) return <Navigate to="/" replace />

  useEffect(() => {
    setLoading(true)
    setError('')
    getFiles('all')
      .then((data) => setFiles(data))
      .catch((e) => setError(e.message || 'Failed to load files'))
      .finally(() => setLoading(false))
  }, [])

  const stats = useMemo(() => {
    const total = files.length
    const byType = files.reduce((acc, f) => {
      const t = f.mime_type || 'unknown'
      acc[t] = (acc[t] || 0) + 1
      return acc
    }, {})
    const owners = new Set(files.map((f) => f.owner_name || String(f.owner_id)))
    return { total, byTypeCount: Object.keys(byType).length, owners: owners.size }
  }, [files])

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase()
    if (!query) return files
    return files.filter((f) => {
      const name = (f.original_name || f.filename || '').toLowerCase()
      const owner = (f.owner_name || String(f.owner_id || '')).toLowerCase()
      const type = (f.mime_type || '').toLowerCase()
      return name.includes(query) || owner.includes(query) || type.includes(query)
    })
  }, [files, q])

  return (
    <div className="staff-tools">
      <h1>Staff Tools</h1>
      <p className="subtitle">Limited management: view system upload metadata (DAC still protects file contents).</p>

      {error && <div className="error">{error}</div>}

      <div className="cards">
        <div className="card">
          <div className="label">Total files</div>
          <div className="value">{stats.total}</div>
        </div>
        <div className="card">
          <div className="label">Unique owners</div>
          <div className="value">{stats.owners}</div>
        </div>
        <div className="card">
          <div className="label">File types</div>
          <div className="value">{stats.byTypeCount}</div>
        </div>
      </div>

      <div className="toolbar">
        <input
          className="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by filename, owner, or type…"
        />
      </div>

      {loading ? (
        <p className="muted">Loading…</p>
      ) : (
        <div className="table-wrap">
          <table className="files-table">
            <thead>
              <tr>
                <th>File</th>
                <th>Type</th>
                <th>Size</th>
                <th>Owner</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((f) => (
                <tr key={f.id}>
                  <td>{f.original_name || f.filename}</td>
                  <td>{f.mime_type || '—'}</td>
                  <td>{formatSize(f.size)}</td>
                  <td>{f.owner_name || f.owner_id}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && <p className="muted" style={{ marginTop: '0.75rem' }}>No matches.</p>}
        </div>
      )}
    </div>
  )
}

