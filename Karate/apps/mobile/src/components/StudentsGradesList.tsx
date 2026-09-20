import { StyleSheet, Text, View } from "react-native";
import { Card } from "./Card";
import { Badge } from "./Badge";
import { EmptyState } from "./EmptyState";
import { colors, spacing, typography } from "@/theme/tokens";
import type { StudentGrade } from "@/lib/api-client";

export function StudentsGradesList({ students }: { students: StudentGrade[] }) {
  return (
    <Card>
      <Text style={styles.title}>Students&apos; current grades</Text>
      {students.length === 0 ? (
        <EmptyState title="No students yet" />
      ) : (
        students.map((s) => (
          <View key={s.playerId} style={styles.row}>
            <Text style={styles.name}>{s.displayName}</Text>
            <Badge label={s.currentGrade?.name ?? "No grade"} tone={s.currentGrade ? "success" : "neutral"} />
          </View>
        ))
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  title: { ...typography.subtitle, color: colors.textPrimary, marginBottom: spacing.sm },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.xs,
  },
  name: { ...typography.body, fontWeight: "600", color: colors.textPrimary },
});
