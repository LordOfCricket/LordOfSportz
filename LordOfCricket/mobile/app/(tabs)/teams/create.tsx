import React, { useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native'
import { useRouter } from 'expo-router'
import { useAuth } from '../../../src/hooks/useAuth'
import { useCreateTeam } from '../../../src/hooks/useTeams'
import { Colors, Spacing, Typography } from '../../../src/constants/colors'

export default function CreateTeamScreen() {
  const router = useRouter()
  const { user } = useAuth()
  const createTeamMutation = useCreateTeam()

  const [name, setName] = useState('')
  const [shortName, setShortName] = useState('')
  const [logoUrl, setLogoUrl] = useState('')
  const [errors, setErrors] = useState<{ name?: string; shortName?: string }>({})

  const handleNameChange = (text: string) => {
    setName(text)
    if (text.trim().length > 0) {
      setErrors((prev) => ({ ...prev, name: undefined }))
    }
  }

  const handleShortNameChange = (text: string) => {
    setShortName(text.toUpperCase())
    if (text.trim().length > 0) {
      setErrors((prev) => ({ ...prev, shortName: undefined }))
    }
  }

  const validateForm = (): boolean => {
    const newErrors: { name?: string; shortName?: string } = {}

    if (!name.trim()) {
      newErrors.name = 'Team name is required'
    } else if (name.length > 100) {
      newErrors.name = 'Team name must not exceed 100 characters'
    }

    if (!shortName.trim()) {
      newErrors.shortName = 'Short name is required'
    } else if (shortName.length > 10) {
      newErrors.shortName = 'Short name must not exceed 10 characters'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleCreateTeam = async () => {
    if (!validateForm()) return

    createTeamMutation.mutate(
      {
        name: name.trim(),
        short_name: shortName.trim(),
        logo_url: logoUrl.trim() || undefined,
      },
      {
        onSuccess: (data) => {
          Alert.alert('Success', 'Team created successfully!', [
            {
              text: 'OK',
              onPress: () => {
                router.push(`/(tabs)/teams/${data.team.id}`)
              },
            },
          ])
        },
        onError: (error: any) => {
          const message = error?.response?.data?.message || error?.message || 'Failed to create team'
          Alert.alert('Error', message)
        },
      }
    )
  }

  if (!user || user.role !== 'player') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.backButton}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Create Team</Text>
        </View>
        <View style={styles.centered}>
          <Text style={styles.emptyText}>Please log in as a player to create a team.</Text>
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container}>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <TouchableOpacity onPress={() => router.back()}>
              <Text style={styles.backButton}>← Back</Text>
            </TouchableOpacity>
            <Text style={styles.title}>Create Team</Text>
          </View>

          <View style={styles.form}>
            {/* Team Name */}
            <View style={styles.formGroup}>
              <Text style={styles.label}>Team Name *</Text>
              <TextInput
                style={[styles.input, errors.name && styles.inputError]}
                placeholder="Enter team name"
                placeholderTextColor={Colors.textTertiary}
                value={name}
                onChangeText={handleNameChange}
                editable={!createTeamMutation.isPending}
                maxLength={100}
              />
              {errors.name && <Text style={styles.errorText}>{errors.name}</Text>}
              <Text style={styles.charCount}>{name.length}/100</Text>
            </View>

            {/* Short Name */}
            <View style={styles.formGroup}>
              <Text style={styles.label}>Short Name *</Text>
              <TextInput
                style={[styles.input, errors.shortName && styles.inputError]}
                placeholder="E.g., CSK, MI"
                placeholderTextColor={Colors.textTertiary}
                value={shortName}
                onChangeText={handleShortNameChange}
                editable={!createTeamMutation.isPending}
                maxLength={10}
              />
              {errors.shortName && <Text style={styles.errorText}>{errors.shortName}</Text>}
              <Text style={styles.charCount}>{shortName.length}/10</Text>
            </View>

            {/* Logo URL (Optional) */}
            <View style={styles.formGroup}>
              <Text style={styles.label}>Logo URL (Optional)</Text>
              <TextInput
                style={styles.input}
                placeholder="https://example.com/logo.png"
                placeholderTextColor={Colors.textTertiary}
                value={logoUrl}
                onChangeText={setLogoUrl}
                editable={!createTeamMutation.isPending}
              />
            </View>

            {/* Create Button */}
            <TouchableOpacity
              style={[styles.createButton, createTeamMutation.isPending && styles.buttonDisabled]}
              onPress={handleCreateTeam}
              disabled={createTeamMutation.isPending}
              accessibilityLabel="Create Team"
            >
              <Text style={styles.createButtonText}>
                {createTeamMutation.isPending ? 'Creating Team...' : 'Create Team'}
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollContent: {
    flexGrow: 1,
  },
  header: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backButton: {
    color: Colors.primary,
    fontWeight: Typography.fontWeight.semibold,
    fontSize: Typography.fontSize.base,
    marginBottom: Spacing.sm,
  },
  title: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.text,
  },
  form: {
    padding: Spacing.lg,
    gap: Spacing.lg,
  },
  formGroup: {
    gap: Spacing.xs,
  },
  label: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.text,
  },
  input: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    fontSize: Typography.fontSize.base,
    color: Colors.text,
    backgroundColor: Colors.backgroundAlt,
  },
  inputError: {
    borderColor: '#DC2626',
  },
  errorText: {
    fontSize: Typography.fontSize.sm,
    color: '#DC2626',
  },
  charCount: {
    fontSize: Typography.fontSize.xs,
    color: Colors.textSecondary,
    textAlign: 'right',
  },
  createButton: {
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: Spacing.lg,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  createButtonText: {
    color: Colors.white,
    fontWeight: Typography.fontWeight.bold,
    fontSize: Typography.fontSize.base,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
  },
  emptyText: {
    fontSize: Typography.fontSize.base,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
})
