import * as SecureStore from "expo-secure-store";
import { ACCESS_TOKEN_COOKIE_NAME, REFRESH_TOKEN_COOKIE_NAME } from "@karate/constants";

/**
 * SecureStore is backed by Keychain (iOS) / Keystore (Android) — the mobile
 * equivalent of "never store tokens in plain, script-readable storage."
 * AsyncStorage is NOT used here on purpose; it is unencrypted.
 */
export const tokenStorage = {
  async save(accessToken: string, refreshToken: string): Promise<void> {
    await Promise.all([
      SecureStore.setItemAsync(ACCESS_TOKEN_COOKIE_NAME, accessToken),
      SecureStore.setItemAsync(REFRESH_TOKEN_COOKIE_NAME, refreshToken),
    ]);
  },

  async getAccessToken(): Promise<string | null> {
    return SecureStore.getItemAsync(ACCESS_TOKEN_COOKIE_NAME);
  },

  async getRefreshToken(): Promise<string | null> {
    return SecureStore.getItemAsync(REFRESH_TOKEN_COOKIE_NAME);
  },

  async clear(): Promise<void> {
    await Promise.all([
      SecureStore.deleteItemAsync(ACCESS_TOKEN_COOKIE_NAME),
      SecureStore.deleteItemAsync(REFRESH_TOKEN_COOKIE_NAME),
    ]);
  },
};
