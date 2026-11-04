import type { ReactNode } from 'react';
import { FileIcon } from './icons';

export interface RoleListRow {
  id: string;
  title: string;
  meta?: string;
  detail?: string;
  status?: string;
  actions?: ReactNode;
  onClick?: () => void;
}

interface RoleListPanelProps {
  rows: RoleListRow[];
  emptyMessage: string;
  icon?: ReactNode;
}

function statusTone(status: string) {
  const value = status.toLowerCase();
  if (['active', 'approved', 'completed', 'verified', 'encrypted'].includes(value)) return 'is-approved';
  if (['pending', 'processing', 'queued'].includes(value)) return 'is-pending';
  return 'is-rejected';
}

export function RoleListPanel({ rows, emptyMessage, icon = <FileIcon size={16} /> }: RoleListPanelProps) {
  return (
    <div className="mv-card">
      <div className="mv-card-body">
        {rows.length === 0 ? <div className="mv-empty">{emptyMessage}</div> : rows.map((row) => (
          <div key={row.id} className={`mv-row mv-role-row${row.onClick ? ' is-clickable' : ''}`}>
            <span className="mv-role-icon">{icon}</span>
            {row.onClick ? (
              <button type="button" className="mv-role-row-main" onClick={row.onClick}>
                <span className="mv-row-title">{row.title}</span>
                {row.meta && <span className="mv-row-meta">{row.meta}</span>}
                {row.detail && <span className="mv-role-detail">{row.detail}</span>}
              </button>
            ) : (
              <div className="mv-role-row-main">
                <span className="mv-row-title">{row.title}</span>
                {row.meta && <span className="mv-row-meta">{row.meta}</span>}
                {row.detail && <span className="mv-role-detail">{row.detail}</span>}
              </div>
            )}
            {row.status && <span className={`mv-status-pill ${statusTone(row.status)}`}>{row.status}</span>}
            {row.actions && <div className="mv-role-actions">{row.actions}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}
