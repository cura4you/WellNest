import { AppointmentPreview } from './AppointmentsPanel';
import type { ReactNode } from 'react';
import { AiAssistantCard } from './AiAssistantCard';
import {
  ActivityIcon,
  FileIcon,
  PillIcon,
  ShieldCheckIcon,
  ShieldIcon,
  UploadIcon,
} from './icons';
import type { DoctorDashboardData, DoctorView } from './types';

const METRIC_ICONS: Record<string, ReactNode> = {
  grants: <ShieldCheckIcon size={15} />,
  pending: <ActivityIcon size={15} />,
  emergency: <ShieldIcon size={15} />,
  views: <FileIcon size={15} />,
};

// Where each metric tile navigates on click — same reasoning as Patient's
// Overview: route to whichever real tab the number actually corresponds to.
const METRIC_DESTINATIONS: Record<string, DoctorView> = {
  grants: 'grants',
  pending: 'history',
  emergency: 'emergency',
  views: 'shared-docs',
};

interface DoctorOverviewProps {
  data: DoctorDashboardData;
  onNavigate: (view: DoctorView) => void;
  onViewDocument: (docId: string) => void;
  onOpenUpload: () => void;
  showToast: (message: string, tone?: 'success' | 'info') => void;
}

export function DoctorOverview({ data, onNavigate, onViewDocument, onOpenUpload }: DoctorOverviewProps) {
  const recentDocuments = data.sharedDocuments.slice(0, 3);
  const recentActivity = data.auditEvents.slice(0, 3);

  return (
    <>
      <div className="mv-grid-4">
        {data.metrics.map((metric) => (
          <button
            key={metric.key}
            type="button"
            className="mv-tile mv-stat-tile is-clickable"
            onClick={() => onNavigate(METRIC_DESTINATIONS[metric.key] ?? 'overview')}
          >
            <div className="mv-stat-head">
              {METRIC_ICONS[metric.key] ?? <ActivityIcon size={15} />}
              <span className="mv-stat-label">{metric.title}</span>
            </div>
            <div className="mv-stat-value mv-tabular">{metric.value}</div>
            <span className="mv-stat-hint">{metric.hint}</span>
          </button>
        ))}
      </div>

      <AppointmentPreview role="doctor" onOpen={() => onNavigate('appointments')} />

      <div className="mv-two-col">
        <div className="mv-col">
          <div className="mv-card">
            <div className="mv-card-head">
              <span className="mv-card-title">Recently Shared Documents</span>
              <button type="button" className="mv-card-link" onClick={() => onNavigate('shared-docs')}>View all</button>
            </div>
            <div className="mv-card-body">
              {recentDocuments.length === 0 ? (
                <div className="mv-empty">No documents shared with you yet.</div>
              ) : (
                recentDocuments.map((doc) => (
                  <div key={doc.id} className="mv-row">
                    <FileIcon size={16} style={{ color: 'var(--mv-accent-text)', flexShrink: 0 }} />
                    <div style={{ minWidth: 0 }}>
                      <div className="mv-row-title">{doc.name}</div>
                      <div className="mv-row-meta mv-tabular">{doc.patient} · {doc.date}</div>
                    </div>
                    <span className={`mv-status-text ${doc.status === 'encrypted' ? 'mv-status-green' : ''}`}>
                      {doc.status === 'encrypted' ? 'Encrypted' : 'Stored'}
                    </span>
                    <button
                      type="button"
                      className="mv-btn mv-btn-ghost mv-btn-sm mv-reveal"
                      style={{ marginLeft: 10 }}
                      onClick={() => onViewDocument(doc.id)}
                    >
                      View
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="mv-col">
          <div className="mv-card mv-card-pad">
            <span className="mv-card-title">Quick Actions</span>
            <div className="mv-grid-4" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
              <button type="button" className="mv-tile is-clickable mv-quick-tile" onClick={onOpenUpload}>
                <UploadIcon size={15} />
                <span>Upload<br />Document</span>
              </button>
              <button type="button" className="mv-tile is-clickable mv-quick-tile" onClick={() => onNavigate('request')}>
                <ShieldCheckIcon size={15} />
                <span>Request<br />Access</span>
              </button>
              <button type="button" className="mv-tile is-clickable mv-quick-tile" onClick={() => onNavigate('drug-interactions')}>
                <PillIcon size={15} />
                <span>Drug<br />Interactions</span>
              </button>
              <button type="button" className="mv-tile is-danger is-clickable mv-quick-tile" onClick={() => onNavigate('emergency')}>
                <ShieldIcon size={15} />
                <span>Emergency<br />Access</span>
              </button>
            </div>
          </div>

          <AiAssistantCard onOpenFullChat={() => onNavigate('chat')} />

          <div className="mv-card">
            <div className="mv-card-head">
              <span className="mv-card-title">Recent Activity</span>
              <button type="button" className="mv-card-link" onClick={() => onNavigate('activity')}>View all</button>
            </div>
            <div className="mv-card-body">
              {recentActivity.length === 0 ? (
                <div className="mv-empty">No activity yet.</div>
              ) : (
                recentActivity.map((event) => (
                  <button
                    key={event.id}
                    type="button"
                    className="mv-row is-align-start is-clickable"
                    onClick={() => onNavigate('activity')}
                  >
                    <span className="mv-unread-dot" style={{ background: 'var(--mv-blue)' }} />
                    <div style={{ minWidth: 0 }}>
                      <div className="mv-row-title" style={{ fontWeight: 500, fontSize: 12 }}>{event.title}</div>
                      <div className="mv-row-meta mv-tabular">{event.time}</div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
