import { Linking } from "react-native";
import { tokenStorage } from "./token-storage";

// Shared identity provider (LordOfCricket API). Local dev over `adb reverse`: http://localhost:5000/api
const CRICKET_API_URL = process.env.EXPO_PUBLIC_CRICKET_API_URL;
// Deep-link base of the Cricket app (release: loc-mobile://; Expo Go dev: exp://localhost:8081/--/).
const CRICKET_APP_URL = process.env.EXPO_PUBLIC_CRICKET_APP_URL ?? "loc-mobile://";

export const ssoEnabled = Boolean(CRICKET_API_URL);

/** Mints a one-time, 60s handoff code for the Cricket app and opens it — no raw token leaves this app. */
export async function openCricketApp(): Promise<void> {
  const session = await tokenStorage.getCricketSession();
  if (!CRICKET_API_URL || !session) return;
  const res = await fetch(`${CRICKET_API_URL}/auth/sso/handoff`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: session },
    body: JSON.stringify({ audience: "cricket-mobile" }),
  });
  if (!res.ok) return;
  const { code } = (await res.json()) as { code: string };
  await Linking.openURL(`${CRICKET_APP_URL}sso?code=${encodeURIComponent(code)}`);
}

/** Best-effort: ends this app's shared-identity session so it cannot mint further handoffs. */
export async function cricketLogout(): Promise<void> {
  const session = await tokenStorage.getCricketSession();
  if (!CRICKET_API_URL || !session) return;
  try {
    await fetch(`${CRICKET_API_URL}/auth/logout?scope=all`, { method: "POST", headers: { Cookie: session } });
  } catch {
    // Local credentials are cleared by the caller regardless.
  }
}

/**
 * Whether this app's shared-identity session is still valid. `false` only on a definite
 * rejection (401); network errors return `true` so an offline app is never logged out.
 */
export async function sharedIdentityValid(): Promise<boolean> {
  const session = await tokenStorage.getCricketSession();
  if (!CRICKET_API_URL || !session) return true;
  try {
    const res = await fetch(`${CRICKET_API_URL}/auth/me`, { headers: { Cookie: session } });
    return res.status !== 401;
  } catch {
    return true;
  }
}
