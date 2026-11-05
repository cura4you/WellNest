import { WorkspaceHeading } from './WorkspaceHeading';
import { VitalsSummary } from './VitalsPanel';
import { AppointmentPreview } from './AppointmentsPanel';
import { AiAssistantCard } from './AiAssistantCard';
import { OverviewActions, OverviewActivity, OverviewFocus, OverviewMetrics, OverviewRecords } from './overviewUi';
import { ActivityIcon, CalendarPlusIcon, ClipboardIcon, FileIcon, ShieldCheckIcon, ShieldIcon } from './icons';
import type { PatientDashboardData, PatientView } from './types';

const destinations: Record<string, PatientView> = { docs: 'documents', pending: 'requests', active: 'requests', audit: 'audit' };
interface PatientOverviewProps {
  data: PatientDashboardData; onNavigate: (view: PatientView) => void; onViewDocument: (id: string) => void;
  showToast: (message: string, tone?: 'success' | 'info') => void;
}
export function PatientOverview({ data, onNavigate, onViewDocument }: PatientOverviewProps) {
  const pending = Number(data.metrics.find(m => m.key === 'pending')?.value) || data.accessRequests.filter(r => r.status === 'pending').length;
  return <>
    <WorkspaceHeading role="patient" actions={<button className="mv-btn mv-btn-accent" onClick={() => onNavigate('appointments')}><CalendarPlusIcon size={16} /> Request appointment</button>} />
    {pending > 0 ? <OverviewFocus attention title={`${pending} access request${pending === 1 ? '' : 's'} to review`} description="See who is asking, why they need access, and which records they want." label="Review requests" onOpen={() => onNavigate('requests')} /> : !data.documents.length && <OverviewFocus title="Welcome to your personal health space" description="Your care team adds records here. Start by reviewing your profile or planning your next visit." label="View your profile" onOpen={() => onNavigate('settings')} />}
    <OverviewMetrics metrics={data.metrics} labels={{ docs: 'Medical records', pending: 'Requests to review', active: 'Active access grants', audit: 'Record activity' }} icons={{ docs: <FileIcon size={16} />, pending: <ShieldCheckIcon size={16} />, active: <ActivityIcon size={16} />, audit: <ClipboardIcon size={16} /> }} onSelect={key => onNavigate(destinations[key] || 'overview')} />
    <div className="mv-overview-layout"><div className="mv-col">
      <AppointmentPreview role="patient" onOpen={() => onNavigate('appointments')} />
      <OverviewRecords documents={data.documents} onOpen={() => onNavigate('documents')} onView={onViewDocument} />
      <OverviewActivity events={data.auditEvents} onOpen={() => onNavigate('audit')} />
    </div><div className="mv-col">
      <OverviewActions actions={[
        { title: 'View documents', detail: 'Find a report or prescription', icon: <FileIcon size={19} />, onClick: () => onNavigate('documents') },
        { title: 'Health vitals', detail: 'Add your latest measurements', icon: <ActivityIcon size={19} />, onClick: () => onNavigate('vitals') },
        { title: 'Access requests', detail: 'Manage who can view your records', icon: <ShieldCheckIcon size={19} />, onClick: () => onNavigate('requests') },
        { title: 'Emergency contact', detail: 'Keep contact details up to date', icon: <ShieldIcon size={19} />, onClick: () => onNavigate('settings') },
      ]} />
      <VitalsSummary onOpen={() => onNavigate('vitals')} />
      <AiAssistantCard onOpenFullChat={() => onNavigate('chat')} />
    </div></div>
  </>;
}
