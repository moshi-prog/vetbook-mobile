import axios from 'axios';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { getToken, clearSession } from './storage';

// URL resolution for web vs mobile (Expo Go tunnel / device)
const getApiUrl = () => {
  // 1. Explicit override via environment variable
  if (process.env.EXPO_PUBLIC_API_URL) return process.env.EXPO_PUBLIC_API_URL;

  // 2. Web browser: backend runs locally on same host
  if (Platform.OS === 'web') return 'http://127.0.0.1:8000/api';

  // 3. Physical mobile devices (Expo Go / release builds): default to ngrok tunnel
  return 'https://chance-circling-unrevised.ngrok-free.dev/api';
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
export const logout = () => api.post('/logout');
export const getMe = () => api.get('/me');
export const updateProfile = (data) => api.put('/user/profile', data);
export const changePassword = (data) => api.put('/user/password', data);

// ============= PET ENDPOINTS (for later) =============

export const getUserPets = () => api.get('/user/pets');
export const getPet = (id) => api.get(`/pets/${id}`);
export const createPet = (data) => api.post('/pets', data);
export const updatePet = (id, data) => api.put(`/pets/${id}`, data);
export const deletePet = (id) => api.delete(`/pets/${id}`);

export const uploadUserAvatar = (imageUri) => {
  const formData = new FormData();
  formData.append('avatar', {
    uri: imageUri,
    name: 'avatar.jpg',
    type: 'image/jpeg',
  });
  return api.post('/user/avatar', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};

export const uploadPetAvatar = (petId, imageUri) => {
  const formData = new FormData();
  formData.append('avatar', {
    uri: imageUri,
    name: 'pet_avatar.jpg',
    type: 'image/jpeg',
  });
  return api.post(`/pets/${petId}/avatar`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};

// ============= MEDICAL RECORD ENDPOINTS (backend route may not exist yet) =============

export const getMedicalRecords = (petId) => api.get(`/pets/${petId}/medical-records`);

// ============= APPOINTMENT ENDPOINTS (for later) =============

export const getUserAppointments = () => api.get('/user/appointments');
export const getAppointment = (id) => api.get(`/appointments/${id}`);
export const createAppointment = (data) => api.post('/appointments', data);
export const rescheduleAppointment = (id, data) => api.put(`/appointments/${id}/reschedule`, data);
export const cancelAppointment = (id) => api.put(`/appointments/${id}/cancel`);

// ============= NOTIFICATIONS ENDPOINTS =============

export const getNotifications = () => api.get('/notifications');
export const markNotificationRead = (id) => api.put(`/notifications/${id}/read`);
export const markAllNotificationsRead = () => api.put('/notifications/read-all');

// ============= CHATBOT ENDPOINT (for later) =============

export const sendChatMessage = (data) => api.post('/chatbot/message', data);
export const getBranches = () => api.get('/branches');

// ============= ATTACH HELPERS TO DEFAULT EXPORT =============
api.register = register;
api.login = login;
api.logout = logout;
api.getMe = getMe;
api.updateProfile = updateProfile;
api.changePassword = changePassword;
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
api.sendChatMessage = sendChatMessage;
api.getBranches = getBranches;

export default api;
