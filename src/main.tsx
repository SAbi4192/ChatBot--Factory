import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './components/ui/ui.css'
import './pages/auth/auth.css'
import './theme.v2.css'
import App from './App.tsx'
import { AuthProvider } from './auth/AuthContext.tsx'
import GlobalEmbers from './components/GlobalEmbers.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <GlobalEmbers />
      <App />
    </AuthProvider>
  </StrictMode>,
)
