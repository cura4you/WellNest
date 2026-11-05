/**
 * Types for the real patient dashboard data, matching the shape returned by
 * GET /api/dashboard/patient (server/src/app.js) and src/services/dashboardApi.js.
 * Keep these in sync with the backend response — they intentionally mirror
 * it rather than an idealized future shape.
 */

export interface Metric {
  key: string;
  title: string;
  value: string;
  hint: string;
}

export type DocumentStatus = 'encrypted' | 'stored';

export interface DocumentRow {
  id: string;
  name: string;
  type: string;
  uploadedBy: string;
  date: string;
  status: DocumentStatus;
}

export type AccessRequestStatus = 'pending' | 'approved' | 'rejected';
export type AccessRequestScope = 'specific_documents' | string;

export interface AccessRequestRow {
  id: string;
  requester: string;
  role: string;
  reason: string;
  scope: AccessRequestScope;
  status: AccessRequestStatus;
  documentIds?: string[];
}

export interface AuditEvent {
  id: string;
  title: string;
  time: string;
  description: string;
}

export interface NotificationSetting {
  id: string;
  channel: string;
  description: string;
  enabled: boolean;
}

export interface PatientDashboardData {
  metrics: Metric[];
  documents: DocumentRow[];
  accessRequests: AccessRequestRow[];
  auditEvents: AuditEvent[];
  notifications: NotificationSetting[];
}

export type PatientView = 'vitals' | 'appointments' | 'overview' | 'documents' | 'requests' | 'audit' | 'chat' | 'settings' | 'notifications';

// Generic so DashboardShell (and its navItems) work for any role's set of
// view keys, not just Patient's. `V extends string = string` keeps every
// existing untyped usage (plain object literals) compiling unchanged.
export interface NavItem<V extends string = string> {
  key: V;
  label: string;
  icon: import('react').ReactNode;
  badge?: string;
}

export interface NavGroup<V extends string = string> {
  label: string;
  keys: V[];
}

export interface SearchResultItem {
  id: string;
  category: string;
  label: string;
  meta: string;
  onSelect: () => void;
}

/* ---------- Doctor ---------- */

export type DoctorView =
  | 'appointments'
  | 'overview'
  | 'upload'
  | 'shared-docs'
  | 'grants'
  | 'request'
  | 'history'
  | 'activity'
  | 'emergency'
  | 'drug-interactions'
  | 'chat'
  | 'settings'
  | 'notifications';

export type GrantStatus = 'active' | 'expired' | 'revoked' | string;

export interface GrantedAccessRow {
  id: string;
  patient: string;
  scope: string;
  expiresAt: string;
  status: GrantStatus;
}

export interface RequestHistoryRow {
  id: string;
  patient: string;
  reason: string;
  scope: string;
  status: AccessRequestStatus;
}

export interface SharedDocumentRow {
  id: string;
  name: string;
  type: string;
  patient: string;
  patientEmail: string;
  date: string;
  status: DocumentStatus;
}

export interface DoctorDashboardData {
  metrics: Metric[];
  grantedAccess: GrantedAccessRow[];
  requestHistory: RequestHistoryRow[];
  sharedDocuments: SharedDocumentRow[];
  auditEvents: AuditEvent[];
  notifications: NotificationSetting[];
}

/* ---------- Hospital ---------- */

export type HospitalView =
  | 'appointments'
  | 'overview'
  | 'upload'
  | 'queue'
  | 'access'
  | 'compliance'
  | 'emergency'
  | 'chat'
  | 'settings'
  | 'notifications';

export interface UploadQueueRow {
  id: string;
  patient: string;
  file: string;
  submittedAt: string;
  status: string;
}

export interface StaffAccessRow {
  id: string;
  doctor: string;
  department: string;
  grants: string | number;
  status: string;
  granteeUserId: string;
}

export interface HospitalDashboardData {
  metrics: Metric[];
  uploadQueue: UploadQueueRow[];
  staffAccess: StaffAccessRow[];
  complianceEvents: AuditEvent[];
  notifications: NotificationSetting[];
}
