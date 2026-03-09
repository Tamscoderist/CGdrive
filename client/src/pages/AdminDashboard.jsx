import { useAuth } from '../context/AuthContext'
import './Dashboard.css'

export default function AdminDashboard() {
  const { user } = useAuth()

  return (
    <div className="dashboard">
      <h1>Admin Dashboard</h1>
      <p className="role-badge admin">Full system access</p>
      <div className="dashboard-card">
        <h2>Welcome, {user?.username}</h2>
        <p>As an <strong>Admin</strong>, you have:</p>
        <ul>
          <li>Full system access</li>
          <li>View all users and files</li>
          <li>Manage resources across the system</li>
          <li>Access to all files (DAC bypass for admin)</li>
        </ul>
      </div>
    </div>
  )
}
