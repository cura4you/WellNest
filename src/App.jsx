import { useLayoutEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import ProtectedRoute from './components/auth/ProtectedRoute';
import DemoEntryPage from './pages/demo/DemoEntryPage';
import DashboardRoute from './pages/dashboard/DashboardRoute';
import LandingPage from './pages/LandingPage';
import ProviderGate from './pages/identity/ProviderGate';
import AccountVerificationPage from './pages/identity/AccountVerificationPage';
import VerifyEmailPage from './pages/identity/VerifyEmailPage';
import AdminLoginPage from './pages/identity/AdminLoginPage';
import AdminReviewsPage from './pages/identity/AdminReviewsPage';
import PasswordRecoveryPage from './pages/auth/PasswordRecoveryPage';
import AccountSecurityPage from './pages/auth/AccountSecurityPage';
import AuthRoleEntryPage from './pages/auth/AuthRoleEntryPage';
import PatientLoginPage from './pages/auth/PatientLoginPage';
import DoctorLoginPage from './pages/auth/DoctorLoginPage';
import HospitalLoginPage from './pages/auth/HospitalLoginPage';
import PatientRegisterPage from './pages/auth/PatientRegisterPage';
import DoctorRegisterPage from './pages/auth/DoctorRegisterPage';
import HospitalRegisterPage from './pages/auth/HospitalRegisterPage';

export default function App() {
  const { pathname } = useLocation();
  useLayoutEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [pathname]);
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/demo" element={<DemoEntryPage />} />

      <Route path="/verify-email" element={<VerifyEmailPage />} />
      <Route element={<ProtectedRoute />}><Route path="/account/verification" element={<AccountVerificationPage />} /></Route>
      <Route path="/admin/login" element={<AdminLoginPage />} />
      <Route element={<ProtectedRoute loginPath="/admin/login" />}><Route path="/admin/reviews" element={<AdminReviewsPage />} /></Route>
      <Route path="/forgot-password" element={<PasswordRecoveryPage key="forgot" />} />
      <Route path="/reset-password" element={<PasswordRecoveryPage key="reset" />} />
      <Route element={<ProtectedRoute />}><Route path="/account/security" element={<AccountSecurityPage />} /></Route>

      <Route path="/login" element={<AuthRoleEntryPage mode="login" />} />
      <Route path="/login/patient" element={<PatientLoginPage />} />
      <Route path="/login/doctor" element={<DoctorLoginPage />} />
      <Route path="/login/hospital" element={<HospitalLoginPage />} />

      <Route path="/register" element={<AuthRoleEntryPage mode="register" />} />
      <Route path="/register/patient" element={<PatientRegisterPage />} />
      <Route path="/register/doctor" element={<DoctorRegisterPage />} />
      <Route path="/register/hospital" element={<HospitalRegisterPage />} />

      <Route element={<ProtectedRoute allowedRole="patient" />}>
        <Route path="/dashboard/patient" element={<DashboardRoute role="patient" />} />
      </Route>
      <Route element={<ProtectedRoute allowedRole="doctor" />}>
        <Route element={<ProviderGate />}><Route path="/dashboard/doctor" element={<DashboardRoute role="doctor" />} /></Route>
      </Route>
      <Route element={<ProtectedRoute allowedRole="hospital" />}>
        <Route element={<ProviderGate />}><Route path="/dashboard/hospital" element={<DashboardRoute role="hospital" />} /></Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
