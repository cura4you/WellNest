import { useCallback, useEffect, useMemo, useState, Fragment, type ChangeEvent } from 'react';
import { DashboardShell } from '../../dashboard-v2/DashboardShell';
import { DoctorOverview } from '../../dashboard-v2/DoctorOverview';
import { RoleListPanel } from '../../dashboard-v2/RoleListPanel';
import { AuditLogView } from '../../dashboard-v2/AuditLogView';
import { NotificationsPanel } from '../../dashboard-v2/NotificationsPanel';
import { ToastStack } from '../../dashboard-v2/ToastStack';
import { useToast } from '../../dashboard-v2/useToast';
import type { DoctorDashboardData, DoctorView, SearchResultItem } from '../../dashboard-v2/types';

import UploadModal from '../../components/dashboard/UploadModal';
import { getDoctorDashboardData } from '../../services/dashboardApi';
import { searchPatientByEmail, requestDocumentAccess } from '../../services/accessApi';
import { uploadDocument, viewDocument } from '../../services/vaultApi';
import DocumentViewer from '../../components/dashboard/DocumentViewer';
import AISummaryModal from '../../components/dashboard/AISummaryModal';
import EmergencyAccess from '../../components/dashboard/EmergencyAccess';
import DrugInteractions from '../../components/dashboard/DrugInteractions';
import ChatPanel from '../../components/chat/ChatPanel';
import { updateProfile } from '../../services/profileApi';
import { useAuth } from '../../hooks/useAuth';

import {
  ActivityIcon,
  BellIcon,
  ClipboardIcon,
  FileIcon,
  FolderIcon,
  GridIcon,
  MessageIcon,
  PillIcon,
  SettingsIcon,
  ShieldCheckIcon,
  ShieldIcon,
  UploadIcon,
} from '../../dashboard-v2/icons';
import '../../theme/theme.css';
import '../../dashboard-v2/dashboard-v2.css';
// Shared modals and DrugInteractions still use base classes from this sheet;
// dashboard-v2.css applies role-consistent overrides inside DashboardShell.
import '../../components/dashboard/dashboard.css';

interface AuthUser {
  email?: string;
  profile?: { fullName?: string; specialization?: string; licenseNumber?: string };
}

export default function DoctorDashboardPage() {
  const { user, logout } = useAuth() as { user: AuthUser | null; logout: () => void };
  const [data, setData] = useState<DoctorDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeView, setActiveView] = useState<DoctorView>('overview');
  const [requestForm, setRequestForm] = useState({ patientEmail: '', reason: '', selectedDocs: [] as string[] });
  const [searchResult, setSearchResult] = useState<any>(null);
  const [searching, setSearching] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [profile, setProfile] = useState({
    fullName: user?.profile?.fullName || '',
    specialization: user?.profile?.specialization || '',
    licenseNumber: user?.profile?.licenseNumber || '',
  });
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [viewerDoc, setViewerDoc] = useState<{ url: string; filename: string; mimeType: string } | null>(null);
  const [summaryDoc, setSummaryDoc] = useState<{ id: string; name: string } | null>(null);
  const { toasts, showToast } = useToast();

  const refreshData = useCallback(() => {
    setLoading(true);
    getDoctorDashboardData().then((result: DoctorDashboardData) => {
      setData(result);
      setLoading(false);
    });
  }, []);

  useEffect(() => { refreshData(); }, [refreshData]);

  const handleRequestChange = (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = event.target;
    setRequestForm((prev) => ({ ...prev, [name]: value }));
    if (name === 'patientEmail') setSearchResult(null);
  };

  const handleSearchPatient = async () => {
    if (!requestForm.patientEmail || !requestForm.patientEmail.includes('@')) {
      setFeedback('Please enter a valid patient email.');
      return;
    }
    setSearching(true);
    setFeedback('');
    try {
      const result = await searchPatientByEmail(requestForm.patientEmail);
      setSearchResult(result);
      setRequestForm((prev) => ({ ...prev, selectedDocs: [] }));
    } catch (err: any) {
      setFeedback(err.message || 'Patient not found.');
      setSearchResult(null);
    } finally {
      setSearching(false);
    }
  };

  const handleToggleDoc = (docId: string) => {
    setRequestForm((prev) => {
      const selected = prev.selectedDocs.includes(docId)
        ? prev.selectedDocs.filter((id) => id !== docId)
        : [...prev.selectedDocs, docId];
      return { ...prev, selectedDocs: selected };
    });
  };

  const handleSelectAllDocs = () => {
    if (!searchResult) return;
    setRequestForm((prev) => ({ ...prev, selectedDocs: searchResult.documents.map((d: any) => d.id) }));
  };

  const handleDeselectAllDocs = () => {
    setRequestForm((prev) => ({ ...prev, selectedDocs: [] }));
  };

  const handleProfileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.target;
    setProfile((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmitRequest = async () => {
    if (!searchResult || requestForm.selectedDocs.length === 0 || !requestForm.reason) {
      setFeedback('Search for a patient, select documents, and provide a reason.');
      return;
    }
    setBusy(true);
    setFeedback('');
    try {
      await requestDocumentAccess(searchResult.patient.id, requestForm.selectedDocs, requestForm.reason);
      setFeedback('Access request submitted!');
      showToast('Access request submitted');
      setRequestForm({ patientEmail: '', reason: '', selectedDocs: [] });
      setSearchResult(null);
      refreshData();
    } catch (err: any) {
      setFeedback(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleUpload = async (uploadForm: any) => {
    await uploadDocument(uploadForm);
    setFeedback('Document uploaded & stamped successfully!');
    showToast('Document uploaded & stamped');
    refreshData();
  };

  const handleView = async (docId: string) => {
    setFeedback('');
    try {
      const doc = await viewDocument(docId);
      setViewerDoc(doc);
    } catch (err: any) {
      setFeedback(err.message);
      showToast(err.message, 'info');
    }
  };

  const handleSummary = (docId: string) => {
    const doc = (data?.sharedDocuments || []).find((d) => d.id === docId);
    setSummaryDoc({ id: docId, name: doc?.name || 'Document' });
  };

  const handleSaveProfile = async () => {
    setBusy(true);
    setFeedback('');
    try {
      await updateProfile('doctor', { fullName: profile.fullName, specialization: profile.specialization });
      setFeedback('Profile saved successfully!');
      showToast('Profile saved');
    } catch (err: any) {
      setFeedback(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleViewChange = (view: DoctorView) => {
    setFeedback('');
    if (view === 'upload') {
      setShowUpload(true);
      return;
    }
    setActiveView(view);
  };

  const searchItems: SearchResultItem[] = useMemo(() => {
    if (!data) return [];
    const items: SearchResultItem[] = [];

    data.sharedDocuments.forEach((doc) => {
      items.push({
        id: `doc-${doc.id}`,
        category: 'Shared Document',
        label: doc.name,
        meta: `${doc.patient} · ${doc.date}`,
        onSelect: () => handleView(doc.id),
      });
    });

    data.grantedAccess.forEach((grant) => {
      items.push({
        id: `grant-${grant.id}`,
        category: 'Active Grant',
        label: grant.patient,
        meta: `${grant.scope} · expires ${grant.expiresAt}`,
        onSelect: () => handleViewChange('grants'),
      });
    });

    data.requestHistory.forEach((req) => {
      items.push({
        id: `hist-${req.id}`,
        category: 'Request History',
        label: req.patient,
        meta: `${req.status} · ${req.reason}`,
        onSelect: () => handleViewChange('history'),
      });
    });

    data.auditEvents.forEach((event) => {
      items.push({
        id: `audit-${event.id}`,
        category: 'Activity',
        label: event.title,
        meta: event.time,
        onSelect: () => handleViewChange('activity'),
      });
    });

    return items;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const navGroups = [
    { label: 'Workspace', keys: ['overview', 'shared-docs'] as DoctorView[] },
    { label: 'Access & Activity', keys: ['grants', 'request', 'history', 'activity', 'notifications'] as DoctorView[] },
    { label: 'Tools', keys: ['emergency', 'drug-interactions', 'chat', 'settings'] as DoctorView[] },
  ];

  const navItems = [
    { key: 'overview' as const, label: 'Overview', icon: <GridIcon size={16} /> },
    { key: 'shared-docs' as const, label: 'Shared Documents', icon: <FolderIcon size={16} /> },
    { key: 'grants' as const, label: 'Active Grants', icon: <ShieldCheckIcon size={16} /> },
    { key: 'request' as const, label: 'Request Access', icon: <FileIcon size={16} /> },
    { key: 'history' as const, label: 'Request History', icon: <ClipboardIcon size={16} /> },
    { key: 'activity' as const, label: 'Activity Log', icon: <ActivityIcon size={16} /> },
    { key: 'emergency' as const, label: 'Emergency Access', icon: <ShieldIcon size={16} /> },
    { key: 'drug-interactions' as const, label: 'Drug Interactions', icon: <PillIcon size={16} /> },
    { key: 'chat' as const, label: 'Chat', icon: <MessageIcon size={16} /> },
    { key: 'settings' as const, label: 'Profile & Settings', icon: <SettingsIcon size={16} /> },
    { key: 'notifications' as const, label: 'Notifications', icon: <BellIcon size={16} /> },
  ];

  const userName = user?.profile?.fullName || user?.email || 'Doctor';
  const userInitials = userName
    .split(' ')
    .map((part: string) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const viewTitles: Record<DoctorView, [string, string]> = {
    overview: ['Overview', 'Your current access and care workflow summary.'],
    upload: ['Upload Document', 'Upload Document'],
    'shared-docs': ['Shared Documents', 'Documents shared with you by patients.'],
    grants: ['Active Grants', 'Your currently active access grants.'],
    request: ['Request Access', 'Search for a patient and select specific documents to request.'],
    history: ['Request History', 'All your previous access requests.'],
    activity: ['Activity Log', 'Recent activities on your account.'],
    emergency: ['Emergency Access', 'Open a consented, audited 24-hour record window.'],
    'drug-interactions': ['Drug Interactions', 'Record and manage drug interaction notes for patients.'],
    chat: ['Chat', 'Ask questions about the documents you have access to.'],
    settings: ['Profile & Settings', 'Doctor profile details for interoperability and verification.'],
    notifications: ['Notifications', 'How you receive request and emergency alerts.'],
  };
  const [topbarTitle, topbarSubtitle] = viewTitles[activeView];

  const renderView = () => {
    if (loading || !data) {
      return <p className="mv-empty">Loading doctor dashboard…</p>;
    }

    switch (activeView) {
      case 'overview':
        return (
          <DoctorOverview
            data={data}
            onNavigate={handleViewChange}
            onViewDocument={handleView}
            onOpenUpload={() => setShowUpload(true)}
            showToast={showToast}
          />
        );

      case 'shared-docs':
        return (
          <RoleListPanel emptyMessage="No shared documents available." rows={data.sharedDocuments.map((doc) => ({
            id: doc.id,
            title: doc.name,
            meta: `${doc.patient} · ${doc.patient_email} · ${doc.type.replace(/_/g, ' ')} · ${doc.date}`,
            status: doc.status,
            onClick: () => handleView(doc.id),
            actions: <>
              <button type="button" className="mv-btn mv-btn-ghost mv-btn-sm" onClick={() => handleView(doc.id)}>View</button>
              <button type="button" className="mv-btn mv-btn-ghost mv-btn-sm" onClick={() => handleSummary(doc.id)}>AI Summary</button>
            </>,
          }))} />
        );

      case 'grants':
        return (
          <RoleListPanel emptyMessage="No active grants available." icon={<ShieldCheckIcon size={16} />} rows={data.grantedAccess.map((grant) => ({
            id: grant.id, title: grant.patient, meta: grant.scope, detail: `Expires ${grant.expiresAt}`, status: grant.status,
          }))} />
        );

      case 'request':
        return (
          <div className="mv-card mv-card-pad mv-role-form">
            {feedback && <p className="mv-role-feedback">{feedback}</p>}
            <div className="mv-form-grid">
              <div className="mv-form-field span-2">
                <label className="mv-form-label" htmlFor="patientEmail">Patient Email</label>
                <div className="mv-role-input-action">
                  <input
                    id="patientEmail"
                    name="patientEmail"
                    className="mv-form-input"
                    value={requestForm.patientEmail}
                    onChange={handleRequestChange}
                    placeholder="patient@example.com"
                  />
                  <button type="button" className="mv-btn mv-btn-ghost" onClick={handleSearchPatient} disabled={searching}>
                    {searching ? 'Searching...' : 'Search'}
                  </button>
                </div>
              </div>
            </div>

            {searchResult && (
              <div className="mv-role-result">
                <strong>{searchResult.patient.fullName}</strong>
                <span>Age: {searchResult.patient.age ?? 'N/A'} · Gender: {searchResult.patient.gender || 'N/A'} · Blood Group: {searchResult.patient.bloodGroup || 'N/A'} · DOB: {searchResult.patient.dateOfBirth || 'N/A'}</span>
              </div>
            )}

            {searchResult && searchResult.documents && searchResult.documents.length > 0 && (
              <div>
                <div className="mv-role-selection-head">
                  <span className="mv-form-label">Select Documents ({requestForm.selectedDocs.length} selected)</span>
                  <div className="mv-role-actions">
                    <button type="button" className="mv-btn mv-btn-ghost mv-btn-sm" onClick={handleSelectAllDocs}>Select All</button>
                    <button type="button" className="mv-btn mv-btn-ghost mv-btn-sm" onClick={handleDeselectAllDocs}>Deselect All</button>
                  </div>
                </div>
                <div className="mv-role-selection-list">
                  {searchResult.documents.map((doc: any) => (
                    <label key={doc.id} className="mv-role-selection-row">
                      <input type="checkbox" checked={requestForm.selectedDocs.includes(doc.id)} onChange={() => handleToggleDoc(doc.id)} />
                      <span className="mv-role-document-name">{doc.documentName || doc.originalFilename}</span>
                      <span className="mv-row-meta">{doc.documentType}</span>
                      <span className="mv-row-meta">{doc.visitDate || doc.uploadedAt?.split('T')[0]}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {searchResult && searchResult.documents && searchResult.documents.length === 0 && (
              <p className="mv-row-meta">No documents found for this patient.</p>
            )}

            <div className="mv-form-grid">
              <div className="mv-form-field span-2">
                <label className="mv-form-label" htmlFor="reason">Reason for Request</label>
                <textarea id="reason" name="reason" className="mv-form-input mv-role-textarea" value={requestForm.reason} onChange={handleRequestChange} placeholder="Explain why you need access to these documents..." />
              </div>
            </div>
            <div className="mv-role-actions">
              <button type="button" className="mv-btn mv-btn-accent" onClick={handleSubmitRequest} disabled={busy || !searchResult || requestForm.selectedDocs.length === 0}>
                {busy ? 'Submitting…' : 'Submit Request'}
              </button>
            </div>
          </div>
        );

      case 'history':
        return (
          <RoleListPanel emptyMessage="No request history available." icon={<ClipboardIcon size={16} />} rows={data.requestHistory.map((request) => ({
            id: request.id, title: request.patient, meta: request.scope, detail: request.reason, status: request.status,
          }))} />
        );

      case 'activity':
        return <AuditLogView events={data.auditEvents} />;

      case 'settings':
        return (
          <div className="mv-card mv-card-pad mv-role-form">
            <div className="mv-form-grid">
              <div className="mv-form-field">
                <label className="mv-form-label" htmlFor="fullName">Full Name</label>
                <input id="fullName" name="fullName" className="mv-form-input" value={profile.fullName} onChange={handleProfileChange} />
              </div>
              <div className="mv-form-field">
                <label className="mv-form-label" htmlFor="specialization">Specialization</label>
                <input id="specialization" name="specialization" className="mv-form-input" value={profile.specialization} onChange={handleProfileChange} />
              </div>
              <div className="mv-form-field span-2">
                <label className="mv-form-label" htmlFor="licenseNumber">License Number</label>
                <input id="licenseNumber" name="licenseNumber" className="mv-form-input" value={profile.licenseNumber} onChange={handleProfileChange} disabled />
              </div>
              <div className="mv-form-field">
                <button type="button" className="mv-btn mv-btn-accent" onClick={handleSaveProfile} disabled={busy}>{busy ? 'Saving…' : 'Save Profile'}</button>
              </div>
            </div>
            {feedback && <p className="mv-role-feedback">{feedback}</p>}
          </div>
        );

      case 'emergency':
        return (
          <div className="mv-emergency-panel">
            <EmergencyAccess onViewDocument={handleView} />
          </div>
        );

      case 'drug-interactions':
        return (
          <div className="mv-drug-panel">
            <DrugInteractions />
          </div>
        );

      case 'chat':
        return (
          <div className="mv-chat">
            <ChatPanel />
          </div>
        );

      case 'notifications':
        return <NotificationsPanel notifications={data.notifications} />;

      default:
        return null;
    }
  };

  return (
    <DashboardShell
      navGroups={navGroups}
      navItems={navItems}
      activeView={activeView}
      onViewChange={handleViewChange}
      title={topbarTitle}
      subtitle={topbarSubtitle}
      userName={userName}
      userEmail={user?.email || ''}
      userInitials={userInitials || 'D'}
      roleLabel="Doctor"
      onLogout={logout}
      onHome={() => { window.location.href = '/'; }}
      onNotificationsClick={() => handleViewChange('notifications')}
      searchItems={searchItems}
    >
      {renderView()}
      {showUpload && (
        <UploadModal onUpload={handleUpload} onClose={() => setShowUpload(false)} busy={busy} />
      )}
      {viewerDoc && (
        <DocumentViewer
          url={viewerDoc.url}
          filename={viewerDoc.filename}
          mimeType={viewerDoc.mimeType}
          onClose={() => { URL.revokeObjectURL(viewerDoc.url); setViewerDoc(null); }}
          verifiedColor="var(--mv-accent-text)"
        />
      )}
      {summaryDoc && (
        <AISummaryModal documentId={summaryDoc.id} filename={summaryDoc.name} onClose={() => setSummaryDoc(null)} />
      )}
      <ToastStack toasts={toasts} />
    </DashboardShell>
  );
}
