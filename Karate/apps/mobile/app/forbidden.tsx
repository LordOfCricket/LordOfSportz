import { Pressable, StyleSheet, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { colors, radii, spacing, typography } from "@/theme/tokens";

export default function ForbiddenScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.screen}>
      <Text style={styles.code}>403</Text>
      <Text style={styles.title}>You don&apos;t have access to this section</Text>
      <Pressable style={styles.button} onPress={() => router.replace("/")}>
        <Text style={styles.buttonText}>Back home</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.ink,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
  },
  code: { color: colors.accent, fontWeight: "700", fontSize: 12, marginBottom: spacing.sm },
  title: { ...typography.title, color: colors.white, textAlign: "center", marginBottom: spacing.lg },
  button: {
    backgroundColor: colors.white,
    borderRadius: radii.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  buttonText: { color: colors.ink, fontWeight: "600" },
});
