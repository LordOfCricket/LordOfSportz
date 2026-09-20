import { io, type Socket } from "socket.io-client";
import { tokenStorage } from "./token-storage";
import { ensureFreshAccessToken } from "./api-client";

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

type RealtimeEvent = { entityId?: string; eventType?: string };

export async function connectToBoutRealtime(
  boutId: string,
  handlers: { onEvent: () => void; onState: (state: "CONNECTED" | "RECONNECTING" | "OFFLINE") => void },
): Promise<() => void> {
  const initialToken = await tokenStorage.getAccessToken();
  if (!initialToken) {
    handlers.onState("OFFLINE");
    return () => undefined;
  }

  // `auth` as a function (not a static object) so Socket.IO reads the CURRENT
  // token on every (re)connection attempt — a static value captured once
  // would keep resending a stale token forever after the access token
  // expires (15 min TTL), stranding a long-open bout view in RECONNECTING.
  const socket: Socket = io(API_BASE_URL, {
    auth: async (cb) => cb({ token: (await tokenStorage.getAccessToken()) ?? "" }),
    transports: ["websocket", "polling"],
  });

  let refreshedThisAttempt = false;
  const onConnect = () => {
    refreshedThisAttempt = false;
    handlers.onState("CONNECTED");
    socket.emit("subscribe", { roomType: "bout", roomId: boutId }, (result: { ok: boolean }) => {
      if (!result.ok) handlers.onState("OFFLINE");
    });
  };
  const onDisconnect = () => handlers.onState("RECONNECTING");
  // A handshake auth failure (expired access token, no concurrent HTTP call to trigger the usual
  // 401 recovery) gets exactly one proactive refresh attempt per reconnect cycle, then lets
  // Socket.IO's built-in backoff retry normally — never a tight refresh loop.
  const onError = () => {
    handlers.onState("RECONNECTING");
    if (!refreshedThisAttempt) {
      refreshedThisAttempt = true;
      void ensureFreshAccessToken();
    }
  };
  const onEvent = (event: RealtimeEvent) => {
    if (event.entityId === boutId) handlers.onEvent();
  };

  socket.on("connect", onConnect);
  socket.on("disconnect", onDisconnect);
  socket.on("connect_error", onError);
  socket.on("event", onEvent);

  return () => {
    socket.emit("unsubscribe", { roomType: "bout", roomId: boutId });
    socket.off("connect", onConnect);
    socket.off("disconnect", onDisconnect);
    socket.off("connect_error", onError);
    socket.off("event", onEvent);
    socket.disconnect();
  };
}
