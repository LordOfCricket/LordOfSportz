import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Card } from "./Card";
import { TextField } from "./TextField";
import { apiClient, ApiRequestError, type AcademySummary } from "@/lib/api-client";
import { colors, radii, spacing, typography } from "@/theme/tokens";

export function AcademySearchBox({ onJoined }: { onJoined: () => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<AcademySummary[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSearch() {
    if (!query.trim()) return;
    setIsSearching(true);
    setError(null);
    try {
      setResults(await apiClient.searchAcademies(query));
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Search failed.");
    } finally {
      setIsSearching(false);
    }
  }

  async function handleJoin(academyId: string) {
    setJoiningId(academyId);
    try {
      await apiClient.requestToJoinAcademy(academyId);
      onJoined();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Could not send the request.");
    } finally {
      setJoiningId(null);
    }
  }

  return (
    <Card>
      <Text style={styles.title}>Find an academy</Text>
      <View style={styles.searchRow}>
        <View style={{ flex: 1 }}>
          <TextField label="" placeholder="Search by name" value={query} onChangeText={setQuery} />
        </View>
        <Pressable style={styles.searchButton} onPress={handleSearch}>
          {isSearching ? (
            <ActivityIndicator color={colors.textPrimary} />
          ) : (
            <Text style={styles.searchButtonText}>Go</Text>
          )}
        </Pressable>
      </View>
      {error && <Text style={styles.error}>{error}</Text>}
      {results.map((academy) => (
        <View key={academy.id} style={styles.resultRow}>
          <Text style={styles.resultName}>{academy.name}</Text>
          <Pressable
            style={styles.joinButton}
            onPress={() => handleJoin(academy.id)}
            disabled={joiningId === academy.id}
          >
            {joiningId === academy.id ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <Text style={styles.joinButtonText}>Request</Text>
            )}
          </Pressable>
        </View>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  title: { ...typography.subtitle, color: colors.textPrimary, marginBottom: spacing.sm },
  searchRow: { flexDirection: "row", alignItems: "flex-end", gap: spacing.sm },
  searchButton: {
    backgroundColor: colors.surfaceSunken,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  searchButtonText: { fontWeight: "600", color: colors.textPrimary },
  error: { color: colors.danger, fontSize: 13, marginTop: spacing.sm },
  resultRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginTop: spacing.sm,
  },
  resultName: { ...typography.body, color: colors.textPrimary, flex: 1 },
  joinButton: {
    backgroundColor: colors.accent,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  joinButtonText: { color: colors.white, fontWeight: "600", fontSize: 12 },
});
