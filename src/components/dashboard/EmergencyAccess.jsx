import { useState } from 'react';

const API = import.meta.env.VITE_API_BASE_URL?.trim() || '';

export default function EmergencyAccess({ onViewDocument }) {
  const [patientEmail, setPatientEmail] = useState('');
  const [patient, setPatient] = useState(null);
  const [endsAt, setEndsAt] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const initiateEmergency = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const token = JSON.parse(localStorage.getItem('medivault.auth') || '{}').token || '';
      const response = await fetch(`${API}/api/emergency-access/initiate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ patientEmail: patientEmail.trim() }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Emergency access failed.');
      setPatient(body.patient);
      setEndsAt(body.endsAt);
    } catch (err) {
      setError(err.message || 'Emergency access failed.');
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setPatient(null);
    setPatientEmail('');
    setEndsAt('');
    setError('');
  };

  return (
    <div className="mv-emergency-flow">
      {!patient ? (
        <div className="mv-card mv-card-pad mv-emergency-intro">
          <span className="mv-emergency-label">Emergency access</span>
          <h2>Open a patient’s emergency record</h2>
          <p>Access lasts 24 hours, requires the patient’s emergency consent, and is recorded in the audit log.</p>
          <form onSubmit={initiateEmergency} className="mv-form-field">
            <label className="mv-form-label" htmlFor="emergencyPatientEmail">Patient Email</label>
            <input id="emergencyPatientEmail" type="email" className="mv-form-input" value={patientEmail}
              onChange={(event) => setPatientEmail(event.target.value)} placeholder="patient@example.com" required />
            <button type="submit" className="mv-btn mv-btn-emergency" disabled={busy || !patientEmail.trim()}>
              {busy ? 'Requesting access…' : 'Start emergency access'}
            </button>
          </form>
          {error && <p className="mv-emergency-error" role="alert">{error}</p>}
        </div>
      ) : (
        <>
          <div className="mv-card mv-card-pad mv-emergency-summary">
            <div className="mv-emergency-summary-head">
              <div>
                <span className="mv-emergency-label">Access active</span>
                <h2>{patient.name}</h2>
                <p>{[patient.age != null ? `${patient.age} years old` : null, patient.gender,
                  patient.bloodGroup ? `Blood group ${patient.bloodGroup}` : null].filter(Boolean).join(' · ') || 'Patient record'}</p>
              </div>
              <button type="button" className="mv-btn mv-btn-ghost" onClick={reset}>New patient</button>
            </div>
            <div className="mv-emergency-expiry">Read only · Expires {new Date(endsAt).toLocaleString()} · Access audited</div>
          </div>
          <div className="mv-emergency-grid">
            <div className="mv-card mv-card-pad">
              <h3>Clinical details</h3>
              <div className="mv-emergency-detail"><strong>Blood group</strong><span>{patient.bloodGroup || 'Not recorded'}</span></div>
              <div className="mv-emergency-detail"><strong>Allergies</strong><span>{patient.allergies?.join(', ') || 'Not recorded'}</span></div>
              <div className="mv-emergency-detail"><strong>Conditions</strong><span>{patient.conditions?.join(', ') || 'Not recorded'}</span></div>
              <div className="mv-emergency-detail"><strong>Medications</strong><span>{patient.medications?.map((med) => typeof med === 'string' ? med : med.name).join(', ') || 'Not recorded'}</span></div>
              <div className="mv-emergency-detail"><strong>Emergency contact</strong><span>{patient.emergencyContact ? `${patient.emergencyContact.name} · ${patient.emergencyContact.phone}` : 'Not recorded'}</span></div>
            </div>
            <div className="mv-card mv-card-pad">
              <h3>Recorded drug interactions</h3>
              {patient.drugInteractions?.length ? patient.drugInteractions.map((interaction) => (
                <div className="mv-emergency-interaction" key={interaction.id}>
                  <div className="mv-emergency-interaction-head">
                    <strong>{interaction.drugA} + {interaction.drugB}</strong>
                    <span className="mv-emergency-severity">{interaction.severity}</span>
                  </div>
                  <p>{interaction.description}</p>
                  {interaction.recommendation && <p>{interaction.recommendation}</p>}
                </div>
              )) : <p className="mv-row-meta">No interactions recorded.</p>}
            </div>
          </div>
          <div className="mv-card">
            <div className="mv-card-head"><h3 className="mv-card-title">Patient documents</h3><span className="mv-row-meta">{patient.documents?.length || 0} records</span></div>
            <div className="mv-card-body">
              {patient.documents?.length ? patient.documents.map((document) => (
                <div className="mv-row mv-role-row" key={document.id}>
                  <div className="mv-role-row-main">
                    <span className="mv-row-title">{document.title || 'Document'}</span>
                    <span className="mv-row-meta">{document.type?.replace(/_/g, ' ')} · {document.date}</span>
                  </div>
                  <button type="button" className="mv-btn mv-btn-ghost mv-btn-sm" onClick={() => onViewDocument(document.id)}>View</button>
                </div>
              )) : <p className="mv-empty">No documents found for this patient.</p>}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
