import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';

export default function ProtectedRoute({ allowedRole }) {
  const { isAuthenticated, role, initializing } = useAuth();

  // AuthContext hasn't finished reading the stored session from localStorage
  // yet — isAuthenticated is still the pre-hydration false. Render nothing
  // rather than redirecting, or every hard page load/refresh would bounce a
  // perfectly valid session to the login page.
  if (initializing) {
    return null;
  }

  if (!isAuthenticated) {
    return <Navigate to={allowedRole ? `/login/${allowedRole}` : '/login'} replace />;
  }

  if (allowedRole && role !== allowedRole) {
    return <Navigate to={`/dashboard/${role}`} replace />;
  }

  return <Outlet />;
}
