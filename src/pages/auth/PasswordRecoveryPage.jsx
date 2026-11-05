import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import Navbar from '../../components/Navbar';
import AuthLayout from '../../components/auth/AuthLayout';
import AuthInput from '../../components/auth/AuthInput';
import AuthSubmitButton from '../../components/auth/AuthSubmitButton';
import AuthErrorBanner from '../../components/auth/AuthErrorBanner';
import { requestPasswordReset, resetPassword } from '../../services/authApi';
import { useAuth } from '../../hooks/useAuth';
import { validateEmail, validatePassword, validateConfirmPassword } from '../../utils/authValidation';

export default function PasswordRecoveryPage() {
  const location = useLocation();
  const { clearLocalSession } = useAuth();
  const resetting = location.pathname === '/reset-password';
  const [token] = useState(() => window.location.hash.slice(1));
  const [role, setRole] = useState(() => new URLSearchParams(location.search).get('role') || 'patient');
  const [form, setForm] = useState({ email: '', password: '', confirmPassword: '' });
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (resetting) window.history.replaceState(null, '', window.location.pathname);
  }, [resetting]);
  const change = (e) => { setForm({ ...form, [e.target.name]: e.target.value }); setError(''); };
  const submit = async (e) => {
    e.preventDefault();
    const invalid = resetting ? validatePassword(form.password) || validateConfirmPassword(form.password, form.confirmPassword) : validateEmail(form.email);
    if (invalid) { setError(invalid); return; }
    setBusy(true); setError('');
    try {
      const result = resetting ? await resetPassword(token, form.password) : await requestPasswordReset(role, form.email.trim());
      setMessage(result.message);
      if (resetting) clearLocalSession();
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  return <><Navbar /><AuthLayout title={resetting ? 'Choose a new password.' : 'Let’s get you back in.'} subtitle={resetting ? 'A fresh password signs you out on every device.' : 'We’ll email a secure link to your registered address.'} roleLabel="Account recovery" mode="login">
    {message ? <div role="status"><p>{message}</p><p className="auth-switch-copy"><Link to="/login">Back to sign in</Link></p></div> : resetting && !/^[a-f0-9]{64}$/.test(token) ? <div role="alert"><p>This reset link is missing or invalid.</p><Link to="/forgot-password">Request a new link</Link></div> : <form onSubmit={submit}>
      <AuthErrorBanner message={error} />
      {resetting ? <><AuthInput id="password" label="New password" type="password" autoComplete="new-password" value={form.password} onChange={change} /><p className="auth-switch-copy">Use at least 8 characters, including a letter and a number.</p><AuthInput id="confirmPassword" label="Confirm new password" type="password" autoComplete="new-password" value={form.confirmPassword} onChange={change} /></> : <><div className="auth-field"><label htmlFor="role">Account role</label><select id="role" value={role} onChange={e => setRole(e.target.value)}><option value="patient">Patient</option><option value="doctor">Doctor</option><option value="hospital">Hospital</option></select></div><AuthInput id="email" label="Registered email" type="email" autoComplete="email" value={form.email} onChange={change} /></>}
      <AuthSubmitButton loading={busy} label={resetting ? 'Update password' : 'Send reset link'} />
      {resetting && <p className="auth-switch-copy"><Link to="/forgot-password">Request a new reset link</Link></p>}
    </form>}
  </AuthLayout></>;
}
