import { WorkspaceHeading } from './WorkspaceHeading';
import { AppointmentPreview } from './AppointmentsPanel';
import { AiAssistantCard } from './AiAssistantCard';
import { OverviewActions, OverviewActivity, OverviewFocus, OverviewMetrics, OverviewRecords } from './overviewUi';
import { ActivityIcon, CalendarPlusIcon, FileIcon, PillIcon, ShieldCheckIcon, ShieldIcon, UploadIcon } from './icons';
import type { DoctorDashboardData, DoctorView } from './types';

const destinations: Record<string, DoctorView> = { grants: 'grants', pending: 'history', emergency: 'emergency', views: 'shared-docs' };
interface DoctorOverviewProps {
  data: DoctorDashboardData; onNavigate: (view: DoctorView) => void; onViewDocument: (id: string) => void;
  onOpenUpload: () => void; showToast: (message: string, tone?: 'success' | 'info') => void;
}
export function DoctorOverview({ data, onNavigate, onViewDocument, onOpenUpload }: DoctorOverviewProps) {
  const pending = Number(data.metrics.find(m => m.key === 'pending')?.value) || data.requestHistory.filter(r => r.status === 'pending').length;
  return <>
    <WorkspaceHeading role="doctor" actions={<><button className="mv-btn mv-btn-ghost" onClick={() => onNavigate('request')}>Request access</button><button className="mv-btn mv-btn-accent" onClick={onOpenUpload}><UploadIcon size={16} /> Upload Document</button></>} />
    {pending > 0 ? <OverviewFocus title={`${pending} request${pending === 1 ? '' : 's'} awaiting patient approval`} description="Patients choose which records to share. Check the status of your submitted requests." label="Check request status" onOpen={() => onNavigate('history')} /> : !data.sharedDocuments.length && <OverviewFocus title="Request the records you need" description="Find a registered patient and request the records you need. They stay in control of access." label="Request record access" onOpen={() => onNavigate('request')} />}
    <OverviewMetrics metrics={data.metrics} labels={{ grants: 'Active access grants', pending: 'Awaiting approval', emergency: 'Emergency access history', views: 'Document views' }} icons={{ grants: <ShieldCheckIcon size={16} />, pending: <ActivityIcon size={16} />, emergency: <ShieldIcon size={16} />, views: <FileIcon size={16} /> }} onSelect={key => onNavigate(destinations[key] || 'overview')} />
    <div className="mv-overview-layout"><div className="mv-col">
      <AppointmentPreview role="doctor" onOpen={() => onNavigate('appointments')} />
      <OverviewRecords doctor documents={data.sharedDocuments} onOpen={() => onNavigate('shared-docs')} onView={onViewDocument} />
      <OverviewActivity events={data.auditEvents} onOpen={() => onNavigate('activity')} />
    </div><div className="mv-col">
      <OverviewActions actions={[
        { title: 'Request access', detail: 'Ask a patient to share records', icon: <ShieldCheckIcon size={19} />, onClick: () => onNavigate('request') },
        { title: 'Appointments', detail: 'Confirm requests and manage visits', icon: <CalendarPlusIcon size={19} />, onClick: () => onNavigate('appointments') },
        { title: 'Drug interactions', detail: 'Review or record interaction notes', icon: <PillIcon size={19} />, onClick: () => onNavigate('drug-interactions') },
        { title: 'Emergency access', detail: 'Open the consented emergency flow', icon: <ShieldIcon size={19} />, onClick: () => onNavigate('emergency'), urgent: true },
      ]} />
      <AiAssistantCard onOpenFullChat={() => onNavigate('chat')} />
      <section className="mv-card mv-sharing-note"><ShieldCheckIcon size={21} /><div><h3>Access stays with the patient</h3><p>Appointments and uploads do not grant access to other records. Check your current permissions before a consultation.</p><button type="button" className="mv-card-link" onClick={() => onNavigate('grants')}>View active grants →</button></div></section>
    </div></div>
  </>;
}
