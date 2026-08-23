import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import { AppShell } from './components/layout/AppShell';
import DashboardView from './pages/DashboardView';
import FactoryView from './pages/FactoryView';
import LibraryView from './pages/LibraryView';
import ChatView from './pages/ChatView';

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
        {/* Chat is a fully themed, full-screen experience — outside the app shell */}
        <Route path="/chat/:botId" element={<ChatView />} />

        {/* Everything else lives inside the app shell (sidebar + top bar) */}
        <Route path="/*" element={
          <AppShell>
            <Routes>
              <Route path="/" element={<DashboardView />} />
              <Route path="/factory" element={<FactoryView />} />
              <Route path="/library" element={<LibraryView />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </AppShell>
        } />
      </Routes>
    </Router>
  );
}

export default App;
