import { AppointmentsPanel } from '../../dashboard-v2/AppointmentsPanel';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { DashboardShell } from '../../dashboard-v2/DashboardShell';
import { HospitalOverview } from '../../dashboard-v2/HospitalOverview';
import { RoleListPanel } from '../../dashboard-v2/RoleListPanel';
import { AuditLogView } from '../../dashboard-v2/AuditLogView';
import { NotificationsPanel } from '../../dashboard-v2/NotificationsPanel';
import { ToastStack } from '../../dashboard-v2/ToastStack';
import { useToast } from '../../dashboard-v2/useToast';
import type { HospitalDashboardData, HospitalView, SearchResultItem } from '../../dashboard-v2/types';

import UploadModal from '../../components/dashboard/UploadModal';
import { getHospitalDashboardData } from '../../services/dashboardApi';
import { uploadDocument, viewDocument } from '../../services/vaultApi';
import { revokeGrantsByGrantee } from '../../services/accessApi';
import { updateProfile } from '../../services/profileApi';
import EmergencyAccess from '../../components/dashboard/EmergencyAccess';
import DocumentViewer from '../../components/dashboard/DocumentViewer';
import ChatPanel from '../../components/chat/ChatPanel';
import { useAuth } from '../../hooks/useAuth';

import {
  CalendarPlusIcon,
  BellIcon,
  BuildingIcon,
  ClipboardIcon,
  GridIcon,
  MessageIcon,
  SettingsIcon,
  ShieldIcon,
  UploadIcon,
} from '../../dashboard-v2/icons';
import '../../theme/theme.css';
import '../../dashboard-v2/dashboard-v2.css';
import '../../components/dashboard/dashboard.css';

interface AuthUser {
  email?: string;
  profile?: { hospitalName?: string; supportEmail?: string; officialEmail?: string; phone?: string };
}

export default function HospitalDashboardPage() {
  const { user, logout, updateSessionProfile } = useAuth() as { user: AuthUser | null; logout: () => void; updateSessionProfile: (profile: any) => void };
  const [data, setData] = useState<HospitalDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [activeView, setActiveView] = useState<HospitalView>('overview');
  const [settings, setSettings] = useState({
    hospitalName: user?.profile?.hospitalName || '',
    supportEmail: user?.profile?.supportEmail || user?.profile?.officialEmail || '',
    contactPhone: user?.profile?.phone || '',
  });
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [viewerDoc, setViewerDoc] = useState<{ url: string; filename: string; mimeType: string } | null>(null);
  const { toasts, showToast } = useToast();

  const refreshData = useCallback(() => {
    setLoading(true);
    getHospitalDashboardData().then((result: HospitalDashboardData) => {
      setData(result);
      setLoading(false);
    });
  }, []);

  useEffect(() => { refreshData(); }, [refreshData]);

  const handleUpload = async (uploadForm: any) => {
    await uploadDocument(uploadForm);
    setFeedback('Document uploaded & stamped successfully!');
    showToast('Document uploaded & stamped');
    refreshData();
  };

  const handleView = async (docId: string) => {
    try {
      setViewerDoc(await viewDocument(docId));
    } catch (err: any) {
      showToast(err.message || 'Could not open the document.', 'info');
    }
  };

  const handleRevoke = async (granteeUserId: string) => {
    setBusy(true);
    setFeedback('');
    try {
      const result = await revokeGrantsByGrantee(granteeUserId);
      setFeedback(result.message);
      showToast(result.message);
      refreshData();
    } catch (err: any) {
      setFeedback(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleSaveProfile = async () => {
    setBusy(true);
    setFeedback('');
    try {
      const result = await updateProfile('hospital', { hospitalName: settings.hospitalName, phone: settings.contactPhone });
      updateSessionProfile(result.profile);
      setFeedback('Profile saved successfully!');
      showToast('Profile saved');
    } catch (err: any) {
      setFeedback(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleViewChange = (view: HospitalView) => {
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

    data.uploadQueue.forEach((row) => {
      items.push({
        id: `queue-${row.id}`,
        category: 'Upload Queue',
        label: row.file,
        meta: `${row.patient} · ${row.status}`,
        onSelect: () => handleViewChange('queue'),
      });
    });

    data.staffAccess.forEach((row) => {
      items.push({
        id: `staff-${row.id}`,
        category: 'Staff Access',
        label: row.doctor,
        meta: `${row.department} · ${row.status}`,
        onSelect: () => handleViewChange('access'),
      });
    });

    data.complianceEvents.forEach((event) => {
      items.push({
        id: `compliance-${event.id}`,
        category: 'Compliance',
        label: event.title,
        meta: event.time,
        onSelect: () => handleViewChange('compliance'),
      });
    });

    return items;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const navGroups = [
    { label: 'Workspace', keys: ['overview', 'queue', 'appointments'] as HospitalView[] },
    { label: 'Access & Activity', keys: ['access', 'compliance', 'notifications'] as HospitalView[] },
    { label: 'Tools', keys: ['emergency', 'chat', 'settings'] as HospitalView[] },
  ];

  const navItems = [
    { key: 'appointments' as const, label: 'Appointments', icon: <CalendarPlusIcon size={16} /> },
    { key: 'overview' as const, label: 'Overview', icon: <GridIcon size={16} /> },
    { key: 'queue' as const, label: 'Upload Queue', icon: <UploadIcon size={16} /> },
    { key: 'access' as const, label: 'Staff Access', icon: <BuildingIcon size={16} /> },
    { key: 'compliance' as const, label: 'Compliance & Audit', icon: <ClipboardIcon size={16} /> },
    { key: 'emergency' as const, label: 'Emergency Access', icon: <ShieldIcon size={16} /> },
    { key: 'chat' as const, label: 'Chat', icon: <MessageIcon size={16} /> },
    { key: 'settings' as const, label: 'Profile & Settings', icon: <SettingsIcon size={16} /> },
    { key: 'notifications' as const, label: 'Notifications', icon: <BellIcon size={16} /> },
  ];

  const userName = user?.profile?.hospitalName || user?.email || 'Hospital';
  const userInitials = userName
    .split(' ')
    .map((part: string) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const viewTitles: Record<HospitalView, [string, string]> = {
    appointments: ['Appointments', 'Request, confirm and manage appointments.'],
    overview: ['Overview', 'Institutional metrics and vault operations summary.'],
    upload: ['Upload Document', 'Upload Document'],
    queue: ['Upload Queue', 'Monitor processing status of uploaded documents.'],
    access: ['Staff Access', 'Manage doctor-level access to patient records.'],
    compliance: ['Compliance & Audit', 'Review compliance and audit events.'],
    emergency: ['Emergency Access', 'Open a consented, audited 24-hour record window.'],
    chat: ['Chat', 'Ask questions about the documents you have access to.'],
    settings: ['Profile & Settings', 'Institution identity and communication settings.'],
    notifications: ['Notifications', 'Control institution alert channels.'],
  };
  const [topbarTitle, topbarSubtitle] = viewTitles[activeView];

  const renderView = () => {
    if (loading || !data) {
      return <p className="mv-empty">Loading hospital dashboard…</p>;
    }

    switch (activeView) {
      case 'appointments': return <AppointmentsPanel role="hospital" />;
      case 'overview':
        return (
          <HospitalOverview
            data={data}
            onNavigate={handleViewChange}
            onOpenUpload={() => setShowUpload(true)}
            showToast={showToast}
          />
        );

      case 'queue':
        return (
          <RoleListPanel emptyMessage="No upload jobs found." icon={<UploadIcon size={16} />} rows={data.uploadQueue.map((row) => ({
            id: row.id, title: row.file, meta: row.patient, detail: row.submittedAt, status: row.status,
          }))} />
        );

      case 'access':
        return (
          <>
            {feedback && <p className="mv-role-feedback">{feedback}</p>}
            <RoleListPanel emptyMessage="No staff access assignments found." icon={<BuildingIcon size={16} />} rows={data.staffAccess.map((row) => ({
              id: row.id,
              title: row.doctor,
              meta: row.department,
              detail: `${row.grants} active grant${Number(row.grants) === 1 ? '' : 's'}`,
              status: row.status,
              actions: <button type="button" className="mv-btn mv-btn-ghost mv-btn-sm" onClick={() => handleRevoke(row.granteeUserId)} disabled={busy}>Revoke</button>,
            }))} />
          </>
        );

      case 'compliance':
        return <AuditLogView events={data.complianceEvents} />;

      case 'settings':
        return (
          <div className="mv-card mv-card-pad mv-role-form">
            <div className="mv-form-grid">
              <div className="mv-form-field">
                <label className="mv-form-label" htmlFor="hospitalName">Hospital Name</label>
                <input id="hospitalName" name="hospitalName" className="mv-form-input" value={settings.hospitalName} onChange={(e) => setSettings((prev) => ({ ...prev, hospitalName: e.target.value }))} />
              </div>
              <div className="mv-form-field">
                <label className="mv-form-label" htmlFor="supportEmail">Account Email</label>
                <input id="supportEmail" name="supportEmail" className="mv-form-input" value={user?.email || ''} disabled />
              </div>
              <div className="mv-form-field span-2">
                <label className="mv-form-label" htmlFor="contactPhone">Contact Phone</label>
                <input id="contactPhone" name="contactPhone" className="mv-form-input" value={settings.contactPhone} onChange={(e) => setSettings((prev) => ({ ...prev, contactPhone: e.target.value }))} />
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
          <div className="mv-emergency-panel"><EmergencyAccess onViewDocument={handleView} /></div>
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
      userInitials={userInitials || 'H'}
      roleLabel="Hospital"
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
      <ToastStack toasts={toasts} />
    </DashboardShell>
  );
}
