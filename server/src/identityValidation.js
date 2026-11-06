export function proofMime(buffer) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) throw Object.assign(new Error('Choose a PDF, JPG or PNG proof document.'), { status: 400 });
  if (buffer.subarray(0, 5).toString() === '%PDF-') return 'application/pdf';
  if (buffer.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return 'image/png';
  if (buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255) return 'image/jpeg';
  throw Object.assign(new Error('Proof must contain a PDF, JPG or PNG file.'), { status: 400 });
}
export function revisionValue(value) {
  if (!/^\d+$/.test(String(value)) || !Number.isSafeInteger(Number(value))) throw Object.assign(new Error('Reload the application before making changes.'), { status: 400 });
  return Number(value);
}
export function reviewDecision(body) {
  if (!['approved', 'rejected'].includes(body.decision)) throw Object.assign(new Error('Choose approve or reject.'), { status: 400 });
  const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
  if (reason.length < 5 || reason.length > 2000) throw Object.assign(new Error('Give a review reason of 5–2000 characters.'), { status: 400 });
  return { decision: body.decision, reason, revision: revisionValue(body.revision) };
}
