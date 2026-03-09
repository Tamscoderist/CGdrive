import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { login } from '../api'
import { useAuth } from '../context/AuthContext'
import logo from '../assets/cgdrive-logo.png'
import './Auth.css'

export default function Login() {
  const navigate = useNavigate()
  const { loginSuccess } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [pending, setPending] = useState(null) // { userId, username, role, otpSimulated }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (!username.trim() || !password) {
      setError('Please enter username and password.')
      return
    }
    try {
      const data = await login(username.trim(), password)
      setPending({
        userId: data.userId,
        username: data.username,
        role: data.role,
        otpSimulated: data.otpSimulated,
      })
      if (data.otpSimulated) {
        toast.success(`Your OTP is: ${data.otpSimulated}`)
      } else {
        toast('OTP generated. Please check your authenticator.')
      }
      navigate('/verify-otp', { state: { userId: data.userId, otpSimulated: data.otpSimulated } })
    } catch (err) {
      setError(err.message || 'Login failed')
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">
          <img src={logo} alt="CGdrive" />
          <span>CGdrive</span>
        </div>
        <h1>Sign in</h1>
        <p className="subtitle">Password-based authentication</p>
        {error && <div className="error">{error}</div>}
        <form onSubmit={handleSubmit}>
          <label>
            Username
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter username"
              autoComplete="username"
            />
          </label>
          <label>
            Password
            <div className="password-field">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                autoComplete="current-password"
              />
              <button
                type="button"
                className="eye-btn"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                title={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </label>
          <button type="submit" className="btn btn-primary">Sign in</button>
        </form>
        <p className="auth-footer">
          Don't have an account? <Link to="/register">Register</Link>
        </p>
      </div>
    </div>
  )
}
