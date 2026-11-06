import { useState } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../../components/Navbar';
import AuthLayout from '../../components/auth/AuthLayout';
import AuthInput from '../../components/auth/AuthInput';
import AuthSubmitButton from '../../components/auth/AuthSubmitButton';
import AuthErrorBanner from '../../components/auth/AuthErrorBanner';
import { useAuth } from '../../hooks/useAuth';
import { secureAccountAction } from '../../services/authApi';
import { validatePassword, validateConfirmPassword } from '../../utils/authValidation';

export default function AccountSecurityPage() {
  const { token, role, clearLocalSession } = useAuth();
  const [form, setForm] = useState({ currentPassword: '', password: '', confirmPassword: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const change = e => { setForm({ ...form, [e.target.name]: e.target.value }); setError(''); };
  const act = async (action) => {
    setError(''); setBusy(true);
    try {
      const result = await secureAccountAction(action, token, form);
      // Clear after the server confirms; do not report server logout on network failure.
      setMessage(result.message);
      clearLocalSession();
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  const submit = e => {
    e.preventDefault();
    const invalid = !form.currentPassword ? 'Enter your current password.' : validatePassword(form.password) || validateConfirmPassword(form.password, form.confirmPassword);
    if (invalid) { setError(invalid); return; }
    void act('change-password');
  };
  return <><Navbar /><AuthLayout title="Your account security." subtitle="Manage your password and sign out your other devices." roleLabel="Account security" mode="login">
    {message ? <p role="status">{message}</p> : <><AuthErrorBanner message={error} /><form onSubmit={submit}>
      <AuthInput id="currentPassword" label="Current password" type="password" autoComplete="current-password" value={form.currentPassword} onChange={change} />
      <AuthInput id="password" label="New password" type="password" autoComplete="new-password" value={form.password} onChange={change} />
      <AuthInput id="confirmPassword" label="Confirm new password" type="password" autoComplete="new-password" value={form.confirmPassword} onChange={change} />
      <AuthSubmitButton loading={busy} label="Change password and sign out" />
    </form><div className="auth-security-devices"><h2>Signed-in devices</h2><p>End all sessions, including this device. You’ll need to sign in again.</p><button type="button" className="btn btn-primary" disabled={busy} onClick={() => void act('logout-all')}>Sign out all devices</button></div><p className="auth-switch-copy"><Link to="/account/verification">Account verification</Link></p><p className="auth-switch-copy"><Link to={`/dashboard/${role}`}>Back to dashboard</Link></p></>}
  </AuthLayout></>;
}
