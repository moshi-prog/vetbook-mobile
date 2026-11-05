import AsyncStorage from '@react-native-async-storage/async-storage';

const TOKEN_KEY = '@vetbook:token';
const USER_KEY = '@vetbook:user';

export const saveToken = async (token) => {
  try {
    await AsyncStorage.setItem(TOKEN_KEY, token);
    return true;
  } catch (error) {
    console.error('Error saving token:', error);
    return false;
  }
};

export const getToken = async () => {
  try {
    const token = await AsyncStorage.getItem(TOKEN_KEY);
    return token;
  } catch (error) {
    console.error('Error getting token:', error);
    return null;
  }
};

export const removeToken = async () => {
  try {
    await AsyncStorage.removeItem(TOKEN_KEY);
    return true;
  } catch (error) {
    console.error('Error removing token:', error);
    return false;
  }
};

export const saveUser = async (user) => {
  try {
    await AsyncStorage.setItem(USER_KEY, JSON.stringify(user));
    return true;
  } catch (error) {
    console.error('Error saving user:', error);
    return false;
  }
};

export const getUser = async () => {
  try {
    const user = await AsyncStorage.getItem(USER_KEY);
    return user ? JSON.parse(user) : null;
  } catch (error) {
    console.error('Error getting user:', error);
    return null;
  }
};

export const removeUser = async () => {
  try {
    await AsyncStorage.removeItem(USER_KEY);
    return true;
  } catch (error) {
    console.error('Error removing user:', error);
    return false;
  }
};

export const clearSession = async () => {
  try {
    await AsyncStorage.multiRemove([TOKEN_KEY, USER_KEY]);
    return true;
  } catch (error) {
    console.error('Error clearing session:', error);
    return false;
  }
};
