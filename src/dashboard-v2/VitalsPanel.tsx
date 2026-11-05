import { useEffect, useState } from 'react';
import { careRequest, localDateTime, type Vital } from '../services/careApi';
const fields = [
  ['heartRate', 'Heart rate', 'bpm', 1, 400], ['systolic', 'Systolic pressure', 'mmHg', 20, 350],
  ['diastolic', 'Diastolic pressure', 'mmHg', 10, 250], ['glucose', 'Blood glucose', 'mg/dL', 1, 1500],
] as const;
const blank = () => ({ measuredAt: localDateTime(), heartRate: '', systolic: '', diastolic: '', glucose: '', notes: '' });
export function VitalsPanel() {
  const [vitals, setVitals] = useState<Vital[]>([]);
  const [form, setForm] = useState(blank);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false);
  const [error, setError] = useState(''), [message, setMessage] = useState('');
  const load = async () => { const data = await careRequest<{ vitals: Vital[] }>('/vitals'); setVitals(data.vitals); };
  useEffect(() => { load().catch((e) => setError(e.message)).finally(() => setLoading(false)); }, []);
  return <div className="mv-care-stack">
    <form className="mv-card mv-card-pad" onSubmit={async (event) => {
      event.preventDefault(); setBusy(true); setError(''); setMessage('');
      try {
        const body = { ...form, measuredAt: new Date(form.measuredAt).toISOString(), ...Object.fromEntries(fields.map(([key]) => [key, form[key] === '' ? null : Number(form[key])])) };
        await careRequest('/vitals', 'POST', body); await load(); setForm(blank()); setMessage('Measurement saved.');
      } catch (e: any) { setError(e.message); } finally { setBusy(false); }
    }}>
      <h2 className="mv-card-title">Record your vitals</h2>
      <p className="mv-care-note">Enter your own measurements. Blood glucose uses mg/dL. These entries are private to your patient account and are not a clinical interpretation.</p>
      <div className="mv-form-grid">
        <div className="mv-form-field span-2"><label className="mv-form-label" htmlFor="measuredAt">Measured at</label><input className="mv-form-input" id="measuredAt" type="datetime-local" required max={localDateTime()} value={form.measuredAt} onChange={(e) => setForm({ ...form, measuredAt: e.target.value })} /></div>
        {fields.map(([key, label, unit, min, max]) => <div className="mv-form-field" key={key}><label className="mv-form-label" htmlFor={key}>{label} ({unit})</label><input className="mv-form-input" id={key} type="number" min={min} max={max} step="0.1" value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} /></div>)}
        <div className="mv-form-field span-2"><label className="mv-form-label" htmlFor="vitalNotes">Notes (optional)</label><textarea className="mv-form-input" id="vitalNotes" maxLength={1000} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
      </div>
      <div><button className="mv-btn mv-btn-accent" disabled={busy}>{busy ? 'Saving…' : 'Save measurement'}</button></div>
    </form>
    {error && <p className="mv-care-error" role="alert">{error}</p>}{message && <p className="mv-role-feedback" role="status">{message}</p>}
    <div className="mv-card"><div className="mv-card-head"><h2 className="mv-card-title">Measurement history</h2><span className="mv-row-meta">Latest 100 entries</span></div>
      {loading ? <p className="mv-empty">Loading measurements…</p> : !vitals.length ? <p className="mv-empty">No measurements recorded yet.</p> : vitals.map((v) => <article className="mv-row mv-role-row" key={v.id}>
        <div className="mv-role-row-main"><strong className="mv-row-title">{new Date(v.measuredAt).toLocaleString()}</strong><span className="mv-row-meta">{[v.heartRate && `${v.heartRate} bpm`, v.systolic && `${v.systolic}/${v.diastolic} mmHg`, v.glucose && `${v.glucose} mg/dL`].filter(Boolean).join(' · ')}</span>{v.notes && <span className="mv-row-meta">{v.notes}</span>}</div>
        <button type="button" className="mv-btn mv-btn-ghost mv-btn-sm" disabled={busy} onClick={async () => {
          if (!window.confirm('Delete this measurement?')) return;
          setBusy(true); setError(''); try { await careRequest(`/vitals/${v.id}`, 'DELETE'); await load(); setMessage('Measurement deleted.'); } catch (e: any) { setError(e.message); } finally { setBusy(false); }
        }}>Delete measurement</button>
      </article>)}
    </div>
  </div>;
}
export function VitalsSummary({ onOpen }: { onOpen: () => void }) {
  const [vitals, setVitals] = useState<Vital[] | null>(null), [error, setError] = useState('');
  useEffect(() => { careRequest<{ vitals: Vital[] }>('/vitals').then((r) => setVitals(r.vitals)).catch((e) => setError(e.message)); }, []);
  return <section className="mv-card mv-vitals-summary"><div className="mv-card-head"><h2 className="mv-card-title">Health Vitals</h2><button className="mv-card-link" onClick={onOpen}>Record vitals</button></div>
    {error ? <p className="mv-care-error" role="alert">{error}</p> : vitals === null ? <p className="mv-empty">Loading vitals…</p> : !vitals.length ? <p className="mv-empty">No measurements yet. Record your first vitals.</p> : <div className="mv-care-metrics">{fields.map(([key, label, unit]) => {
      const v = vitals.find((entry) => entry[key] !== null);
      return <div key={key}><span className="mv-row-meta">{label}</span><strong>{v?.[key] ?? '—'} <small>{unit}</small></strong><span className="mv-row-meta">{v ? new Date(v.measuredAt).toLocaleDateString() : 'Not recorded'}</span></div>;
    })}</div>}
  </section>;
}
