import React, { useEffect, useState } from 'react';
import Dashboard from './pages/Dashboard.jsx';
import Study from './pages/Study.jsx';
import Writing from './pages/Writing.jsx';
import Browse from './pages/Browse.jsx';
import Settings from './pages/Settings.jsx';

const NAV = [
  { id: 'dashboard', icon: '📊', label: 'Dashboard' },
  { id: 'study', icon: '🎓', label: 'Học ngay' },
  { id: 'writing', icon: '✍️', label: 'Writing' },
  { id: 'browse', icon: '📚', label: 'Duyệt từ vựng' },
  { id: 'settings', icon: '⚙️', label: 'Cài đặt' }
];

export default function App() {
  const [page, setPage] = useState('dashboard');
  const [due, setDue] = useState(0);

  const refreshDue = async () => {
    try {
      const stats = await window.api.getStats();
      setDue(stats.due);
    } catch {}
  };

  useEffect(() => {
    refreshDue();
    const t = setInterval(refreshDue, 30000);
    const off = window.api.onNavigate((p) => setPage(p));
    return () => { clearInterval(t); off(); };
  }, []);

  return (
    <div className="app">
      <div className="sidebar">
        <div className="logo">
          <div className="logo-badge">🎯</div>
          <span>IELTS Vocab</span>
        </div>
        {NAV.map((n) => (
          <button
            key={n.id}
            className={'nav-item' + (page === n.id ? ' active' : '')}
            onClick={() => setPage(n.id)}
          >
            <span>{n.icon}</span> {n.label}
            {n.id === 'study' && due > 0 && <span className="badge">{due}</span>}
          </button>
        ))}
      </div>
      <div className="main">
        {page === 'dashboard' && <Dashboard onGoStudy={() => setPage('study')} />}
        {page === 'study' && <Study onDone={refreshDue} />}
        {page === 'writing' && <Writing onDone={refreshDue} />}
        {page === 'browse' && <Browse />}
        {page === 'settings' && <Settings />}
      </div>
    </div>
  );
}
