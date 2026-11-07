import { Link } from 'react-router-dom';
import Navbar from '../../components/Navbar';
import { AUTH_ROLES } from '../../utils/authRoles';
import '../../components/auth/auth.css';

export default function AuthRoleEntryPage({ mode }) {
  const action = mode === 'login' ? 'Login' : 'Register';

  return (
    <>
      <Navbar />
      <section className="auth-shell">
        <div className="auth-shell-panel auth-shell-brand">
          <h1>{action} by Role</h1>
          <p className="auth-brand-subtitle">
            Choose your role to continue with secure access tailored for your WellNest workflow.
          </p>
        </div>

        <div className="auth-shell-panel auth-shell-form">
          <div className="auth-role-grid">
            {AUTH_ROLES.map((role) => (
              <div key={role.key} className="auth-role-card">
                <h3>{role.label}</h3>
                <p>{action} to manage records and actions specific to {role.label.toLowerCase()} users.</p>
                <Link to={mode === 'login' ? role.loginPath : role.registerPath} className="btn btn-primary">
                  {action} as {role.label}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
