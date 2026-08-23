import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import FactoryView from './pages/FactoryView';
import LibraryView from './pages/LibraryView';
import ChatView from './pages/ChatView';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<FactoryView />} />
        <Route path="/library" element={<LibraryView />} />
        <Route path="/chat/:botId" element={<ChatView />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}

export default App;
