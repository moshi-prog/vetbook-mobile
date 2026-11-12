import axios from 'axios';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { getToken, clearSession } from './storage';

// URL resolution for web vs mobile (Expo Go tunnel / device)
const getApiUrl = () => {
  // 1. Explicit override via environment variable
  if (process.env.EXPO_PUBLIC_API_URL) return process.env.EXPO_PUBLIC_API_URL;

  // 2. Web browser
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
      return 'http://127.0.0.1:8000/api';
    }
    return 'https://vetbook-backend.onrender.com/api';
  }

  // 3. Physical mobile devices (Expo Go / release builds): default to live Render backend
  return 'https://vetbook-backend.onrender.com/api';
};

const API_URL = getApiUrl();

const api = axios.create({
  baseURL: API_URL,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'ngrok-skip-browser-warning': 'true',
  },
});

// Attach JWT token to every request automatically
api.interceptors.request.use(
  async (config) => {
    const token = await getToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Handle 401 responses (token expired)
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      await clearSession();
      // The AuthContext will detect the cleared session and redirect to login
    }
    return Promise.reject(error);
  }
);

// ============= AUTH ENDPOINTS =============

export const register = (data) => api.post('/register', data);
export const login = (data) => api.post('/login', data);
export const verifyEmail = (email, code) => api.post('/verify-email', { email, code });
export const resendVerificationCode = (email) => api.post('/resend-verification-code', { email });
export const logout = () => api.post('/logout');
export const getMe = () => api.get('/me');
export const updateProfile = (data) => api.put('/user/profile', data);
export const changePassword = (data) => api.put('/user/password', data);
export const resetPassword = (data) => api.post('/reset-password', data);

// ============= PET ENDPOINTS (for later) =============

export const getUserPets = () => api.get('/user/pets');
export const getPet = (id) => api.get(`/pets/${id}`);
export const createPet = (data) => api.post('/pets', data);
export const updatePet = (id, data) => api.put(`/pets/${id}`, data);
export const deletePet = (id) => api.delete(`/pets/${id}`);

/**
 * Helper to prepare an avatar upload payload compatible across Web (browsers/PWA)
 * and Native (Expo / iOS / Android).
 *
 * On Web: Converts local blob: or file: URIs to Base64 Data URLs so Axios can send
 * a clean JSON payload without multipart boundary stripping or browser FormData serialization errors.
 * On Native: Sends standard React Native multipart FormData.
 */
export const prepareAvatarRequest = async (imageUri, fieldName = 'avatar') => {
  if (!imageUri) {
    throw new Error('No image URI provided');
  }

  // 1. Already a Base64 data URL
  if (typeof imageUri === 'string' && imageUri.startsWith('data:image/')) {
    return {
      payload: { [fieldName]: imageUri },
      headers: { 'Content-Type': 'application/json' },
    };
  }

  // 2. Web browser environment
  if (Platform.OS === 'web' && typeof imageUri === 'string') {
    try {
      const response = await fetch(imageUri);
      const blob = await response.blob();
      const base64Data = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
      return {
        payload: { [fieldName]: base64Data },
        headers: { 'Content-Type': 'application/json' },
      };
    } catch (webErr) {
      console.warn('Web blob conversion error, attempting FormData fallback:', webErr);
    }
  }

  // 3. React Native Native (iOS / Android) or FormData fallback
  const formData = new FormData();
  if (Platform.OS === 'web') {
    try {
      const response = await fetch(imageUri);
      const blob = await response.blob();
      formData.append(fieldName, blob, `${fieldName}.jpg`);
    } catch {
      formData.append(fieldName, imageUri);
    }
    return {
      payload: formData,
      headers: {},
    };
  }

  const ext = imageUri.split('.').pop() || 'jpg';
  const cleanExt = ext.includes('?') ? ext.split('?')[0] : ext;
  const mimeType = cleanExt.toLowerCase() === 'png' ? 'image/png' : 'image/jpeg';
  formData.append(fieldName, {
    uri: imageUri,
    name: `${fieldName}.${cleanExt}`,
    type: mimeType,
  });

  return {
    payload: formData,
    headers: { 'Content-Type': 'multipart/form-data' },
  };
};

export const uploadUserAvatar = async (imageUri) => {
  const { payload, headers } = await prepareAvatarRequest(imageUri, 'avatar');
  return api.post('/user/avatar', payload, { headers });
};

export const uploadPetAvatar = async (petId, imageUri) => {
  const { payload, headers } = await prepareAvatarRequest(imageUri, 'avatar');
  return api.post(`/pets/${petId}/avatar`, payload, { headers });
};

// ============= MEDICAL RECORD ENDPOINTS (backend route may not exist yet) =============

export const getMedicalRecords = (petId) => api.get(`/pets/${petId}/medical-records`);

// ============= APPOINTMENT ENDPOINTS (for later) =============

export const getUserAppointments = () => api.get('/user/appointments');
export const getAppointment = (id) => api.get(`/appointments/${id}`);
export const createAppointment = (data) => api.post('/appointments', data);
export const rescheduleAppointment = (id, data) => api.put(`/appointments/${id}/reschedule`, data);
export const cancelAppointment = (id, data = {}) => api.put(`/appointments/${id}/cancel`, data);

// ============= NOTIFICATIONS ENDPOINTS =============

export const getNotifications = () => api.get('/notifications');
export const markNotificationRead = (id) => api.put(`/notifications/${id}/read`);
export const markAllNotificationsRead = () => api.put('/notifications/read-all');
export const updatePushToken = (push_token) => api.post('/user/push-token', { push_token });
export const sendTestPushNotification = () => api.post('/user/test-push');
export const getVapidPublicKey = () => api.get('/push/vapid-key');

// ============= CHATBOT ENDPOINT (for later) =============

export const sendChatMessage = (data) => api.post('/chatbot/message', data);
export const getBranches = () => api.get('/branches');
export const getClinicInfo = () => api.get('/clinic');

// ============= ATTACH HELPERS TO DEFAULT EXPORT =============
api.register = register;
api.login = login;
api.logout = logout;
api.getMe = getMe;
api.updateProfile = updateProfile;
api.changePassword = changePassword;
api.resetPassword = resetPassword;
api.getUserPets = getUserPets;
api.getPet = getPet;
api.createPet = createPet;
api.updatePet = updatePet;
api.deletePet = deletePet;
api.uploadUserAvatar = uploadUserAvatar;
api.uploadPetAvatar = uploadPetAvatar;
api.getMedicalRecords = getMedicalRecords;
api.getUserAppointments = getUserAppointments;
api.getAppointment = getAppointment;
api.createAppointment = createAppointment;
api.rescheduleAppointment = rescheduleAppointment;
api.cancelAppointment = cancelAppointment;
api.getNotifications = getNotifications;
api.markNotificationRead = markNotificationRead;
api.markAllNotificationsRead = markAllNotificationsRead;
api.updatePushToken = updatePushToken;
api.sendChatMessage = sendChatMessage;
api.getBranches = getBranches;
api.getClinicInfo = getClinicInfo;
api.sendTestPushNotification = sendTestPushNotification;
api.getVapidPublicKey = getVapidPublicKey;

export default api;
