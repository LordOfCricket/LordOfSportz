import { StyleSheet, Text, View } from "react-native";
import { colors, spacing } from "@/theme/tokens";

type ConnectionState = "CONNECTED" | "RECONNECTING" | "OFFLINE";

const STATE_COLOR: Record<ConnectionState, string> = {
  CONNECTED: colors.success,
  RECONNECTING: colors.warning,
  OFFLINE: colors.danger,
};

/**
 * Always-visible connection state for the scorer workflow (section 30/33 of
 * the product spec): a scorer mid-bout must never wonder whether their
 * device is actually talking to the server.
 */
export function ConnectionIndicator({ state }: { state: ConnectionState }) {
  return (
    <View style={styles.row}>
      <View style={[styles.dot, { backgroundColor: STATE_COLOR[state] }]} />
      <Text style={styles.label}>{state}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  dot: { width: 8, height: 8, borderRadius: 4 },
  label: { fontSize: 12, fontWeight: "600", color: colors.textSecondary },
});
