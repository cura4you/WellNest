import { useLayoutEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import ProtectedRoute from './components/auth/ProtectedRoute';
import LandingPage from './pages/LandingPage';
import AuthRoleEntryPage from './pages/auth/AuthRoleEntryPage';
import PatientLoginPage from './pages/auth/PatientLoginPage';
import DoctorLoginPage from './pages/auth/DoctorLoginPage';
import HospitalLoginPage from './pages/auth/HospitalLoginPage';
import PatientRegisterPage from './pages/auth/PatientRegisterPage';
import DoctorRegisterPage from './pages/auth/DoctorRegisterPage';
import HospitalRegisterPage from './pages/auth/HospitalRegisterPage';
import PatientDashboardPage from './pages/dashboard/PatientDashboardPage';
import DoctorDashboardPage from './pages/dashboard/DoctorDashboardPage';
import HospitalDashboardPage from './pages/dashboard/HospitalDashboardPage';

export default function App() {
  const { pathname } = useLocation();
  useLayoutEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [pathname]);
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />

      <Route path="/login" element={<AuthRoleEntryPage mode="login" />} />
      <Route path="/login/patient" element={<PatientLoginPage />} />
      <Route path="/login/doctor" element={<DoctorLoginPage />} />
      <Route path="/login/hospital" element={<HospitalLoginPage />} />

      <Route path="/register" element={<AuthRoleEntryPage mode="register" />} />
      <Route path="/register/patient" element={<PatientRegisterPage />} />
      <Route path="/register/doctor" element={<DoctorRegisterPage />} />
      <Route path="/register/hospital" element={<HospitalRegisterPage />} />

      <Route element={<ProtectedRoute allowedRole="patient" />}>
        <Route path="/dashboard/patient" element={<PatientDashboardPage />} />
      </Route>
      <Route element={<ProtectedRoute allowedRole="doctor" />}>
        <Route path="/dashboard/doctor" element={<DoctorDashboardPage />} />
      </Route>
      <Route element={<ProtectedRoute allowedRole="hospital" />}>
        <Route path="/dashboard/hospital" element={<HospitalDashboardPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
