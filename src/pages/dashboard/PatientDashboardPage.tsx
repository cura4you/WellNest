import { VitalsPanel } from '../../dashboard-v2/VitalsPanel';
import { AppointmentsPanel } from '../../dashboard-v2/AppointmentsPanel';
import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { DashboardShell } from '../../dashboard-v2/DashboardShell';
import { PatientOverview } from '../../dashboard-v2/PatientOverview';
import { StorageVault } from '../../dashboard-v2/StorageVault';
import { AccessRequests } from '../../dashboard-v2/AccessRequests';
import { AuditLogView } from '../../dashboard-v2/AuditLogView';
import { NotificationsPanel } from '../../dashboard-v2/NotificationsPanel';
import { SettingsPanel } from '../../dashboard-v2/SettingsPanel';
import { ToastStack } from '../../dashboard-v2/ToastStack';
import { useToast } from '../../dashboard-v2/useToast';
import type { PatientDashboardData, PatientView, SearchResultItem } from '../../dashboard-v2/types';

import { getPatientDashboardData } from '../../services/dashboardApi';
import { viewDocument } from '../../services/vaultApi';
import { resolveAccessRequest } from '../../services/accessApi';
import DocumentViewer from '../../components/dashboard/DocumentViewer';
import AISummaryModal from '../../components/dashboard/AISummaryModal';
import { updateProfile } from '../../services/profileApi';
import { useAuth } from '../../hooks/useAuth';
import ChatPanel from '../../components/chat/ChatPanel';

import {
  CalendarPlusIcon,
  BellIcon,
  ClipboardIcon,
  FolderIcon,
  GridIcon,
  MessageIcon,
  SettingsIcon,
  ShieldCheckIcon,
} from '../../dashboard-v2/icons';
import '../../theme/theme.css';
import '../../dashboard-v2/dashboard-v2.css';
// Still needed for DocumentViewer/AISummaryModal below, which style
// themselves with docviewer-*/aisummary-* classes defined in here and
// have no stylesheet of their own.
import '../../components/dashboard/dashboard.css';

interface AuthUser {
  email?: string;
  profile?: { fullName?: string; bloodGroup?: string; gender?: string; emergencyContact?: string; emergencyContactName?: string; emergencyContactPhone?: string };
}

export default function PatientDashboardPage() {
  // useAuth's context is still untyped JS (defaults user to `null`), which
  // infers too narrowly for a TS consumer — widen it here at the boundary.
  const { user, logout, updateSessionProfile } = useAuth() as { user: AuthUser | null; logout: () => void; updateSessionProfile: (profile: any) => void };
  const [data, setData] = useState<PatientDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState({
    fullName: user?.profile?.fullName || '',
    bloodGroup: user?.profile?.bloodGroup || '',
    gender: user?.profile?.gender || '',
    emergencyContact: user?.profile?.emergencyContactName || '',
    emergencyContactPhone: user?.profile?.emergencyContactPhone || '',
  });
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [activeView, setActiveView] = useState<PatientView>('overview');
  const [viewerDoc, setViewerDoc] = useState<{ url: string; filename: string; mimeType: string } | null>(null);
  const [summaryDoc, setSummaryDoc] = useState<{ id: string; name: string } | null>(null);
  const { toasts, showToast } = useToast();

  const refreshData = useCallback(() => {
    setLoading(true);
    getPatientDashboardData().then((result: PatientDashboardData) => {
      setData(result);
      setLoading(false);
    });
  }, []);

  useEffect(() => { refreshData(); }, [refreshData]);

  const handleProfileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.target;
    setProfile((prev) => ({ ...prev, [name]: value }));
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

  const handleSaveProfile = async () => {
    setBusy(true);
    setFeedback('');
    try {
      const result = await updateProfile('patient', {
        fullName: profile.fullName,
        bloodGroup: profile.bloodGroup,
        gender: profile.gender,
        emergencyContactName: profile.emergencyContact,
        emergencyContactPhone: profile.emergencyContactPhone,
      });
      updateSessionProfile(result.profile);
      setFeedback('Profile saved successfully!');
      showToast('Profile saved');
    } catch (err: any) {
      setFeedback(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleResolve = async (requestId: string, action: 'approve' | 'reject') => {
    setBusy(true);
    setFeedback('');
    try {
      await resolveAccessRequest(requestId, action);
      setFeedback(`Request ${action}d.`);
      showToast(`Request ${action}d`);
      refreshData();
    } catch (err: any) {
      setFeedback(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleSummary = (docId: string) => {
    const doc = (data?.documents || []).find((d) => d.id === docId);
    setSummaryDoc({ id: docId, name: doc?.name || 'Document' });
  };

  const handleViewChange = (view: PatientView) => {
    setFeedback('');
    setActiveView(view);
  };

  const searchItems: SearchResultItem[] = useMemo(() => {
    if (!data) return [];
    const items: SearchResultItem[] = [];

    data.documents.forEach((doc) => {
      items.push({
        id: `doc-${doc.id}`,
        category: 'Document',
        label: doc.name,
        meta: `${doc.type.replace(/_/g, ' ')} · ${doc.uploadedBy} · ${doc.date}`,
        onSelect: () => handleView(doc.id),
      });
    });

    data.accessRequests.forEach((req) => {
      items.push({
        id: `req-${req.id}`,
        category: 'Access Request',
        label: req.requester,
        meta: `${req.role} · ${req.status}`,
        onSelect: () => handleViewChange('requests'),
      });
    });

    data.auditEvents.forEach((event) => {
      items.push({
        id: `audit-${event.id}`,
        category: 'Audit Event',
        label: event.title,
        meta: event.time,
        onSelect: () => handleViewChange('audit'),
      });
    });

    data.notifications.forEach((entry) => {
      items.push({
        id: `notif-${entry.id}`,
        category: 'Notification',
        label: entry.channel,
        meta: entry.description,
        onSelect: () => handleViewChange('notifications'),
      });
    });

    return items;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const navItems = [
    { key: 'appointments' as const, label: 'Appointments', icon: <CalendarPlusIcon size={16} /> },
    { key: 'vitals' as const, label: 'Health Vitals', icon: <ClipboardIcon size={16} /> },
    { key: 'overview' as const, label: 'Overview', icon: <GridIcon size={16} /> },
    { key: 'documents' as const, label: 'Storage Vault', icon: <FolderIcon size={16} /> },
    {
      key: 'requests' as const,
      label: 'Access Requests',
      icon: <ShieldCheckIcon size={16} />,
      badge: data?.accessRequests?.filter((r) => r.status === 'pending').length
        ? String(data.accessRequests.filter((r) => r.status === 'pending').length)
        : undefined,
    },
    { key: 'audit' as const, label: 'Audit Log', icon: <ClipboardIcon size={16} /> },
    { key: 'chat' as const, label: 'AI Chat', icon: <MessageIcon size={16} /> },
    { key: 'settings' as const, label: 'Profile & Settings', icon: <SettingsIcon size={16} /> },
    { key: 'notifications' as const, label: 'Notifications', icon: <BellIcon size={16} /> },
  ];

  const navGroups = [
    { label: 'Workspace', keys: ['overview', 'documents', 'vitals', 'appointments'] as PatientView[] },
    { label: 'Access & Activity', keys: ['requests', 'audit', 'notifications'] as PatientView[] },
    { label: 'Tools', keys: ['chat', 'settings'] as PatientView[] },
  ];

  const userName = user?.profile?.fullName || user?.email || 'Patient';
  const userInitials = userName
    .split(' ')
    .map((part: string) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const viewTitles: Record<PatientView, [string, string]> = {
    appointments: ['Appointments', 'Request, confirm and manage appointments.'],
    vitals: ['Health Vitals', 'Record and review your own measurements.'],
    overview: ['Overview', 'Your latest vault and access activity at a glance.'],
    documents: ['Storage Vault', 'View and download your medical records.'],
    requests: ['Access Requests', 'Review and manage who can access your records.'],
    audit: ['Audit Log', 'Full trail of who accessed what and when.'],
    chat: ['AI Chat', 'Ask questions about the documents you have access to.'],
    settings: ['Profile & Settings', 'Update your core profile and emergency details.'],
    notifications: ['Notifications', 'Control how access and emergency alerts are delivered.'],
  };
  const [topbarTitle, topbarSubtitle] = viewTitles[activeView];

  const renderView = () => {
    if (loading || !data) {
      return <p className="mv-empty">Loading patient dashboard…</p>;
    }

    switch (activeView) {
      case 'appointments': return <AppointmentsPanel role="patient" />;
      case 'vitals': return <VitalsPanel />;
      case 'overview':
        return (
          <PatientOverview
            data={data}
            onNavigate={handleViewChange}
            onViewDocument={handleView}
            showToast={showToast}
          />
        );

      case 'documents':
        return <StorageVault documents={data.documents} onView={handleView} onSummary={handleSummary} />;

      case 'requests':
        return (
          <AccessRequests
            requests={data.accessRequests}
            busy={busy}
            onApprove={(id) => handleResolve(id, 'approve')}
            onReject={(id) => handleResolve(id, 'reject')}
          />
        );

      case 'audit':
        return <AuditLogView events={data.auditEvents} />;

      case 'chat':
        return (
          <div className="mv-chat">
            <ChatPanel />
          </div>
        );

      case 'settings':
        return (
          <SettingsPanel
            profile={profile}
            busy={busy}
            feedback={feedback}
            onChange={handleProfileChange}
            onSave={handleSaveProfile}
          />
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
      userInitials={userInitials || 'P'}
      roleLabel="Patient"
      onLogout={logout}
      onHome={() => { window.location.href = '/'; }}
      onNotificationsClick={() => handleViewChange('notifications')}
      searchItems={searchItems}
    >
      {renderView()}
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
        <AISummaryModal
          documentId={summaryDoc.id}
          filename={summaryDoc.name}
          onClose={() => setSummaryDoc(null)}
        />
      )}
      <ToastStack toasts={toasts} />
    </DashboardShell>
  );
}
