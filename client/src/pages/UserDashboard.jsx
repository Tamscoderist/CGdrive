import { useAuth } from '../context/AuthContext'
import './Dashboard.css'

export default function UserDashboard() {
  const { user } = useAuth()

  return (
    <div className="dashboard">
      <h1>User Dashboard</h1>
      <p className="role-badge user">Basic access</p>
      <div className="dashboard-card">
        <h2>Welcome, {user?.username}</h2>
        <p>As a <strong>User</strong>, you have:</p>
        <ul>
          <li>Basic access to the system</li>
          <li>Access only to your own files (DAC)</li>
        </ul>
      </div>
    </div>
  )
}
