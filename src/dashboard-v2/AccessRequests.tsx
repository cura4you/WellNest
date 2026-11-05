import { useState } from 'react';
import { getDocumentsByIds } from '../services/accessApi';
import { ShieldCheckIcon } from './icons';
import { readableLabel } from './overviewUi';
import type { AccessRequestRow } from './types';

interface AccessRequestsProps { requests: AccessRequestRow[]; busy: boolean; onApprove: (id: string) => void; onReject: (id: string) => void }
export function AccessRequests({ requests, busy, onApprove, onReject }: AccessRequestsProps) {
  const [filter, setFilter] = useState('all'), [expanded, setExpanded] = useState<string | null>(null);
  const [documents, setDocuments] = useState<Record<string, any[]>>({});
  const [loading, setLoading] = useState<Record<string, boolean>>({}), [errors, setErrors] = useState<Record<string, string>>({});
  const loadDocuments = async (request: AccessRequestRow) => {
    setLoading(prev => ({ ...prev, [request.id]: true })); setErrors(prev => ({ ...prev, [request.id]: '' }));
    try { const result = await getDocumentsByIds(request.documentIds || []); setDocuments(prev => ({ ...prev, [request.id]: result.documents || [] })); }
    catch { setErrors(prev => ({ ...prev, [request.id]: 'We couldn’t load the document details. Please try again.' })); }
    finally { setLoading(prev => ({ ...prev, [request.id]: false })); }
  };
  const toggle = (request: AccessRequestRow) => {
    if (expanded === request.id) { setExpanded(null); return; }
    setExpanded(request.id);
    if (request.documentIds?.length && !documents[request.id] && !loading[request.id]) void loadDocuments(request);
  };
  const visible = requests.filter(r => filter === 'all' || r.status === filter).sort((a, b) => Number(b.status === 'pending') - Number(a.status === 'pending'));
  return <div className="mv-access-stack">
    <div className="mv-access-intro"><ShieldCheckIcon size={23} /><p>Review the requester, their reason, and the documents before deciding. An approved request is a record of your decision.</p></div>
    <div className="mv-filter-buttons" role="group" aria-label="Filter access requests">{[['all', 'All requests'], ['pending', 'Pending'], ['approved', 'Approved'], ['rejected', 'Rejected']].map(([value, label]) => <button type="button" key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}{' '}<span>{value === 'all' ? requests.length : requests.filter(r => r.status === value).length}</span></button>)}</div>
    {!visible.length ? <section className="mv-card mv-useful-empty"><span className="mv-empty-symbol"><ShieldCheckIcon size={25} /></span><h3>{requests.length ? 'No requests in this category' : 'No access requests yet'}</h3><p>{requests.length ? 'Choose another category to see your request history.' : 'When a doctor or hospital asks to view your records, you can review the request here.'}</p></section> : visible.map(req => <article className="mv-card mv-access-card" key={req.id} aria-label={`Access request from ${req.requester}`}>
      <div className="mv-access-card-heading"><span className="mv-action-symbol"><ShieldCheckIcon size={20} /></span><div><h2>{req.requester}</h2><p>{readableLabel(req.role)} · {readableLabel(req.scope)}</p></div><span className={`mv-status-pill is-${req.status}`}>{req.status}</span></div>
      <div className="mv-access-reason"><span className="mv-form-label">Reason for access</span><p>{req.reason || 'No reason provided.'}</p></div>
      {req.scope === 'specific_documents' && <div className="mv-access-documents"><button type="button" className="mv-card-link" aria-expanded={expanded === req.id} aria-controls={`request-documents-${req.id}`} onClick={() => toggle(req)}>{expanded === req.id ? 'Hide' : 'View'} {req.documentIds?.length || 0} requested document{req.documentIds?.length === 1 ? '' : 's'}</button>
        <div id={`request-documents-${req.id}`} hidden={expanded !== req.id}>
          {loading[req.id] ? <p className="mv-care-note" role="status">Loading requested documents…</p> : errors[req.id] ? <div className="mv-care-error" role="alert"><p>{errors[req.id]}</p><button className="mv-card-link" type="button" onClick={() => void loadDocuments(req)}>Try again</button></div> : documents[req.id]?.length ? <ul>{documents[req.id].map(doc => <li key={doc.id}><strong>{doc.documentName || doc.originalFilename}</strong><span>{readableLabel(doc.documentType || 'Document')} · {doc.visitDate || doc.uploadedAt?.split('T')[0] || 'Date unavailable'}</span></li>)}</ul> : <p className="mv-care-note">No document details are available.</p>}
        </div>
      </div>}
      {req.status === 'pending' && <div className="mv-access-decision"><p>Only approve access if you recognize this requester.</p><div className="mv-role-actions"><button type="button" className="mv-btn mv-btn-ghost" disabled={busy} onClick={() => onReject(req.id)}>Reject</button><button type="button" className="mv-btn mv-btn-accent" disabled={busy} onClick={() => onApprove(req.id)}>Approve</button></div></div>}
    </article>)}
  </div>;
}
