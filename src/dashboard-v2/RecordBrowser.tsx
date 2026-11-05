import { useMemo, useState } from 'react';
import { FileIcon, SearchIcon } from './icons';
import { readableLabel } from './overviewUi';

export interface BrowserRecord { id: string; name: string; type: string; date: string; status: string; person: string; personEmail?: string }
const types = ['lab_report', 'prescription', 'imaging', 'diagnosis', 'discharge_summary', 'other'];
export function RecordBrowser({ documents, doctor = false, onView, onSummary, onRequestAccess }: {
  documents: BrowserRecord[]; doctor?: boolean; onView: (id: string) => void; onSummary: (id: string) => void; onRequestAccess?: () => void;
}) {
  const [query, setQuery] = useState(''), [type, setType] = useState(''), [date, setDate] = useState('');
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return documents.filter(doc => (!type || type === doc.type) && (!date || date === doc.date) && (!q || [doc.name, doc.person, doc.personEmail, readableLabel(doc.type)].some(v => v?.toLowerCase().includes(q))))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [documents, query, type, date]);
  const hasFilters = Boolean(query || type || date);
  const clear = () => { setQuery(''); setType(''); setDate(''); };
  return <div className="mv-record-browser">
    <section className="mv-card mv-record-tools" aria-label="Find a document">
      <label className="mv-record-search"><SearchIcon size={17} /><span className="mv-visually-hidden">Search documents</span><input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder={doctor ? 'Search by record, patient name, or email' : 'Search by record name or care team'} /></label>
      <div className="mv-record-filters"><div className="mv-field-inline"><label className="mv-field-label" htmlFor="docTypeFilter">Filter by Type</label><select id="docTypeFilter" className="mv-select" value={type} onChange={e => setType(e.target.value)}><option value="">All Types</option>{types.map(t => <option value={t} key={t}>{readableLabel(t)}</option>)}</select></div>
        <div className="mv-field-inline"><label className="mv-field-label" htmlFor="dateFilter">Filter by Date</label><input id="dateFilter" type="date" className="mv-date-input" value={date} onChange={e => setDate(e.target.value)} /></div>
        {hasFilters && <button type="button" className="mv-btn mv-btn-ghost mv-btn-sm" onClick={clear}>Clear filters</button>}
        <span className="mv-record-count" role="status">{filtered.length} of {documents.length} record{documents.length === 1 ? '' : 's'}</span>
      </div>
    </section>
    <section className="mv-card" aria-label={doctor ? 'Shared documents' : 'Your documents'}>
      <div className="mv-card-head"><div><h2 className="mv-card-title">{doctor ? 'Shared patient records' : 'Your medical records'}</h2><p className="mv-section-caption">{doctor ? 'Open authorized documents or generate an AI summary.' : 'Open a record to view or download it. Use AI Summary for an explanation.'}</p></div><span className="mv-row-meta">Newest first</span></div>
      {!filtered.length ? <div className="mv-useful-empty"><span className="mv-empty-symbol"><FileIcon size={25} /></span><h3>{hasFilters ? 'No matching records' : doctor ? 'No shared documents yet' : 'No documents uploaded yet.'}</h3><p>{hasFilters ? 'Try a different name, date, or document type.' : doctor ? 'Ask a patient to share the records needed for their care.' : 'Your doctor or hospital can add records to your vault. They will appear here after upload.'}</p>{hasFilters ? <button type="button" className="mv-btn mv-btn-ghost" onClick={clear}>Reset search</button> : onRequestAccess && <button type="button" className="mv-btn mv-btn-accent" onClick={onRequestAccess}>Request access</button>}</div> : filtered.map(doc => <article className="mv-record-item" key={doc.id} aria-label={doc.name}>
        <span className="mv-record-file"><FileIcon size={21} /></span><div className="mv-record-main"><h3 className="mv-row-title">{doc.name}</h3><span className="mv-row-meta">{doctor ? 'Patient: ' : 'From: '}{doc.person}{doctor && doc.personEmail ? ` · ${doc.personEmail}` : ''}</span><span className="mv-row-meta">{readableLabel(doc.type)} · Added {doc.date}</span></div>
        <span className={`mv-status-pill ${doc.status === 'encrypted' ? 'is-approved' : ''}`}>{doc.status === 'encrypted' ? 'Encrypted' : 'Stored'}</span>
        <div className="mv-record-actions"><button className="mv-btn mv-btn-ghost mv-btn-sm" type="button" onClick={() => onView(doc.id)}>View</button><button className="mv-btn mv-btn-ghost mv-btn-sm" type="button" onClick={() => onSummary(doc.id)}>AI Summary</button></div>
      </article>)}
    </section>
  </div>;
}
