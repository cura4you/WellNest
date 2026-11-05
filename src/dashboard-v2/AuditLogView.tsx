import { readableLabel } from './overviewUi';
import { ClipboardIcon } from './icons';
import type { AuditEvent } from './types';

interface AuditLogViewProps {
  events: AuditEvent[];
}

export function AuditLogView({ events }: AuditLogViewProps) {
  return (
    <div className="mv-card">
      <div className="mv-card-body">
        {events.length === 0 ? (
          <div className="mv-empty">No audit events yet.</div>
        ) : (
          events.map((event) => (
            <div key={event.id} className="mv-row is-align-start">
              <ClipboardIcon size={15} style={{ color: 'var(--mv-text-faint)', flexShrink: 0, marginTop: 1 }} />
              <div style={{ minWidth: 0 }}>
                <div className="mv-row-title">{readableLabel(event.title)}</div>
                {event.description && <div className="mv-row-meta">{event.description}</div>}
              </div>
              <span className="mv-row-meta mv-tabular" style={{ marginLeft: 'auto', flexShrink: 0 }}>{event.time}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
