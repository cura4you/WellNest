export interface Vital {
  id: string; measuredAt: string; heartRate: string | null; systolic: string | null;
  diastolic: string | null; glucose: string | null; notes: string;
}
export interface Appointment {
  id: string; patientName: string; patientEmail: string; providerName: string; providerEmail: string;
  startsAt: string; durationMinutes: number; reason: string; location: string;
  status: 'requested' | 'confirmed' | 'cancelled' | 'completed'; version: number;
}
export interface InboxNotification { id: string; title: string; body: string; status: string; createdAt: string }
export async function careRequest<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const token = JSON.parse(localStorage.getItem('medivault.auth') || '{}').token;
  const response = await fetch(`${import.meta.env.VITE_API_BASE_URL?.trim() || ''}/api${path}`, {
    method, headers: { Authorization: `Bearer ${token || ''}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.message || 'Unable to complete this request.');
  return result;
}
export const localDateTime = (date = new Date()) => new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
