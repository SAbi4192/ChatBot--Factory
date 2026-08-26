import { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Toaster } from 'sonner';
import { AppShell } from './components/layout/AppShell';
import { useAuth } from './auth/AuthContext';

// Eager — always loaded (landing page + auth)
import DashboardView from './pages/DashboardView';
import LoginView from './pages/auth/LoginView';
import RegisterView from './pages/auth/RegisterView';

// Lazy — code-split by route
const ChatView = lazy(() => import('./pages/ChatView'));
const ShareView = lazy(() => import('./pages/ShareView'));
const FactoryView = lazy(() => import('./pages/FactoryView'));
const RandomBotView = lazy(() => import('./pages/RandomBotView'));
const CustomBotView = lazy(() => import('./pages/CustomBotView'));
const LibraryView = lazy(() => import('./pages/LibraryView'));
const SearchView = lazy(() => import('./pages/SearchView'));
const SettingsView = lazy(() => import('./pages/SettingsView'));
const OrgSettingsView = lazy(() => import('./pages/OrgSettingsView'));
const KBView = lazy(() => import('./pages/KBView'));
const AnalyticsView = lazy(() => import('./pages/AnalyticsView'));
const ModerationView = lazy(() => import('./pages/ModerationView'));
const AgentView = lazy(() => import('./pages/AgentView'));
const WidgetConfigView = lazy(() => import('./pages/WidgetConfigView'));
const BotEditor = lazy(() => import('./pages/BotEditor'));
const FlowBuilder = lazy(() => import('./pages/FlowBuilder'));
const TemplatesView = lazy(() => import('./pages/TemplatesView'));

function Suspend({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<div className="skeleton" style={{ height: 300, borderRadius: 12, margin: '2rem' }} />}>{children}</Suspense>;
}

function Protected({ children }: { children: React.ReactNode }) {
  const { initialized, user } = useAuth();
  const location = useLocation();
  if (!initialized) return null;
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
        <Route path="/login" element={<LoginView />} />
        <Route path="/register" element={<RegisterView />} />
        <Route path="/share/:convId" element={<Suspend><ShareView /></Suspend>} />

        <Route path="/chat/:botId" element={
          <Protected>
            <Suspend><ChatView /></Suspend>
          </Protected>
        } />
        <Route path="/kb/:botId" element={
          <Protected>
            <AppShell>
              <Suspend><KBView /></Suspend>
            </AppShell>
          </Protected>
        } />
        <Route path="/bot/:botId/edit" element={
          <Protected>
            <AppShell>
              <Suspend><BotEditor /></Suspend>
            </AppShell>
          </Protected>
        } />
        <Route path="/flow/:botId" element={
          <Protected>
            <AppShell>
              <Suspend><FlowBuilder /></Suspend>
            </AppShell>
          </Protected>
        } />
        <Route path="/widget/:botId" element={
          <Protected>
            <AppShell>
              <Suspend><WidgetConfigView /></Suspend>
            </AppShell>
          </Protected>
        } />

        <Route path="/*" element={
          <Protected>
            <AppShell>
              <Suspense fallback={null}>
                <Routes>
                  <Route path="/" element={<DashboardView />} />
                  <Route path="/factory" element={<Suspend><FactoryView /></Suspend>} />
                  <Route path="/factory/random" element={<Suspend><RandomBotView /></Suspend>} />
                  <Route path="/factory/custom" element={<Suspend><CustomBotView /></Suspend>} />
                  <Route path="/library" element={<Suspend><LibraryView /></Suspend>} />
                  <Route path="/search" element={<Suspend><SearchView /></Suspend>} />
                  <Route path="/analytics" element={<Suspend><AnalyticsView /></Suspend>} />
                  <Route path="/moderation" element={<Suspend><ModerationView /></Suspend>} />
                  <Route path="/agent" element={<Suspend><AgentView /></Suspend>} />
                  <Route path="/templates" element={<Suspend><TemplatesView /></Suspend>} />
                  <Route path="/settings" element={<Suspend><SettingsView /></Suspend>} />
                  <Route path="/settings/org" element={<Suspend><OrgSettingsView /></Suspend>} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </Suspense>
            </AppShell>
          </Protected>
        } />
      </Routes>
    </Router>
  );
}

export default App;