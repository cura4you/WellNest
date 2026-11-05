import type { ReactNode } from 'react';
import { ActivityIcon, FileIcon, ShieldCheckIcon } from './icons';
import type { AuditEvent, Metric } from './types';

export function readableLabel(value: string) {
  const labels: Record<string, string> = {
    upload: 'Document upload activity', view_document: 'Document access activity', download_document: 'Document download activity',
    request_document_access: 'Record access request', share_document: 'Record sharing activity',
    ai_summarize: 'AI summary activity', chat_query: 'AI record lookup',
    drug_interaction_write: 'Interaction note activity', emergency_access: 'Emergency access activity',
    specific_documents: 'Selected documents', full_history: 'Full record history', lab_report: 'Lab report',
    discharge_summary: 'Discharge summary',
  };
  return labels[value] || value.replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());
}

export function OverviewMetrics({ metrics, icons, labels = {}, onSelect }: {
  metrics: Metric[]; icons: Record<string, ReactNode>; labels?: Record<string, string>; onSelect: (key: string) => void;
}) {
  return <div className="mv-grid-4 mv-overview-metrics">{metrics.map(metric => <button key={metric.key} type="button" className="mv-tile mv-stat-tile is-clickable" onClick={() => onSelect(metric.key)}>
    <div className="mv-stat-head">{icons[metric.key] || <ActivityIcon size={16} />}<span className="mv-stat-label">{labels[metric.key] || metric.title}</span></div>
    <strong className="mv-stat-value mv-tabular">{metric.value}</strong><span className="mv-stat-hint">{metric.hint}</span>
  </button>)}</div>;
}

export function OverviewFocus({ title, description, label, onOpen, attention = false }: {
  title: string; description: string; label: string; onOpen: () => void; attention?: boolean;
}) {
  return <section className={`mv-overview-focus${attention ? ' needs-attention' : ''}`} aria-label={attention ? 'Needs your attention' : 'Getting started'}>
    <span className="mv-overview-focus-icon"><ShieldCheckIcon size={22} /></span><div><h3>{title}</h3><p>{description}</p></div>
    <button type="button" className="mv-btn mv-btn-ghost" onClick={onOpen}>{label}<span aria-hidden="true"> →</span></button>
  </section>;
}

export interface OverviewAction { title: string; detail: string; icon: ReactNode; onClick: () => void; urgent?: boolean }
export function OverviewActions({ actions }: { actions: OverviewAction[] }) {
  return <section className="mv-card mv-overview-actions"><div className="mv-card-head"><h2 className="mv-card-title">Quick Actions</h2></div><div className="mv-action-list">{actions.map(action => <button type="button" key={action.title} className={`mv-overview-action${action.urgent ? ' is-urgent' : ''}`} onClick={action.onClick}>
    <span className="mv-action-symbol">{action.icon}</span><span><strong>{action.title}</strong><small>{action.detail}</small></span><span aria-hidden="true">↗</span>
  </button>)}</div></section>;
}

interface RecentRecord { id: string; name: string; type: string; date: string; status: string; uploadedBy?: string; patient?: string }
export function OverviewRecords({ documents, doctor = false, onOpen, onView }: {
  documents: RecentRecord[]; doctor?: boolean; onOpen: () => void; onView: (id: string) => void;
}) {
  const recent = [...documents].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3);
  return <section className="mv-card mv-overview-records"><div className="mv-card-head"><div><h2 className="mv-card-title">{doctor ? 'Recently Shared Documents' : 'Recent Documents'}</h2><p className="mv-section-caption">{doctor ? 'Authorized records from your patients.' : 'Reports and prescriptions from your care team.'}</p></div><button type="button" className="mv-card-link" onClick={onOpen}>View all</button></div>
    {!recent.length ? <div className="mv-useful-empty"><span className="mv-empty-symbol"><FileIcon size={24} /></span><h3>{doctor ? 'Patient records will appear here' : 'Your records have a home'}</h3><p>{doctor ? 'Request access from a patient to review the documents they choose to share.' : 'Your doctor or hospital can upload records to your vault. You can open and download them here.'}</p></div> : recent.map(doc => <div className="mv-row mv-record-preview" key={doc.id}>
      <span className="mv-record-file"><FileIcon size={19} /></span><div className="mv-record-main"><strong className="mv-row-title">{doc.name}</strong><span className="mv-row-meta">{readableLabel(doc.type)} · {doctor ? doc.patient : doc.uploadedBy}</span><span className="mv-row-meta">Added {doc.date}</span></div>
      <button type="button" className="mv-btn mv-btn-ghost mv-btn-sm" onClick={() => onView(doc.id)} aria-label={`View ${doc.name}`}>View</button>
    </div>)}
  </section>;
}

export function OverviewActivity({ events, onOpen }: { events: AuditEvent[]; onOpen: () => void }) {
  return <section className="mv-card mv-overview-activity"><div className="mv-card-head"><h2 className="mv-card-title">Recent Activity</h2><button className="mv-card-link" type="button" onClick={onOpen}>View all</button></div>
    {events.length ? events.slice(0, 3).map(event => <button className="mv-row mv-activity-preview is-clickable" type="button" key={event.id} onClick={onOpen}><span className="mv-activity-marker" /><span><strong className="mv-row-title">{readableLabel(event.title)}</strong><span className="mv-row-meta">{event.time}</span></span></button>) : <p className="mv-empty">Document and access activity will appear here.</p>}
  </section>;
}
