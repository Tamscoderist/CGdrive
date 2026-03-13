import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { getFiles, getUsers } from '../api'
import './Dashboard.css'
import './StaffTools.css'

export default function AdminDashboard() {
  const { user } = useAuth()
  const [files, setFiles] = useState([])
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    setLoading(true)
    setError('')
    Promise.all([getFiles(), getUsers()])
      .then(([filesData, usersData]) => {
        setFiles(filesData)
        setUsers(usersData)
      })
      .catch((e) => setError(e.message || 'Failed to load'))
      .finally(() => setLoading(false))
  }, [])

  const stats = useMemo(() => {
    const totalFiles = files.length
    const totalUsers = users.length
    const byType = files.reduce((acc, f) => {
      const t = f.mime_type || 'unknown'
      acc[t] = (acc[t] || 0) + 1
      return acc
    }, {})
    const owners = new Set(files.map((f) => f.owner_name || String(f.owner_id)))
    return { totalFiles, totalUsers, byTypeCount: Object.keys(byType).length, owners: owners.size }
  }, [files, users])

  return (
    <div className="dashboard">
      <h1>Admin Dashboard</h1>
      <p className="role-badge admin">Full system access</p>

      {error && <div className="error">{error}</div>}

      {loading ? (
        <p className="muted">Loading…</p>
      ) : (
        <div className="cards">
          <div className="card">
            <div className="label">Total users</div>
            <div className="value">{stats.totalUsers}</div>
          </div>
          <div className="card">
            <div className="label">Total files</div>
            <div className="value">{stats.totalFiles}</div>
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
      )}

      <div className="dashboard-card">
        <h2>Welcome, {user?.username}</h2>
        <p>As an <strong>Admin</strong>, you have:</p>
        <ul>
          <li>Full system access</li>
          <li>View all users and files</li>
          <li>Manage resources across the system</li>
        </ul>
      </div>
    </div>
  )
}
