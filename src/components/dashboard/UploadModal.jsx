import { useState, useRef } from 'react';
import VerifiedStamp from './VerifiedStamp';

const DOC_TYPES = [
  { value: 'lab_report', label: 'Lab Report' },
  { value: 'prescription', label: 'Prescription' },
  { value: 'imaging', label: 'Imaging' },
  { value: 'diagnosis', label: 'Diagnosis' },
  { value: 'discharge_summary', label: 'Discharge Summary' },
];

export default function UploadModal({ onUpload, onClose, busy }) {
  const [form, setForm] = useState({
    patientId: '',
    documentType: 'lab_report',
    description: '',
    visitDate: '',
    file: null,
    preview: null,
  });
  const [drag, setDrag] = useState(false);
  const [step, setStep] = useState(0); // 0=form, 1=uploading, 2=verifying, 3=stamping
  const [error, setError] = useState('');
  const fileRef = useRef();

  const handleFile = (f) => {
    if (!f) return;
    const reader = new FileReader();
    reader.onload = (e) => setForm((p) => ({ ...p, file: f, preview: e.target.result }));
    reader.readAsDataURL(f);
  };

  const handleSubmit = async () => {
    if (!form.file) { setError('Please select a file.'); return; }
    if (!form.patientId) { setError('Patient email is required.'); return; }
    setError('');
    setStep(1);
    setTimeout(() => setStep(2), 900);
    setTimeout(() => setStep(3), 1900);
    setTimeout(async () => {
      try {
        await onUpload({
          file: form.file,
          patientId: form.patientId,
          documentType: form.documentType,
          description: form.description,
          visitDate: form.visitDate,
        });
        setStep(0);
        onClose();
      } catch (err) {
        setStep(0);
        setError(err.message);
      }
    }, 2800);
  };

  const isPdf = form.file?.name?.toLowerCase().endsWith('.pdf');

  return (
    <div className="upload-modal-overlay" onClick={() => { if (step === 0) onClose(); }}>
      <div className="upload-modal" onClick={(e) => e.stopPropagation()}>
        <div className="upload-modal-header">
          <div>
            <h3>Upload Document</h3>
            <p className="upload-modal-hint">
              <span className="upload-dot" />
              MediVault stamp applied automatically
            </p>
          </div>
          {step === 0 && (
            <button type="button" className="upload-modal-close" onClick={onClose}>✕</button>
          )}
        </div>

        <div className="upload-modal-body">
          {step > 0 ? (
            <div className="upload-progress">
              <div className="upload-steps">
                {[
                  { label: 'Uploading', icon: '📤', active: step >= 1 },
                  { label: 'Verifying', icon: '🔍', active: step >= 2 },
                  { label: 'Stamping', icon: '🛡️', active: step >= 3 },
                ].map((s, i) => (
                  <div key={i} className="upload-step-group">
                    <div className="upload-step-col">
                      <div className={`upload-step-circle${s.active ? ' is-active' : ''}`}>
                        <span style={{ opacity: s.active ? 1 : 0.3 }}>{s.icon}</span>
                      </div>
                      <div className={`upload-step-label${s.active ? ' is-active' : ''}`}>{s.label}</div>
                    </div>
                    {i < 2 && <div className={`upload-step-line${step > i + 1 ? ' is-done' : ''}`} />}
                  </div>
                ))}
              </div>
              {step === 3 && (
                <div className="upload-stamp-reveal">
                  <VerifiedStamp size={130} color="var(--mv-accent-text)" />
                </div>
              )}
              <div className={`upload-step-message${step === 3 ? ' is-done' : ''}`}>
                {step === 1 && 'Uploading your document…'}
                {step === 2 && 'MediVault is verifying…'}
                {step === 3 && '✅ Stamp burned onto your document!'}
              </div>
            </div>
          ) : (
            <>
              {error && <p className="upload-error">{error}</p>}

              {/* File drop zone */}
              <div
                className={`upload-dropzone${drag ? ' is-dragging' : ''}`}
                onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
                onDragLeave={() => setDrag(false)}
                onDrop={(e) => { e.preventDefault(); setDrag(false); handleFile(e.dataTransfer.files[0]); }}
                onClick={() => fileRef.current.click()}
              >
                <input
                  ref={fileRef}
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.webp"
                  style={{ display: 'none' }}
                  onChange={(e) => handleFile(e.target.files[0])}
                />
                {form.file ? (
                  <div className="upload-file-preview">
                    {form.preview && !isPdf ? (
                      <img src={form.preview} alt="" className="upload-thumb" />
                    ) : (
                      <span className="upload-file-icon">📄</span>
                    )}
                    <div className="upload-file-info">
                      <div className="upload-file-name">{form.file.name}</div>
                      <div className="upload-file-size">{(form.file.size / 1024 / 1024).toFixed(2)} MB · Click to change</div>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="upload-drop-icon">☁️</div>
                    <div className="upload-drop-label">Drop your document or click to browse</div>
                    <div className="upload-drop-hint">PDF, JPG, PNG, WEBP supported</div>
                  </>
                )}
              </div>

              {/* Form fields */}
              <div className="dashboard-field" style={{ marginBottom: 12 }}>
                <label htmlFor="uploadPatientEmail">Patient Email *</label>
                <input
                  id="uploadPatientEmail"
                  placeholder="patient@example.com"
                  value={form.patientId}
                  onChange={(e) => setForm((p) => ({ ...p, patientId: e.target.value }))}
                />
              </div>

              <div className="dashboard-form-grid" style={{ marginBottom: 12 }}>
                <div className="dashboard-field">
                  <label htmlFor="uploadDocType">Document Type</label>
                  <select
                    id="uploadDocType"
                    value={form.documentType}
                    onChange={(e) => setForm((p) => ({ ...p, documentType: e.target.value }))}
                  >
                    {DOC_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div className="dashboard-field">
                  <label htmlFor="uploadVisitDate">Visit Date</label>
                  <input
                    id="uploadVisitDate"
                    type="date"
                    value={form.visitDate}
                    onChange={(e) => setForm((p) => ({ ...p, visitDate: e.target.value }))}
                  />
                </div>
              </div>

              <div className="dashboard-field" style={{ marginBottom: 16 }}>
                <label htmlFor="uploadDesc">Description</label>
                <textarea
                  id="uploadDesc"
                  value={form.description}
                  onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                  style={{ minHeight: 60 }}
                />
              </div>

              <div className="upload-stamp-banner">
                <span className="upload-stamp-icon">⚡</span>
                <div>
                  <div className="upload-stamp-title">Auto-verified & stamped</div>
                  <div className="upload-stamp-desc">The MediVault seal is burned directly onto the uploaded file</div>
                </div>
              </div>

              <div className="upload-modal-actions">
                <button
                  type="button"
                  className="btn btn-primary upload-submit-btn"
                  onClick={handleSubmit}
                  disabled={busy || !form.file || !form.patientId}
                >
                  ↑ Upload &amp; Stamp
                </button>
                <button type="button" className="btn btn-outline" onClick={onClose}>Cancel</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
