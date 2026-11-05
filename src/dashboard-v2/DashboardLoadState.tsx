import { Link } from 'react-router-dom';
import { ActivityIcon } from './icons';

export function DashboardLoadState({ loading, error, onRetry, role }: {
  loading: boolean; error: { message: string; status?: number } | null; onRetry: () => void;
  role: 'patient' | 'doctor' | 'hospital';
}) {
  if (loading) return <section className="mv-load-state" aria-busy="true" aria-label="Loading dashboard"><p role="status">Loading your workspace…</p><div className="mv-grid-4">{[0, 1, 2, 3].map(i => <div className="mv-skeleton" key={i} />)}</div><div className="mv-skeleton mv-skeleton-content" /></section>;
  return <section className="mv-card mv-recovery" role="alert"><ActivityIcon size={28} /><h2>{error?.status === 401 ? 'Please sign in again' : 'We couldn’t load your workspace'}</h2><p>{error?.message || 'Your information could not be loaded. Please try again.'}</p><div className="mv-role-actions">{error?.status === 401 ? <Link className="mv-btn mv-btn-accent" to={`/login/${role}`}>Sign in again</Link> : <button className="mv-btn mv-btn-accent" type="button" onClick={onRetry}>Try again</button>}</div></section>;
}
