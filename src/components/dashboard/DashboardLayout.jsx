import BrandLogo from '../brand/BrandLogo';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import './dashboard.css';

export default function DashboardLayout({ title, subtitle, navItems, activeView, onViewChange, children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  return (
    <>
      <section className="dashboard-shell">
        {/* ── Sidebar (desktop) ── */}
        <aside className="dashboard-sidebar">
          <div className="dashboard-sidebar-brand">
            <BrandLogo />
            <div>
              <h2>{title}</h2>
              <p>{subtitle}</p>
            </div>
          </div>
          <nav>
            <ul>
              {navItems.map((item) => (
                <li key={item.key}>
                  <button
                    type="button"
                    className={`dashboard-nav-btn${activeView === item.key ? ' is-active' : ''}`}
                    onClick={() => onViewChange(item.key)}
                  >
                    {item.label}
                  </button>
                </li>
              ))}
            </ul>
          </nav>
          <div className="dashboard-sidebar-actions">
            <div className="dashboard-user-chip-sidebar">{user?.email || 'Unknown user'}</div>
            <Link className="btn btn-outline" to="/">Home</Link>
            <button type="button" className="btn btn-primary" onClick={handleLogout}>Logout</button>
          </div>
        </aside>

        {/* ── Main content ── */}
        <div className="dashboard-content">
          <header className="dashboard-header">
            <div>
              <h1>{title}</h1>
              <p>{subtitle}</p>
            </div>
            <div className="dashboard-user-chip">{user?.email || 'Unknown user'}</div>
          </header>
          {children}
        </div>

        {/* ── Bottom tab bar (mobile) ── */}
        <nav className="dashboard-bottom-nav">
          {navItems.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`dashboard-bottom-nav-btn${activeView === item.key ? ' is-active' : ''}`}
              onClick={() => onViewChange(item.key)}
            >
              <span className="dashboard-bottom-nav-label">{item.label}</span>
            </button>
          ))}
        </nav>
      </section>
    </>
  );
}
