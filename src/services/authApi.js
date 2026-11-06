const API_BASE_URL = import.meta.env.VITE_API_BASE_URL?.trim() || '';
// Mock auth (localStorage accounts, no backend) only when explicitly enabled.
// An empty API_BASE_URL means relative URLs, which is what Vercel rewrites expect.
const USE_MOCK_AUTH = import.meta.env.VITE_ENABLE_MOCK_AUTH === 'true';
const REGISTERED_USERS_KEY = 'medivault.registered_users';

function normalizeEmail(email) {
  return email.toLowerCase().trim();
}

// Hash a password with SHA-256 so we never store or compare plaintext in localStorage.
// NOTE: This is mock-only. The real backend uses bcrypt server-side.
async function hashPassword(password) {
  const enc = new TextEncoder();
  const buf = await crypto.subtle.digest('SHA-256', enc.encode('medivault-mock::' + password));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function loadRegisteredUsers() {
  try {
    return JSON.parse(localStorage.getItem(REGISTERED_USERS_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveRegisteredUsers(users) {
  localStorage.setItem(REGISTERED_USERS_KEY, JSON.stringify(users));
}

function parseRegisterPayload(data) {
  if (data instanceof FormData) {
    const profile = {};
    for (const [key, value] of data.entries()) {
      if (key === 'password' || key === 'email' || key === 'officialEmail' || key === 'confirmPassword') {
        continue;
      }
      profile[key] = typeof value === 'string' ? value : value?.name || '';
    }

    return {
      email: data.get('email') || data.get('officialEmail') || '',
      password: data.get('password') || '',
      profile,
    };
  }

  const profile = { ...data };
  delete profile.password;
  delete profile.confirmPassword;

  return {
    email: data.email || data.officialEmail || '',
    password: data.password || '',
    profile,
  };
}

function normalizeError(error) {
  if (error?.message) {
    return error.message;
  }
  return 'Unable to process your request right now.';
}

async function request(path, options) {
  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers: {
        ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
        ...(options.headers || {}),
      },
    });
  } catch {
    throw new Error('Failed to fetch API. Start backend with `npm run dev:api` or `npm run dev:all`.');
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.message || 'Request failed.');
    error.status = response.status;
    throw error;
  }
  return payload;
}

export function validateStoredAuthSession(session) {
  if (!session?.user?.email || !session?.user?.role || !session?.token) {
    return false;
  }

  if (!USE_MOCK_AUTH) {
    return true;
  }

  const users = loadRegisteredUsers();
  return users.some(
    (entry) =>
      normalizeEmail(entry.email) === normalizeEmail(session.user.email)
      && entry.role === session.user.role
  );
}

export async function loginUser({ role, email, password }) {
  try {
    if (USE_MOCK_AUTH) {
      if (!email || !password || !role) {
        throw new Error('Email, password, and role are required.');
      }

      const normalizedEmail = normalizeEmail(email);
      const users = loadRegisteredUsers();
      const hashedInput = await hashPassword(password);
      const existingUser = users.find(
        (entry) =>
          normalizeEmail(entry.email) === normalizedEmail
          && entry.role === role
          && entry.passwordHash === hashedInput
      );

      if (!existingUser) {
        throw new Error('No account found. Please register first with this role and email.');
      }

      return new Promise((resolve) => {
        setTimeout(() => {
          resolve({
            token: `mock-token-${role}-${Date.now()}`,
            user: {
              id: existingUser.id,
              role: existingUser.role,
              email: existingUser.email,
              profile: existingUser.profile,
            },
          });
        }, 450);
      });
    }
   return request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ role, email, password }),
    });
  } catch (error) {
    throw new Error(normalizeError(error));
  }
}

export async function registerUser({ role, data }) {
  try {
    if (USE_MOCK_AUTH) {
      const parsed = parseRegisterPayload(data);
      const email = parsed.email;
      const password = parsed.password;

      if (!email || !password) {
        throw new Error('Email and password are required.');
      }

      const normalizedEmail = normalizeEmail(email);
      const users = loadRegisteredUsers();
      if (users.some((entry) => normalizeEmail(entry.email) === normalizedEmail)) {
        throw new Error('Email already exists. Please login or use a different email.');
      }

      const newUser = {
        id: `${role}-${Date.now()}`,
        role,
        email,
        passwordHash: await hashPassword(password), // never store plaintext
        profile: parsed.profile,
      };
      users.push(newUser);
      saveRegisteredUsers(users);

      return new Promise((resolve) => {
        setTimeout(() => {
          resolve({
            message: 'Registration successful.',
            token: `mock-token-${role}-${Date.now()}`,
            user: {
              id: newUser.id,
              role: newUser.role,
              email: newUser.email,
              profile: newUser.profile,
            },
          });
        }, 550);
      });
    }

    const isHospital = role === 'hospital';
    const body = isHospital ? data : JSON.stringify(data);
    return request(`/auth/register/${role}`, {
      method: 'POST',
      body,
    });
  } catch (error) {
    throw new Error(normalizeError(error));
  }
}

export function requestPasswordReset(role, email) {
  return request('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ role, email }) });
}
export function resetPassword(token, password) {
  return request('/auth/reset-password', { method: 'POST', body: JSON.stringify({ token, password }) });
}
export function secureAccountAction(action, token, body = {}) {
  if (USE_MOCK_AUTH) {
    if (action === 'logout') return Promise.resolve({ message: 'Signed out.' });
    return Promise.reject(new Error('Account security requires the real backend.'));
  }
  return request(`/auth/${action}`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(body), signal: AbortSignal.timeout(15000) });
}

export function demoAction(action, body = {}, token = '') {
  return request(`/demo/${action}`, { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {}, body: JSON.stringify(body), signal: AbortSignal.timeout(30000) });
}
