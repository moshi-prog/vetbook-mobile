import React, { createContext, useState, useEffect, useContext } from 'react';
import * as api from '../services/api';
import * as storage from '../services/storage';

const AuthContext = createContext({});

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Check for existing session on app start
  useEffect(() => {
    const loadStoredSession = async () => {
      try {
        const storedToken = await storage.getToken();
        const storedUser = await storage.getUser();

        // Defensively unpack if storedUser was saved in legacy { user: { ... } } wrapper
        const cachedUser = storedUser ? (storedUser.user || storedUser) : null;
        const cachedValid = !!(cachedUser && cachedUser.name);

        const clearSessionState = async () => {
          await storage.clearSession();
          setToken(null);
          setUser(null);
        };

        if (!storedToken) {
          // No token: ensure no orphan user data lingers
          if (storedUser) await storage.clearSession();
          setToken(null);
          setUser(null);
        } else {
          // Token exists — verify and/or recover the user profile via /me
          try {
            const response = await api.getMe();
            const userData = response.data?.user ?? response.data;
            if (userData && userData.name) {
              setToken(storedToken);
              setUser(userData);
              await storage.saveUser(userData);
            } else {
              console.warn('Invalid profile from /me, clearing stored session.');
              await clearSessionState();
            }
          } catch (err) {
            if (err?.response?.status === 401 || !cachedValid) {
              // Expired token, or no usable cached user to fall back on
              console.warn('Session invalid, clearing stored session.');
              await clearSessionState();
            } else {
              // Network error/offline with a valid cached user — keep session
              console.warn('Could not refresh session from /me endpoint, keeping stored user:', err?.message);
              setToken(storedToken);
              setUser(cachedUser);
            }
          }
        }
      } catch (err) {
        console.error('Error loading session:', err);
        try {
          await storage.clearSession();
        } catch (_) {}
        setToken(null);
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    loadStoredSession();
  }, []);

  // Register new user
  const register = async (data) => {
    setError(null);
    try {
      const response = await api.register(data);

      if (response.data?.needs_verification) {
        return {
          success: true,
          needsVerification: true,
          email: response.data?.email || data.email,
          message: response.data?.message,
        };
      }

      const newToken = response.data?.token;
      const newUser = response.data?.user ?? response.data;

      if (newToken && newUser) {
        await storage.saveToken(newToken);
        await storage.saveUser(newUser);
        setToken(newToken);
        setUser(newUser);
        return { success: true };
      }
      return { success: false, error: 'Invalid response from server' };
    } catch (err) {
      const message =
        err.response?.data?.message ||
        err.response?.data?.error ||
        'Registration failed. Please try again.';
      setError(message);
      return { success: false, error: message };
    }
  };

  // Login
  const login = async (email, password) => {
    setError(null);
    try {
      const response = await api.login({ email, password });
      const newToken = response.data?.token;
      const newUser = response.data?.user ?? response.data;

      if (newToken && newUser) {
        await storage.saveToken(newToken);
        await storage.saveUser(newUser);
        setToken(newToken);
        setUser(newUser);
        return { success: true };
      }
      return { success: false, error: 'Invalid response from server' };
    } catch (err) {
      if (err.response?.status === 403 && err.response?.data?.needs_verification) {
        return {
          success: false,
          needsVerification: true,
          email: err.response?.data?.email || email,
          message: err.response?.data?.message,
        };
      }
      const message =
        err.response?.data?.message ||
        err.response?.data?.error ||
        'Invalid email or password.';
      setError(message);
      return { success: false, error: message };
    }
  };

  // Verify email with 6-digit code
  const verifyEmail = async (email, code) => {
    setError(null);
    try {
      const response = await api.verifyEmail(email, code);
      const newToken = response.data?.token;
      const newUser = response.data?.user ?? response.data;

      if (newToken && newUser) {
        await storage.saveToken(newToken);
        await storage.saveUser(newUser);
        setToken(newToken);
        setUser(newUser);
        return { success: true, message: response.data?.message };
      }
      return { success: false, error: 'Invalid response from server' };
    } catch (err) {
      const message =
        err.response?.data?.message ||
        err.response?.data?.error ||
        'Verification failed. Please check the code and try again.';
      setError(message);
      return { success: false, error: message };
    }
  };

  // Resend 6-digit verification code
  const resendVerificationCode = async (email) => {
    try {
      const response = await api.resendVerificationCode(email);
      return { success: true, message: response.data?.message };
    } catch (err) {
      const message =
        err.response?.data?.message ||
        err.response?.data?.error ||
        'Could not resend verification code. Please try again later.';
      return {
        success: false,
        error: message,
        retryAfter: err.response?.data?.retry_after,
      };
    }
  };

  // Logout
  const logout = async () => {
    try {
      // Try to invalidate token on server
      await api.logout();
    } catch (err) {
      // Even if server call fails, still clear local session
      console.error('Logout API error:', err);
    } finally {
      // Guaranteed local cleanup regardless of network outcome
      try {
        await storage.clearSession();
      } catch (e) {
        console.error('Clear session error:', e);
      }
      setToken(null);
      setUser(null);
    }
  };

  // Refresh current user data (useful after profile updates)
  const refreshUser = async () => {
    try {
      const response = await api.getMe();
      const userData = response.data?.user ?? response.data;
      setUser(userData);
      await storage.saveUser(userData);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  };

  const updateUserState = async (updatedFields) => {
    setUser((prev) => {
      const fieldsToMerge = updatedFields?.user ? updatedFields.user : updatedFields;
      const next = { ...prev, ...fieldsToMerge };
      storage.saveUser(next);
      return next;
    });
  };

  const value = {
    user,
    token,
    loading,
    error,
    isAuthenticated: !!(token && user),
    register,
    login,
    verifyEmail,
    resendVerificationCode,
    logout,
    refreshUser,
    updateUserState,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

// Custom hook for using auth context
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export default AuthContext;
