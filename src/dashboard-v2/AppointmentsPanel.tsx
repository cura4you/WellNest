import { useEffect, useState } from 'react';
import { careRequest, localDateTime, type Appointment } from '../services/careApi';
const emptyForm = () => ({ participantEmail: '', startsAt: localDateTime(new Date(Date.now() + 86400000)), durationMinutes: 30, reason: '', location: '' });
export function AppointmentsPanel({ role }: { role: 'patient' | 'doctor' | 'hospital' }) {
  const [items, setItems] = useState<Appointment[]>([]), [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState<Appointment | null>(null), [filter, setFilter] = useState('upcoming');
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false);
  const [error, setError] = useState(''), [message, setMessage] = useState('');
  const load = async () => { setItems((await careRequest<{ appointments: Appointment[] }>('/appointments')).appointments); };
  useEffect(() => { load().catch((e) => setError(e.message)).finally(() => setLoading(false)); }, []);
  const changeStatus = async (a: Appointment, action: string) => {
    if (action === 'cancel' && !window.confirm('Cancel this appointment?')) return;
    setBusy(true); setError(''); setMessage('');
    try { await careRequest(`/appointments/${a.id}`, 'PATCH', { action, version: a.version }); await load(); setMessage('Appointment updated.'); }
    catch (e: any) { setError(e.message); await load().catch(() => {}); } finally { setBusy(false); }
  };
  const visible = items.filter((a) => filter === 'all' || (['requested', 'confirmed'].includes(a.status) && new Date(a.startsAt).getTime() + a.durationMinutes * 60000 > Date.now()))
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
  return <div className="mv-care-stack">
    <form className="mv-card mv-card-pad" onSubmit={async (event) => {
      event.preventDefault(); setBusy(true); setError(''); setMessage('');
      try {
        const body = { ...form, startsAt: new Date(form.startsAt).toISOString(), ...(editing ? { action: 'reschedule', version: editing.version } : {}) };
        await careRequest(editing ? `/appointments/${editing.id}` : '/appointments', editing ? 'PATCH' : 'POST', body);
        await load(); setEditing(null); setForm(emptyForm()); setMessage(editing ? 'Appointment rescheduled.' : role === 'patient' ? 'Appointment requested.' : 'Appointment scheduled.');
      } catch (e: any) { setError(e.message); } finally { setBusy(false); }
    }}>
      <h2 className="mv-card-title">{editing ? 'Reschedule appointment' : role === 'patient' ? 'Request an appointment' : 'Schedule an appointment'}</h2>
      <p className="mv-care-note">Use an existing account’s email. Patient requests require provider confirmation and reserve that time until cancelled. Times are shown in {Intl.DateTimeFormat().resolvedOptions().timeZone}. Scheduling does not grant access to medical records.</p>
      <div className="mv-form-grid">
        <div className="mv-form-field"><label className="mv-form-label" htmlFor="participantEmail">{role === 'patient' ? 'Doctor or hospital email' : 'Patient email'}</label><input className="mv-form-input" id="participantEmail" type="email" required disabled={Boolean(editing)} value={form.participantEmail} onChange={(e) => setForm({ ...form, participantEmail: e.target.value })} /></div>
        <div className="mv-form-field"><label className="mv-form-label" htmlFor="appointmentTime">Appointment time</label><input className="mv-form-input" id="appointmentTime" type="datetime-local" required min={localDateTime()} value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} /></div>
        <div className="mv-form-field"><label className="mv-form-label" htmlFor="appointmentDuration">Duration (minutes)</label><input className="mv-form-input" id="appointmentDuration" type="number" min={15} max={120} required value={form.durationMinutes} onChange={(e) => setForm({ ...form, durationMinutes: Number(e.target.value) })} /></div>
        <div className="mv-form-field"><label className="mv-form-label" htmlFor="appointmentLocation">Location (optional)</label><input className="mv-form-input" id="appointmentLocation" maxLength={300} value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></div>
        <div className="mv-form-field span-2"><label className="mv-form-label" htmlFor="appointmentReason">Reason for visit</label><textarea className="mv-form-input" id="appointmentReason" required maxLength={500} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></div>
      </div>
      <div className="mv-role-actions"><button className="mv-btn mv-btn-accent" disabled={busy}>{busy ? 'Saving…' : editing ? 'Save new time' : role === 'patient' ? 'Request appointment' : 'Schedule appointment'}</button>{editing && <button type="button" className="mv-btn mv-btn-ghost" onClick={() => { setEditing(null); setForm(emptyForm()); }}>Stop editing</button>}</div>
    </form>
    {error && <p className="mv-care-error" role="alert">{error}</p>}{message && <p className="mv-role-feedback" role="status">{message}</p>}
    <div className="mv-card"><div className="mv-card-head"><h2 className="mv-card-title">Your appointments</h2><button type="button" className="mv-card-link" disabled={busy} onClick={async () => { setBusy(true); setError(''); try { await load(); } catch (e: any) { setError(e.message); } finally { setBusy(false); } }}>Refresh appointments</button><select aria-label="Appointment filter" className="mv-select" value={filter} onChange={(e) => setFilter(e.target.value)}><option value="upcoming">Upcoming</option><option value="all">All appointments</option></select></div>
      {loading ? <p className="mv-empty">Loading appointments…</p> : !visible.length ? <p className="mv-empty">No appointments found.</p> : visible.map((a) => <article className="mv-care-appointment" key={a.id} aria-label={`Appointment: ${a.reason}`}>
        <div className="mv-row mv-role-row"><div className="mv-role-row-main"><strong className="mv-row-title">{role === 'patient' ? a.providerName : a.patientName}</strong><span className="mv-row-meta">{new Date(a.startsAt).toLocaleString()} · {a.durationMinutes} minutes</span><span className="mv-row-meta">{a.reason}{a.location ? ` · ${a.location}` : ''}</span></div><span className={`mv-status-pill ${a.status === 'confirmed' ? 'is-approved' : a.status === 'requested' ? 'is-pending' : 'is-rejected'}`}>{a.status}</span></div>
        {['requested', 'confirmed'].includes(a.status) && <div className="mv-care-appointment-actions">
          {role !== 'patient' && a.status === 'requested' && <button className="mv-btn mv-btn-accent mv-btn-sm" disabled={busy} onClick={() => changeStatus(a, 'confirm')}>Confirm</button>}
          <button className="mv-btn mv-btn-ghost mv-btn-sm" disabled={busy} onClick={() => { setEditing(a); setForm({ participantEmail: role === 'patient' ? a.providerEmail : a.patientEmail, startsAt: localDateTime(new Date(a.startsAt)), durationMinutes: a.durationMinutes, reason: a.reason, location: a.location }); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Reschedule</button>
          <button className="mv-btn mv-btn-ghost mv-btn-sm" disabled={busy} onClick={() => changeStatus(a, 'cancel')}>Cancel appointment</button>
          {role !== 'patient' && a.status === 'confirmed' && new Date(a.startsAt) <= new Date() && <button className="mv-btn mv-btn-ghost mv-btn-sm" disabled={busy} onClick={() => changeStatus(a, 'complete')}>Mark completed</button>}
        </div>}
      </article>)}
    </div>
  </div>;
}
export function AppointmentPreview({ role, onOpen }: { role: 'patient' | 'doctor' | 'hospital'; onOpen: () => void }) {
  const [items, setItems] = useState<Appointment[] | null>(null), [error, setError] = useState('');
  useEffect(() => { careRequest<{ appointments: Appointment[] }>('/appointments').then((r) => setItems(r.appointments.filter((a) => ['requested', 'confirmed'].includes(a.status) && new Date(a.startsAt).getTime() > Date.now()).sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt)).slice(0, 3))).catch((e) => setError(e.message)); }, []);
  return <section className="mv-card"><div className="mv-card-head"><h2 className="mv-card-title">Upcoming Appointments</h2><button className="mv-card-link" onClick={onOpen}>Manage appointments</button></div>
    {error ? <p className="mv-care-error" role="alert">{error}</p> : items === null ? <p className="mv-empty">Loading appointments…</p> : !items.length ? <p className="mv-empty">No upcoming appointments.</p> : items.map((a) => <button key={a.id} className="mv-row is-clickable" onClick={onOpen}><div className="mv-role-row-main"><strong className="mv-row-title">{role === 'patient' ? a.providerName : a.patientName}</strong><span className="mv-row-meta">{new Date(a.startsAt).toLocaleString()} · {a.status}</span></div></button>)}
  </section>;
}
