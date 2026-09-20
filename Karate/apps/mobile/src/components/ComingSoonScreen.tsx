import { StyleSheet, View } from "react-native";
import { EmptyState } from "@/components/EmptyState";
import { colors, spacing } from "@/theme/tokens";

export function ComingSoonScreen({ feature }: { feature: string }) {
  return (
    <View style={styles.screen}>
      <EmptyState
        title={`${feature} is not implemented yet`}
        description="This screen is scaffolded as part of the Phase 1 navigation shell. The feature ships in a later phase."
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface, padding: spacing.lg, justifyContent: "center" },
});
