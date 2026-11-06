import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Navbar from '../../components/Navbar';
import AuthLayout from '../../components/auth/AuthLayout';
import AuthInput from '../../components/auth/AuthInput';
import AuthErrorBanner from '../../components/auth/AuthErrorBanner';
import AuthSubmitButton from '../../components/auth/AuthSubmitButton';
import { useAuth } from '../../hooks/useAuth';
import { roleByKey } from '../../utils/authRoles';
import { validateEmail, validatePassword } from '../../utils/authValidation';

export default function RoleLoginPage({ roleKey }) {
  const role = useMemo(() => roleByKey(roleKey), [roleKey]);
  const navigate = useNavigate();
  const { login, loading, error, clearError } = useAuth();
  const [form, setForm] = useState({ email: '', password: '' });
  const [fieldErrors, setFieldErrors] = useState({});

  const onChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    setFieldErrors((prev) => ({ ...prev, [name]: '' }));
    clearError();
  };

  const validate = () => {
    const nextErrors = {
      email: validateEmail(form.email),
      password: validatePassword(form.password),
    };

    setFieldErrors(nextErrors);
    return Object.values(nextErrors).every((message) => !message);
  };

  const onSubmit = async (event) => {
    event.preventDefault();
    if (!validate()) {
      return;
    }

    try {
      await login({ role: role.key, email: form.email.trim(), password: form.password });
      navigate(role.dashboardPath);
    } catch {
      // Error is already surfaced by AuthContext.
    }
  };

  return (
    <>
      <Navbar />
      <AuthLayout
        title={`Welcome back, ${role.label}`}
        subtitle="Sign in to access your secure MediVault records and role-specific workflows."
        roleLabel={`${role.label} Login`}
        mode="login"
      >
        <form onSubmit={onSubmit} noValidate>
          <AuthErrorBanner message={error} />
          <AuthInput
            id="email"
            label={role.key === 'hospital' ? 'Official Email' : 'Email'}
            type="email"
            value={form.email}
            onChange={onChange}
            placeholder="name@example.com"
            autoComplete="email"
            error={fieldErrors.email}
          />
          <AuthInput
            id="password"
            label="Password"
            type="password"
            value={form.password}
            onChange={onChange}
            placeholder="Enter your password"
            autoComplete="current-password"
            error={fieldErrors.password}
          />
          <p className="auth-switch-copy"><Link to={`/forgot-password?role=${role.key}`}>Forgot password?</Link></p>
          <AuthSubmitButton loading={loading} label={`Login as ${role.label}`} />
          <p className="auth-switch-copy">
            <Link to="/demo">Try a guest demo</Link> · Need another role? <Link to="/login">Switch role</Link>
          </p>
        </form>
      </AuthLayout>
    </>
  );
}
