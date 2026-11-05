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

        if (storedToken && storedUser) {
          setToken(storedToken);
          setUser(storedUser);

          // Optionally verify token is still valid by hitting /me
          try {
            const response = await api.getMe();
            setUser(response.data);
            await storage.saveUser(response.data);
          } catch (err) {
            // Token expired — clear session
            await storage.clearSession();
            setToken(null);
            setUser(null);
          }
        }
      } catch (err) {
        console.error('Error loading session:', err);
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
      const { token: newToken, user: newUser } = response.data;

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
      const { token: newToken, user: newUser } = response.data;

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
        'Invalid email or password.';
      setError(message);
      return { success: false, error: message };
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
    }
    await storage.clearSession();
    setToken(null);
    setUser(null);
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
      const next = { ...prev, ...updatedFields };
      storage.saveUser(next);
      return next;
    });
  };

  const value = {
    user,
    token,
    loading,
    error,
    isAuthenticated: !!token,
    register,
    login,
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
