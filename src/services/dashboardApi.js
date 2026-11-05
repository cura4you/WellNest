const API_BASE_URL = import.meta.env.VITE_API_BASE_URL?.trim() || '';
const STORAGE_KEY = 'medivault.auth';

function getToken() {
  try {
    const session = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return session.token || '';
  } catch {
    return '';
  }
}

async function dashboardRequest(path) {
  if (import.meta.env.VITE_ENABLE_MOCK_AUTH === 'true') return null;
  const token = getToken();
  if (!token) throw Object.assign(new Error('Your session is missing. Please sign in again.'), { status: 401 });

  const res = await fetch(`${API_BASE_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const message = res.status === 401 ? 'Your session has expired. Please sign in again.' : 'Please check your connection and try again.';
    throw Object.assign(new Error(message), { status: res.status });
  }
  const data = await res.json().catch(() => null);
  const required = path.endsWith('/patient') ? ['metrics', 'documents', 'accessRequests', 'auditEvents', 'notifications'] : path.endsWith('/doctor') ? ['metrics', 'grantedAccess', 'requestHistory', 'sharedDocuments', 'auditEvents', 'notifications'] : ['metrics', 'uploadQueue', 'staffAccess', 'complianceEvents', 'notifications'];
  if (!data || required.some(key => !Array.isArray(data[key]))) throw new Error('The dashboard response could not be loaded. Please try again.');
  return data;
}

const PATIENT_EMPTY = {
  metrics: [
    { key: 'docs', title: 'Documents', value: '0', hint: 'No uploads yet' },
    { key: 'pending', title: 'Pending Requests', value: '0', hint: 'No pending requests' },
    { key: 'active', title: 'Active Grants', value: '0', hint: 'No active grants' },
    { key: 'audit', title: 'Audit Events', value: '0', hint: 'No activity yet' },
  ],
  documents: [],
  accessRequests: [],
  auditEvents: [],
  notifications: [],
};

const DOCTOR_EMPTY = {
  metrics: [
    { key: 'grants', title: 'Active Grants', value: '0', hint: 'No grants yet' },
    { key: 'pending', title: 'Pending Requests', value: '0', hint: 'No open requests' },
    { key: 'emergency', title: 'Emergency Sessions', value: '0', hint: 'No emergency sessions' },
    { key: 'views', title: 'Documents Reviewed', value: '0', hint: 'No reviewed documents' },
  ],
  grantedAccess: [],
  requestHistory: [],
  sharedDocuments: [],
  auditEvents: [],
  notifications: [],
};

const HOSPITAL_EMPTY = {
  metrics: [
    { key: 'staff', title: 'Staff Linked', value: '0', hint: 'No staff linked yet' },
    { key: 'uploads', title: 'Uploads This Week', value: '0', hint: 'No uploads yet' },
    { key: 'verify', title: 'Pending Verifications', value: '0', hint: 'No pending verifications' },
    { key: 'compliance', title: 'Compliance Flags', value: '0', hint: 'No compliance flags' },
  ],
  uploadQueue: [],
  staffAccess: [],
  complianceEvents: [],
  notifications: [],
};

export async function getPatientDashboardData() {
  const data = await dashboardRequest('/api/dashboard/patient');
  return data || PATIENT_EMPTY;
}

export async function getDoctorDashboardData() {
  const data = await dashboardRequest('/api/dashboard/doctor');
  return data || DOCTOR_EMPTY;
}

export async function getHospitalDashboardData() {
  const data = await dashboardRequest('/api/dashboard/hospital');
  return data || HOSPITAL_EMPTY;
}
