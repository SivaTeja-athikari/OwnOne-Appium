import AsyncStorage from "@react-native-async-storage/async-storage";

/** Persistent device storage, with the platform library's localStorage adapter on web. */
export const localStorage = {
  getItem: (key: string) => AsyncStorage.getItem(key),
  setItem: (key: string, value: string) => AsyncStorage.setItem(key, value),
  removeItem: (key: string) => AsyncStorage.removeItem(key),
};
