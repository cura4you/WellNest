import { useState } from 'react';
import { Link,useNavigate } from 'react-router-dom';
import AuthLayout from '../../components/auth/AuthLayout';
import AuthInput from '../../components/auth/AuthInput';
import AuthSubmitButton from '../../components/auth/AuthSubmitButton';
import AuthErrorBanner from '../../components/auth/AuthErrorBanner';
import { useAuth } from '../../hooks/useAuth';
import { validateEmail,validatePassword } from '../../utils/authValidation';
export default function AdminLoginPage(){
  const {login,loading}=useAuth(),navigate=useNavigate();
  const [form,setForm]=useState({email:'',password:''}),[role,setRole]=useState('patient'),[error,setError]=useState('');
  const change=e=>{setForm({...form,[e.target.name]:e.target.value});setError('');};
  const submit=async e=>{e.preventDefault();const invalid=validateEmail(form.email)||validatePassword(form.password);if(invalid){setError(invalid);return;}try{const user=await login({role,email:form.email.trim(),password:form.password});if(!user.isAdmin){setError('This account does not have administrator access.');return;}navigate('/admin/reviews');}catch(e){setError(e.message);}};
  return <AuthLayout title="Your review workspace." subtitle="Sign in with an account that has administrator access." roleLabel="Administrator sign in" mode="login" hideAccountSwitch><form onSubmit={submit}><AuthErrorBanner message={error} /><AuthInput id="email" label="Administrator email" type="email" autoComplete="email" value={form.email} onChange={change} /><AuthInput id="password" label="Password" type="password" autoComplete="current-password" value={form.password} onChange={change} /><div className="auth-field"><label htmlFor="adminAccountRole">Account role</label><select id="adminAccountRole" value={role} onChange={e=>setRole(e.target.value)}><option value="patient">Patient</option><option value="doctor">Doctor</option><option value="hospital">Hospital</option></select></div><AuthSubmitButton loading={loading} label="Sign in to review" /><p className="auth-switch-copy"><Link to={`/forgot-password?role=${role}`}>Forgot password?</Link></p><p className="auth-switch-copy"><Link to="/">Back to WellNest</Link></p></form></AuthLayout>;
}
