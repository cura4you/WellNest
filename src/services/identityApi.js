const base = import.meta.env.VITE_API_BASE_URL?.trim() || '';
export async function identityRequest(path, { method = 'GET', body, publicRequest = false, download = false } = {}) {
  let token = '';
  try { token = JSON.parse(localStorage.getItem('medivault.auth') || '{}').token || ''; } catch { /* Request will return a sign-in error. */ }
  const response = await fetch(`${base}/auth${path}`, {
    method, headers: { ...(!publicRequest && token ? { Authorization: `Bearer ${token}` } : {}), ...(body && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: body instanceof FormData ? body : JSON.stringify(body) } : {}),
  });
  if (!response.ok) { const result = await response.json().catch(() => ({})); const error = new Error(result.message || 'Unable to load account verification.'); error.status = response.status; throw error; }
  return download ? response.blob() : response.json();
}
export const loadAccountStatus = async () => {
  const status = await identityRequest('/account-status');
  if (typeof status.emailVerified !== 'boolean' || typeof status.approvalRequired !== 'boolean' || typeof status.isAdmin !== 'boolean') throw new Error('Account verification returned an incomplete response. Please retry.');
  return status;
};
export async function downloadProof(proofId, filename) {
  const blob = await identityRequest(`/credential-proofs/${proofId}/download`, { download: true });
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = url; link.download = filename || 'credential-proof'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
