import { Link } from 'react-router-dom';
import BrandLogo from '../brand/BrandLogo';
import './auth.css';

export default function AuthLayout({ title, subtitle, children, roleLabel, mode, hideAccountSwitch = false }) {
  const switchCopy = mode === 'login' ? "Don't have an account?" : 'Already have an account?';
  const switchPath = mode === 'login' ? '/register' : '/login';
  const switchLabel = mode === 'login' ? 'Create one' : 'Login here';

  return (
    <section className="auth-shell">
      <div className="auth-shell-panel auth-shell-brand">
        <Link to="/" className="auth-brand-link" aria-label="MediVault home"><BrandLogo /></Link>
        <p className="auth-brand-kicker">Secure healthcare identity platform</p>
        <h1>{title}</h1>
        <p className="auth-brand-subtitle">{subtitle}</p>
        <div className="auth-role-chip">{roleLabel}</div>
      </div>

      <div className="auth-shell-panel auth-shell-form">
        {children}
        {!hideAccountSwitch && <p className="auth-switch-copy">
          {switchCopy} <Link to={switchPath}>{switchLabel}</Link>
        </p>}
      </div>
    </section>
  );
}
