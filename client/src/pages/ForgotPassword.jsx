import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { requestPasswordReset, resetPassword } from '../api'
import logo from '../assets/cgdrive-logo.png'
import './Auth.css'

export default function ForgotPassword() {
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [userId, setUserId] = useState(null)
  const [resetCode, setResetCode] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [step, setStep] = useState(1)

  const handleStartReset = async (e) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    if (!username.trim()) {
      setError('Username is required.')
      return
    }
    try {
      const data = await requestPasswordReset(username.trim())
      setUserId(data.userId)
      setStep(2)
      if (data.resetOtp) {
        toast.success(`Your reset code is: ${data.resetOtp}`)
      } else {
        toast('Reset code generated.')
      }
      setSuccess('Reset code generated. Check the toast and enter it below with your new password.')
    } catch (err) {
      setError(err.message || 'Failed to start password reset.')
    }
  }

  const isStrongPassword = (value) =>
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/.test(value)

  const handleFinishReset = async (e) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    if (!resetCode.trim() || !newPassword || !confirmPassword) {
      setError('Reset code and both password fields are required.')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }
    if (!isStrongPassword(newPassword)) {
      setError('Password must be at least 8 characters and include uppercase, lowercase, number, and symbol.')
      return
    }
    try {
      await resetPassword(userId, resetCode.trim(), newPassword)
      toast.success('Password updated. You can sign in now.')
      navigate('/login')
    } catch (err) {
      setError(err.message || 'Failed to reset password.')
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">
          <img src={logo} alt="CGdrive" />
          <span>CGdrive</span>
        </div>
        <h1>Forgot password</h1>
        <p className="subtitle">
          Generate a reset code and set a new password.
        </p>
        {error && <div className="error">{error}</div>}
        {success && <div className="success">{success}</div>}

        {step === 1 && (
          <form onSubmit={handleStartReset}>
            <label>
              Username
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter your username"
                autoComplete="username"
              />
            </label>
            <button type="submit" className="btn btn-primary">
              Send reset code
            </button>
          </form>
        )}

        {step === 2 && (
          <form onSubmit={handleFinishReset} style={{ marginTop: '1rem' }}>
            <label>
              Reset code
              <input
                type="text"
                value={resetCode}
                onChange={(e) => setResetCode(e.target.value)}
                placeholder="Enter the reset code"
              />
            </label>
            <label>
              New password
              <div className="password-field">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter new password"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  className="eye-btn"
                  onClick={() => setShowPassword((v) => !v)}
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
            </label>
            <label>
              Confirm new password
              <div className="password-field">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter new password"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  className="eye-btn"
                  onClick={() => setShowPassword((v) => !v)}
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
            </label>
            <button type="submit" className="btn btn-primary">
              Update password
            </button>
          </form>
        )}
      </div>
    </div>
  )
}

