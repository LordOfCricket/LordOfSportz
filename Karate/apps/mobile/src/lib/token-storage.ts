import * as SecureStore from "expo-secure-store";
import { ACCESS_TOKEN_COOKIE_NAME, REFRESH_TOKEN_COOKIE_NAME } from "@karate/constants";

/**
 * SecureStore is backed by Keychain (iOS) / Keystore (Android) — the mobile
 * equivalent of "never store tokens in plain, script-readable storage."
 * AsyncStorage is NOT used here on purpose; it is unencrypted.
 */
const CRICKET_SESSION_KEY = "loc_session";

export const tokenStorage = {
  /** This app's OWN LordOfCricket session (identity provider), used only to mint SSO handoffs and to log out. */
  async saveCricketSession(cookiePair: string): Promise<void> {
    await SecureStore.setItemAsync(CRICKET_SESSION_KEY, cookiePair);
  },

  async getCricketSession(): Promise<string | null> {
    return SecureStore.getItemAsync(CRICKET_SESSION_KEY);
  },

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
      SecureStore.deleteItemAsync(CRICKET_SESSION_KEY),
    ]);
  },
};
