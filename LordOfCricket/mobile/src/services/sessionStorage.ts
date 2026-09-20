import { Platform } from 'react-native'
import * as SecureStore from 'expo-secure-store'
import AsyncStorage from '@react-native-async-storage/async-storage'

// The session cookie is the only credential the app persists. On native it is
// kept in the OS keystore (iOS Keychain / Android Keystore) via
// expo-secure-store. SecureStore has no web implementation, so the web build
// keeps using AsyncStorage (localStorage) — unchanged from before.
const useSecureStore = Platform.OS !== 'web'

export async function getSessionCookie(key: string): Promise<string | null> {
  if (!useSecureStore) return AsyncStorage.getItem(key)

  const secure = await SecureStore.getItemAsync(key)
  if (secure) return secure

  // One-time migration: a build before this change stored the cookie in
  // AsyncStorage. Move it into SecureStore so an existing session survives the
  // upgrade without a forced re-login.
  const legacy = await AsyncStorage.getItem(key)
  if (legacy) {
    try {
      await SecureStore.setItemAsync(key, legacy)
    } catch {
      // Keep the legacy value if the SecureStore write fails; retry next read.
      return legacy
    }
    await AsyncStorage.removeItem(key).catch(() => {})
    return legacy
  }
  return null
}

export async function setSessionCookie(key: string, value: string): Promise<void> {
  if (!useSecureStore) {
    await AsyncStorage.setItem(key, value)
    return
  }
  await SecureStore.setItemAsync(key, value)
}

export async function deleteSessionCookie(key: string): Promise<void> {
  if (!useSecureStore) {
    await AsyncStorage.removeItem(key)
    return
  }
  await SecureStore.deleteItemAsync(key)
  // Also drop any cookie left behind by a pre-migration build.
  await AsyncStorage.removeItem(key).catch(() => {})
}
