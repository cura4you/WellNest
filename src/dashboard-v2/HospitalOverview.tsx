import { WorkspaceHeading } from './WorkspaceHeading';
import { AppointmentPreview } from './AppointmentsPanel';
import type { ReactNode } from 'react';
import { AiAssistantCard } from './AiAssistantCard';
import {
  BuildingIcon,
  ClipboardIcon,
  ShieldCheckIcon,
  ShieldIcon,
  UploadIcon,
} from './icons';
import type { HospitalDashboardData, HospitalView } from './types';

const METRIC_ICONS: Record<string, ReactNode> = {
  staff: <BuildingIcon size={15} />,
  uploads: <UploadIcon size={15} />,
  verify: <ShieldCheckIcon size={15} />,
  compliance: <ClipboardIcon size={15} />,
};

const METRIC_DESTINATIONS: Record<string, HospitalView> = {
  staff: 'access',
  uploads: 'queue',
  verify: 'queue',
  compliance: 'compliance',
};

interface HospitalOverviewProps {
  data: HospitalDashboardData;
  onNavigate: (view: HospitalView) => void;
  onOpenUpload: () => void;
  showToast: (message: string, tone?: 'success' | 'info') => void;
}

export function HospitalOverview({ data, onNavigate, onOpenUpload }: HospitalOverviewProps) {
  const recentUploads = data.uploadQueue.slice(0, 3);
  const recentCompliance = data.complianceEvents.slice(0, 3);

  return (
    <>
      <WorkspaceHeading role="hospital" />
      <div className="mv-grid-4">
        {data.metrics.map((metric) => (
          <button
            key={metric.key}
            type="button"
            className="mv-tile mv-stat-tile is-clickable"
            onClick={() => onNavigate(METRIC_DESTINATIONS[metric.key] ?? 'overview')}
          >
            <div className="mv-stat-head">
              {METRIC_ICONS[metric.key] ?? <BuildingIcon size={15} />}
              <span className="mv-stat-label">{metric.title}</span>
            </div>
            <div className="mv-stat-value mv-tabular">{metric.value}</div>
            <span className="mv-stat-hint">{metric.hint}</span>
          </button>
        ))}
      </div>

      <AppointmentPreview role="hospital" onOpen={() => onNavigate('appointments')} />

      <div className="mv-two-col">
        <div className="mv-col">
          <div className="mv-card">
            <div className="mv-card-head">
              <span className="mv-card-title">Recent Uploads</span>
              <button type="button" className="mv-card-link" onClick={() => onNavigate('queue')}>View all</button>
            </div>
            <div className="mv-card-body">
              {recentUploads.length === 0 ? (
                <div className="mv-empty">No uploads yet.</div>
              ) : (
                recentUploads.map((row) => (
                  <div key={row.id} className="mv-row">
                    <UploadIcon size={16} style={{ color: 'var(--mv-accent-text)', flexShrink: 0 }} />
                    <div style={{ minWidth: 0 }}>
                      <div className="mv-row-title">{row.file}</div>
                      <div className="mv-row-meta mv-tabular">{row.patient} · {row.submittedAt}</div>
                    </div>
                    <span className="mv-status-text">{row.status}</span>
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
              <button type="button" className="mv-tile is-clickable mv-quick-tile" onClick={() => onNavigate('access')}>
                <BuildingIcon size={15} />
                <span>Staff<br />Access</span>
              </button>
              <button type="button" className="mv-tile is-clickable mv-quick-tile" onClick={() => onNavigate('compliance')}>
                <ClipboardIcon size={15} />
                <span>Compliance<br />&amp; Audit</span>
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
              <span className="mv-card-title">Compliance &amp; Audit</span>
              <button type="button" className="mv-card-link" onClick={() => onNavigate('compliance')}>View all</button>
            </div>
            <div className="mv-card-body">
              {recentCompliance.length === 0 ? (
                <div className="mv-empty">No compliance events yet.</div>
              ) : (
                recentCompliance.map((event) => (
                  <button
                    key={event.id}
                    type="button"
                    className="mv-row is-align-start is-clickable"
                    onClick={() => onNavigate('compliance')}
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
