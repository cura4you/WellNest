import { createContext } from 'react';

export const AuthContext = createContext({
  user: null,
  token: '',
  role: '',
  isAuthenticated: false,
  loading: false,
  error: '',
  login: async () => {},
  register: async () => {},
  logout: async () => {},
  clearLocalSession: () => {},
  updateSessionProfile: () => {},
  clearError: () => {},
});
