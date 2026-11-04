// Health Vitals and Upcoming Appointments below are hardcoded sample data; no
// backend exists for either yet. See CLAUDE.md for full status.
import type { ReactNode } from 'react';
import { AiAssistantCard } from './AiAssistantCard';
import {
  ActivityIcon,
  CalendarCheckIcon,
  CalendarPlusIcon,
  ClipboardIcon,
  DropletIcon,
  FileIcon,
  HeartIcon,
  ShieldCheckIcon,
  ShieldIcon,
} from './icons';
import type { PatientDashboardData, PatientView } from './types';

const METRIC_ICONS: Record<string, ReactNode> = {
  docs: <FileIcon size={15} />,
  pending: <ShieldCheckIcon size={15} />,
  active: <ActivityIcon size={15} />,
  audit: <ClipboardIcon size={15} />,
};

// Where each metric tile navigates on click. "active" (Active Grants) has no
// dedicated tab of its own — Access Requests is where grant status actually
// lives (the approved pill), so it's the closest real destination.
const METRIC_DESTINATIONS: Record<string, PatientView> = {
  docs: 'documents',
  pending: 'requests',
  active: 'requests',
  audit: 'audit',
};

interface PatientOverviewProps {
  data: PatientDashboardData;
  onNavigate: (view: PatientView) => void;
  onViewDocument: (docId: string) => void;
  showToast: (message: string, tone?: 'success' | 'info') => void;
}

export function PatientOverview({ data, onNavigate, onViewDocument, showToast }: PatientOverviewProps) {
  const recentDocuments = data.documents.slice(0, 3);
  const recentActivity = data.auditEvents.slice(0, 3);

  const notConnected = () => showToast("This isn't connected yet — sample data for now.", 'info');

  return (
    <>
      {/* Real vault metrics */}
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

      {/* Sample vitals — not backed by real data yet */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <span className="mv-card-title">Health Vitals</span>
          <span className="mv-sample-badge">Sample data</span>
        </div>
        <div className="mv-grid-4">
          <div className="mv-tile mv-stat-tile">
            <div className="mv-stat-head"><HeartIcon size={15} /><span className="mv-stat-label">Heart Rate</span></div>
            <div className="mv-stat-value mv-tabular">76 <small>bpm</small></div>
            <span className="mv-stat-hint mv-status-green">Normal range</span>
          </div>
          <div className="mv-tile mv-stat-tile">
            <div className="mv-stat-head"><ActivityIcon size={15} /><span className="mv-stat-label">Blood Pressure</span></div>
            <div className="mv-stat-value mv-tabular">118/76 <small>mmHg</small></div>
            <span className="mv-stat-hint mv-status-green">Normal range</span>
          </div>
          <div className="mv-tile mv-stat-tile">
            <div className="mv-stat-head"><DropletIcon size={15} /><span className="mv-stat-label">Blood Glucose</span></div>
            <div className="mv-stat-value mv-tabular">94 <small>mg/dL fasting</small></div>
            <span className="mv-stat-hint mv-status-green">Normal range</span>
          </div>
          <div className="mv-tile mv-stat-tile">
            <div className="mv-stat-head"><CalendarCheckIcon size={15} /><span className="mv-stat-label">Last Checkup</span></div>
            <div className="mv-stat-value">Aug 12</div>
            <span className="mv-stat-hint">General Physician</span>
          </div>
        </div>
      </div>

      <div className="mv-two-col">
        <div className="mv-col">
          {/* Sample appointments */}
          <div className="mv-card">
            <div className="mv-card-head">
              <span className="mv-card-title">Upcoming Appointments</span>
              <span className="mv-sample-badge">Sample data</span>
            </div>
            <div className="mv-card-body">
              <div className="mv-row">
                <div className="mv-avatar">MI</div>
                <div>
                  <div className="mv-row-title">Dr. Meera Iyer</div>
                  <div className="mv-row-meta">Cardiologist</div>
                </div>
                <div className="mv-row-trailing mv-tabular">
                  <div style={{ fontWeight: 700, color: 'var(--mv-accent-text)', fontSize: 12.5 }}>Today</div>
                  <div className="mv-row-meta">4:30 PM</div>
                </div>
                <button type="button" className="mv-btn mv-btn-accent" onClick={notConnected}>Join</button>
              </div>
              <div className="mv-row">
                <div className="mv-avatar">AR</div>
                <div>
                  <div className="mv-row-title">Dr. Arjun Rao</div>
                  <div className="mv-row-meta">Endocrinologist</div>
                </div>
                <div className="mv-row-trailing mv-tabular">
                  <div style={{ fontWeight: 500, fontSize: 12.5 }}>Fri, Sep 18</div>
                  <div className="mv-row-meta">11:00 AM</div>
                </div>
                <button type="button" className="mv-btn mv-btn-ghost" onClick={notConnected}>Reschedule</button>
              </div>
              <div className="mv-row">
                <div className="mv-avatar">PN</div>
                <div>
                  <div className="mv-row-title">Dr. Priya Nair</div>
                  <div className="mv-row-meta">General Physician</div>
                </div>
                <div className="mv-row-trailing mv-tabular">
                  <div style={{ fontWeight: 500, fontSize: 12.5 }}>Mon, Sep 22</div>
                  <div className="mv-row-meta">9:30 AM</div>
                </div>
                <button type="button" className="mv-btn mv-btn-ghost" onClick={notConnected}>Reschedule</button>
              </div>
            </div>
          </div>

          {/* Real recent documents */}
          <div className="mv-card">
            <div className="mv-card-head">
              <span className="mv-card-title">Recent Documents</span>
              <button type="button" className="mv-card-link" onClick={() => onNavigate('documents')}>View all</button>
            </div>
            <div className="mv-card-body">
              {recentDocuments.length === 0 ? (
                <div className="mv-empty">No documents uploaded yet.</div>
              ) : (
                recentDocuments.map((doc) => (
                  <div key={doc.id} className="mv-row">
                    <FileIcon size={16} style={{ color: 'var(--mv-accent-text)', flexShrink: 0 }} />
                    <div style={{ minWidth: 0 }}>
                      <div className="mv-row-title">{doc.name}</div>
                      <div className="mv-row-meta mv-tabular">{doc.uploadedBy} · {doc.date}</div>
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
          {/* Quick actions */}
          <div className="mv-card mv-card-pad">
            <span className="mv-card-title">Quick Actions</span>
            <div className="mv-grid-4" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
              <button type="button" className="mv-tile is-clickable mv-quick-tile" onClick={() => onNavigate('documents')}>
                <FileIcon size={15} />
                <span>View<br />Documents</span>
              </button>
              <button type="button" className="mv-tile is-clickable mv-quick-tile" onClick={() => onNavigate('requests')}>
                <ShieldCheckIcon size={15} />
                <span>Review<br />Access Requests</span>
              </button>
              <button type="button" className="mv-tile is-clickable mv-quick-tile" onClick={notConnected}>
                <CalendarPlusIcon size={15} />
                <span>Book<br />Appointment</span>
              </button>
              <button type="button" className="mv-tile is-danger is-clickable mv-quick-tile" onClick={() => onNavigate('settings')}>
                <ShieldIcon size={15} />
                <span>Emergency<br />Card</span>
              </button>
            </div>
          </div>

          {/* Real AI assistant, hits the actual RAG endpoint */}
          <AiAssistantCard onOpenFullChat={() => onNavigate('chat')} />

          {/* Real recent activity, from audit log */}
          <div className="mv-card">
            <div className="mv-card-head">
              <span className="mv-card-title">Recent Activity</span>
              <button type="button" className="mv-card-link" onClick={() => onNavigate('audit')}>View all</button>
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
                    onClick={() => onNavigate('audit')}
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
