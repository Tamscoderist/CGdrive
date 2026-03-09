import { useAuth } from '../context/AuthContext'
import './Dashboard.css'

export default function StaffDashboard() {
  const { user } = useAuth()

  return (
    <div className="dashboard">
      <h1>Staff Dashboard</h1>
      <p className="role-badge staff">Limited management access</p>
      <div className="dashboard-card">
        <h2>Welcome, {user?.username}</h2>
        <p>As <strong>Staff</strong>, you have:</p>
        <ul>
          <li>Limited management access</li>
          <li>View all uploaded file metadata (staff tools)</li>
          <li>Open/download only your own files (DAC)</li>
          <li>No full system configuration</li>
        </ul>
      </div>
    </div>
  )
}
