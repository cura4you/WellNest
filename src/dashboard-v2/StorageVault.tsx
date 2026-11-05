import { RecordBrowser } from './RecordBrowser';
import type { DocumentRow } from './types';

interface StorageVaultProps { documents: DocumentRow[]; onView: (id: string) => void; onSummary: (id: string) => void }
export function StorageVault({ documents, onView, onSummary }: StorageVaultProps) {
  return <RecordBrowser documents={documents.map(doc => ({ ...doc, person: doc.uploadedBy }))} onView={onView} onSummary={onSummary} />;
}
