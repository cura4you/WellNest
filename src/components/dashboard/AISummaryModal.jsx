import { useState, useEffect, useRef } from 'react';
import { summarizeDocument } from '../../services/vaultApi';

function parseSection(text) {
  const sections = text.split(/\n(?=🏥|📋|⚠️|💊|🧠|🩺|❓|🔴)/gu);
  return sections.map((section, idx) => {
    if (section.startsWith('🏥')) {
      return (
        <div key={idx} className="aisummary-section aisummary-doc-id">
          <span className="aisummary-section-icon">🏥</span>
          <strong>{section.replace('🏥 DOCUMENT IDENTIFIED:', '').trim()}</strong>
        </div>
      );
    }
    if (section.startsWith('📋')) {
      const lines = section.split('\n').slice(1).filter(l => l.trim());
      return (
        <div key={idx} className="aisummary-section">
          <div className="aisummary-section-label"><span>📋</span> Key Findings</div>
          <ul className="aisummary-list">
            {lines.map((l, i) => <li key={i}>{l.replace(/^[*-]\s*/, '')}</li>)}
          </ul>
        </div>
      );
    }
    if (section.startsWith('⚠️')) {
      const alerts = section.split('\n').filter(l => l.trim());
      return (
        <div key={idx} className="aisummary-section aisummary-alerts">
          {alerts.map((a, i) => (
            <div key={i} className="aisummary-alert-row">
              ⚠️ {a.replace(/^⚠️\s*(ALERTS:)?\s*/, '').trim()}
            </div>
          ))}
        </div>
      );
    }
    if (section.startsWith('💊')) {
      return (
        <div key={idx} className="aisummary-section">
          <div className="aisummary-section-label"><span>💊</span> Medications</div>
          <p className="aisummary-text">{section.replace('💊 MEDICATIONS:', '').trim()}</p>
        </div>
      );
    }
    if (section.startsWith('🧠')) {
      return (
        <div key={idx} className="aisummary-section aisummary-plain">
          <div className="aisummary-section-label"><span>🧠</span> Plain Language Summary</div>
          <p className="aisummary-text-highlight">{section.replace('🧠 SIMPLE SUMMARY:', '').trim()}</p>
        </div>
      );
    }
    if (section.startsWith('🩺')) {
      return (
        <div key={idx} className="aisummary-section">
          <div className="aisummary-section-label"><span>🩺</span> Clinical Summary</div>
          <p className="aisummary-text">{section.replace('🩺 CLINICAL SUMMARY:', '').trim()}</p>
        </div>
      );
    }
    if (section.startsWith('❓')) {
      const qs = section.split('\n').slice(1).filter(l => l.trim());
      return (
        <div key={idx} className="aisummary-section">
          <div className="aisummary-section-label"><span>❓</span> Questions for your doctor</div>
          <ol className="aisummary-qlist">
            {qs.map((q, i) => <li key={i}>{q.replace(/^\d+\.\s*/, '')}</li>)}
          </ol>
        </div>
      );
    }
    if (section.startsWith('🔴')) {
      const level = section.replace('🔴 URGENCY LEVEL:', '').replace('🔴 URGENCY:', '').replace('🔴', '').trim().toLowerCase();
      const cls = level.includes('routine') ? 'is-routine' : level.includes('monitor') ? 'is-monitor' : 'is-urgent';
      return (
        <div key={idx} className={`aisummary-urgency ${cls}`}>
          Urgency: {level}
        </div>
      );
    }
    if (section.trim()) {
      return <p key={idx} className="aisummary-text">{section}</p>;
    }
    return null;
  });
}

export default function AISummaryModal({ documentId, filename, onClose }) {
  const [status, setStatus] = useState('loading'); // loading | done | error
  const [summary, setSummary] = useState('');
  const [parseWarning, setParseWarning] = useState(false);
  const [error, setError] = useState('');
  const contentRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    async function analyze() {
      try {
        const data = await summarizeDocument(documentId);
        if (cancelled) return;
        setSummary(data.summary);
        setParseWarning(Boolean(data.parseWarning));
        setStatus('done');
      } catch (err) {
        if (cancelled) return;
        setError(err.message || 'AI analysis failed.');
        setStatus('error');
      }
    }

    analyze();
    return () => { cancelled = true; };
  }, [documentId]);

  useEffect(() => {
    if (contentRef.current) contentRef.current.scrollTop = 0;
  }, [status]);

  return (
    <div className="aisummary-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="aisummary-shell">
        {/* Header */}
        <div className="aisummary-header">
          <div className="aisummary-header-left">
            <span className="aisummary-logo">🧠</span>
            <div>
              <h3 className="aisummary-title">MediVault AI Summary</h3>
              <p className="aisummary-filename">{filename}</p>
            </div>
          </div>
          <div className="aisummary-header-right">
            <button className="aisummary-close" onClick={onClose} aria-label="Close">✕</button>
          </div>
        </div>

        {/* Body */}
        <div className="aisummary-body" ref={contentRef}>
          {status === 'loading' && (
            <div className="aisummary-loading">
              <div className="aisummary-spinner" />
              <p className="aisummary-loading-title">Analyzing your document...</p>
              <p className="aisummary-loading-sub">MediVault AI is reading and summarizing</p>
              <div className="aisummary-loading-dots">
                <span /><span /><span />
              </div>
            </div>
          )}

          {status === 'error' && (
            <div className="aisummary-error">
              <span className="aisummary-error-icon">⚠️</span>
              <p>{error}</p>
              <button className="btn btn-outline" onClick={onClose}>Close</button>
            </div>
          )}

          {status === 'done' && (
            <div className="aisummary-result">
              {parseWarning && (
                <div className="aisummary-parse-warning">
                  <span>⚠️</span>
                  <span>This response didn't come back in the expected format — showing the AI's raw output below instead of the usual structured layout.</span>
                </div>
              )}
              {parseSection(summary)}
            </div>
          )}
        </div>

        {/* Footer */}
        {status === 'done' && (
          <div className="aisummary-footer">
            <span className="aisummary-disclaimer">🔒 AI analysis is for reference only. Consult your doctor for medical decisions.</span>
            <button className="btn btn-primary" onClick={onClose}>Close</button>
          </div>
        )}
      </div>
    </div>
  );
}
