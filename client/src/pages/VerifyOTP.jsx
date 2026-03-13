import { useState } from 'react'
import { useNavigate, useLocation, Navigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { verifyOTP } from '../api'
import { useAuth } from '../context/AuthContext'
const logo = '/cgdrive-logo.png'
import './Auth.css'

export default function VerifyOTP() {
  const navigate = useNavigate()
  const location = useLocation()
  const { loginSuccess } = useAuth()
  const state = location.state || {}
  const userId = state.userId
  const otpSimulated = state.otpSimulated

  const [otp, setOtp] = useState('')
  const [error, setError] = useState('')

  if (!userId) {
    return <Navigate to="/login" replace />
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (!otp.trim()) {
      setError('Enter the 6-digit OTP.')
      return
    }
    try {
      const data = await verifyOTP(userId, otp.trim())
      loginSuccess(data.token, data.user)
      toast.success('OTP verified. Welcome!')
      navigate('/')
    } catch (err) {
      setError(err.message || 'Invalid OTP')
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">
          <img src={logo} alt="CGdrive" />
          <span>CGdrive</span>
        </div>
        <h1>Multi-Factor Authentication</h1>
        <p className="subtitle">Enter the One-Time Password sent to you</p>
        {/* OTP is shown via toast on login (simulated MFA). */}
        {error && <div className="error">{error}</div>}
        <form onSubmit={handleSubmit}>
          <label>
            OTP (6 digits)
            <input
              type="text"
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              maxLength={6}
              autoComplete="one-time-code"
            />
          </label>
          <button type="submit" className="btn btn-primary">Verify & continue</button>
        </form>
        <p className="auth-footer">
          <button type="button" className="link-btn" onClick={() => navigate('/login')}>
            ← Back to login
          </button>
        </p>
      </div>
    </div>
  )
}
