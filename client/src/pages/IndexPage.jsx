import { useAuth } from '../context/AuthContext'
import AdminDashboard from './AdminDashboard'
import StaffTools from './StaffTools'
import Files from './Files'

export default function IndexPage() {
  const { user } = useAuth()

  if (user?.role === 'admin') return <AdminDashboard />
  if (user?.role === 'staff') return <StaffTools />
  return <Files />
}
