import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { Toaster as SileoToaster } from 'sileo'
import 'sileo/styles.css'
import App from './App'
import { AuthProvider } from './context/AuthContext'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
        <SileoToaster
          position="top-right"
          theme="dark"
          options={{
            duration: 3000,
            fill: '#141c2e',
            roundness: 10,
          }}
        />
        <Toaster
          position="top-center"
          toastOptions={{
            duration: 6000,
            style: {
              background: 'rgba(20, 28, 46, 0.95)',
              color: '#f4f7fb',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              backdropFilter: 'blur(10px)',
            },
          }}
        />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
