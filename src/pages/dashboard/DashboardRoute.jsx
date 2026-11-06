import { useAuth } from '../../hooks/useAuth';
import PatientDashboardPage from './PatientDashboardPage';
import DoctorDashboardPage from './DoctorDashboardPage';
import HospitalDashboardPage from './HospitalDashboardPage';
const pages={patient:PatientDashboardPage,doctor:DoctorDashboardPage,hospital:HospitalDashboardPage};
export default function DashboardRoute({role}){const {user}=useAuth();const Page=pages[role];return <Page key={user?.id||role} />;}
