import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Toaster } from 'sonner';
import { AppShell } from './components/layout/AppShell';
import { useAuth } from './auth/AuthContext';
import DashboardView from './pages/DashboardView';
import FactoryView from './pages/FactoryView';
import LibraryView from './pages/LibraryView';
import ChatView from './pages/ChatView';
import LoginView from './pages/auth/LoginView';
import RegisterView from './pages/auth/RegisterView';
import SettingsView from './pages/SettingsView';
import OrgSettingsView from './pages/OrgSettingsView';

/** Gate for routes that require a signed-in user. */
function Protected({ children }: { children: React.ReactNode }) {
  const { initialized, user } = useAuth();
  const location = useLocation();
  if (!initialized) return null; // splash handled by shell-level loading
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <>{children}</>;
}

function App() {
  return (
    <Router>
      <Toaster
        position="bottom-right"
        theme="dark"
        toastOptions={{
          style: {
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-hover)',
            color: 'var(--fg)',
          },
        }}
      />
      <Routes>
        {/* Public auth pages */}
        <Route path="/login" element={<LoginView />} />
        <Route path="/register" element={<RegisterView />} />

        {/* Chat is a fully themed, full-screen experience — outside the app shell */}
        <Route path="/chat/:botId" element={
          <Protected>
            <ChatView />
          </Protected>
        } />

        {/* Everything else lives inside the app shell (sidebar + top bar) */}
        <Route path="/*" element={
          <Protected>
            <AppShell>
              <Routes>
                <Route path="/" element={<DashboardView />} />
                <Route path="/factory" element={<FactoryView />} />
                <Route path="/library" element={<LibraryView />} />
                <Route path="/settings" element={<SettingsView />} />
                <Route path="/settings/org" element={<OrgSettingsView />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </AppShell>
          </Protected>
        } />
      </Routes>
    </Router>
  );
}

export default App;
