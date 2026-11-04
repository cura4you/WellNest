import { useEffect, useState } from 'react';
import type { NotificationSetting } from './types';
import { careRequest, type InboxNotification } from '../services/careApi';
export function NotificationsPanel({ notifications }: { notifications: NotificationSetting[] }) {
  const [preferences, setPreferences] = useState(notifications), [inbox, setInbox] = useState<InboxNotification[]>([]);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState('');
  const [error, setError] = useState(''), [message, setMessage] = useState('');
  useEffect(() => {
    Promise.all([
      careRequest<{ preferences: NotificationSetting[] }>('/notification-preferences'),
      careRequest<{ notifications: InboxNotification[] }>('/notifications'),
    ]).then(([p, n]) => { setPreferences(p.preferences); setInbox(n.notifications); }).catch((e) => setError(e.message)).finally(() => setLoading(false));
  }, []);
  return <div className="mv-care-stack">
    {error && <p className="mv-care-error" role="alert">{error}</p>}{message && <p className="mv-role-feedback" role="status">{message}</p>}
    <div className="mv-card"><div className="mv-card-head"><h2 className="mv-card-title">Notification preferences</h2></div>
      <p className="mv-care-note mv-care-inset">These settings control new in-app alerts. Changes are saved to your account; email and SMS delivery are not connected.</p>
      {loading ? <p className="mv-empty">Loading preferences…</p> : preferences.map((entry) => <div key={entry.id} className="mv-row">
        <div className="mv-role-row-main"><strong className="mv-row-title">{entry.channel}</strong><span className="mv-row-meta">{entry.description}</span></div>
        <button type="button" className={`mv-switch${entry.enabled ? ' is-on' : ''}`} role="switch" aria-checked={entry.enabled} aria-label={`Toggle ${entry.channel} notifications`} disabled={Boolean(busy)} onClick={async () => {
          setBusy(entry.id); setError(''); setMessage('');
          try { const result = await careRequest<{ preferences: NotificationSetting[] }>(`/notification-preferences/${entry.id}`, 'PUT', { enabled: !entry.enabled }); setPreferences(result.preferences); setMessage('Notification preference saved.'); }
          catch (e: any) { setError(e.message); } finally { setBusy(''); }
        }}><span className="mv-switch-knob" /></button>
      </div>)}
    </div>
    <div className="mv-card"><div className="mv-card-head"><h2 className="mv-card-title">Recent notifications</h2><button className="mv-card-link" disabled={Boolean(busy)} onClick={async () => {
      setBusy('refresh'); setError(''); try { setInbox((await careRequest<{ notifications: InboxNotification[] }>('/notifications')).notifications); } catch (e: any) { setError(e.message); } finally { setBusy(''); }
    }}>Refresh notifications</button></div>
      {loading ? <p className="mv-empty">Loading alerts…</p> : !inbox.length ? <p className="mv-empty">No notifications yet.</p> : inbox.map((n) => <article className="mv-row mv-role-row" key={n.id}>
        <div className="mv-role-row-main"><strong className="mv-row-title">{n.title}</strong><span className="mv-row-meta">{n.body}</span><span className="mv-row-meta">{new Date(n.createdAt).toLocaleString()} · {n.status}</span></div>
        {n.status === 'unread' && <button className="mv-btn mv-btn-ghost mv-btn-sm" disabled={Boolean(busy)} onClick={async () => {
          setBusy(n.id); setError(''); try { await careRequest(`/notifications/${n.id}/read`, 'PATCH'); setInbox((items) => items.map((item) => item.id === n.id ? { ...item, status: 'read' } : item)); } catch (e: any) { setError(e.message); } finally { setBusy(''); }
        }}>Mark read</button>}
      </article>)}
    </div>
  </div>;
}
