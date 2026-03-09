import { useAuth } from '../context/AuthContext'
import AdminDashboard from './AdminDashboard'
import StaffDashboard from './StaffDashboard'
import UserDashboard from './UserDashboard'
import './Dashboard.css'

export default function Dashboard() {
  const { user } = useAuth()

  if (!user) return null

  if (user.role === 'admin') return <AdminDashboard />
  if (user.role === 'staff') return <StaffDashboard />
  return <UserDashboard />
}
