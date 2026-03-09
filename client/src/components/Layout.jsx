import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import './Layout.css'
import logo from '../assets/cgdrive-logo.png'

export default function Layout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <div className="layout">
      <header className="header">
        <div className="header-inner">
          <NavLink to="/" className="brand" aria-label="Go to my files">
            <img className="brand-logo" src={logo} alt="CGdrive" />
            <h2 className="logo">CGdrive</h2>
          </NavLink>
          <nav className="nav">
            <NavLink to="/" end className={({ isActive }) => isActive ? 'active' : ''}>
              My Drive
            </NavLink>
            {user?.role === 'staff' && (
              <NavLink to="/staff-tools" className={({ isActive }) => isActive ? 'active' : ''}>
                Staff Tools
              </NavLink>
            )}
            {user?.role === 'admin' && (
              <NavLink to="/users" className={({ isActive }) => isActive ? 'active' : ''}>
                Manage Users
              </NavLink>
            )}
          </nav>
          <div className="user-bar">
            <span className="user-role">{user?.role}</span>
            <span className="user-name">{user?.username}</span>
            <button type="button" className="btn btn-secondary btn-sm" onClick={handleLogout}>
              Logout
            </button>
          </div>
        </div>
      </header>
      <main className="main">
        <Outlet />
      </main>
    </div>
  )
}
