import React, { useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native'
import { useRouter } from 'expo-router'
import Constants from 'expo-constants'
import { useAuth } from '../../src/hooks/useAuth'
import { Colors, Spacing, Typography } from '../../src/constants/colors'
import { ErrorScreen } from '../../src/components/ErrorScreen'

const appVersion = Constants.expoConfig?.version || '1.0.0'

export default function SettingsScreen() {
  const router = useRouter()
  const { user, logout, changePassword } = useAuth()

  const [changePasswordModal, setChangePasswordModal] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!user) {
    return (
      <SafeAreaView style={styles.container}>
        <ErrorScreen
          title="Not Authenticated"
          message="Please log in to access settings"
          onRetry={() => router.back()}
          retryLabel="Go Back"
        />
      </SafeAreaView>
    )
  }

  const handleChangePassword = async () => {
    setError(null)

    // Validation
    if (!currentPassword.trim()) {
      setError('Current password is required')
      return
    }
    if (!newPassword.trim()) {
      setError('New password is required')
      return
    }
    if (!confirmPassword.trim()) {
      setError('Confirm password is required')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('New passwords do not match')
      return
    }
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }

    setLoading(true)
    try {
      await changePassword(currentPassword, newPassword, confirmPassword)
      Alert.alert('Success', 'Password changed successfully', [
        {
          text: 'OK',
          onPress: () => {
            setCurrentPassword('')
            setNewPassword('')
            setConfirmPassword('')
            setChangePasswordModal(false)
          },
        },
      ])
    } catch (err: any) {
      const message = err?.response?.data?.message || err?.message || 'Failed to change password'
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  const handleLogout = () => {
    Alert.alert('Log Out', 'Are you sure you want to log out?', [
      { text: 'Cancel', onPress: () => {} },
      {
        text: 'Log Out',
        style: 'destructive',
        onPress: async () => {
          try {
            await logout()
            router.replace('/')
          } catch {
            Alert.alert('Error', 'Failed to log out. Please try again.')
          }
        },
      },
    ])
  }

  if (changePasswordModal) {
    return (
      <SafeAreaView style={styles.container}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container}>
          <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
            <View style={styles.modalHeader}>
              <TouchableOpacity
                onPress={() => {
                  setChangePasswordModal(false)
                  setError(null)
                  setCurrentPassword('')
                  setNewPassword('')
                  setConfirmPassword('')
                }}
              >
                <Text style={styles.backButton}>← Back</Text>
              </TouchableOpacity>
              <Text style={styles.modalTitle}>Change Password</Text>
            </View>

            <View style={styles.form}>
              <View style={styles.formGroup}>
                <Text style={styles.label}>Current Password *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Enter current password"
                  placeholderTextColor={Colors.textTertiary}
                  secureTextEntry
                  value={currentPassword}
                  onChangeText={setCurrentPassword}
                  editable={!loading}
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>New Password *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Enter new password (min 8 characters)"
                  placeholderTextColor={Colors.textTertiary}
                  secureTextEntry
                  value={newPassword}
                  onChangeText={setNewPassword}
                  editable={!loading}
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Confirm New Password *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Confirm new password"
                  placeholderTextColor={Colors.textTertiary}
                  secureTextEntry
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  editable={!loading}
                />
              </View>

              {error && <Text style={styles.errorText}>{error}</Text>}

              <TouchableOpacity
                style={[styles.submitButton, loading && styles.buttonDisabled]}
                onPress={handleChangePassword}
                disabled={loading}
                accessibilityLabel="Change password"
              >
                {loading ? (
                  <ActivityIndicator color={Colors.white} />
                ) : (
                  <Text style={styles.submitButtonText}>Change Password</Text>
                )}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={styles.title}>Settings</Text>
        </View>

        {/* Account Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>ACCOUNT</Text>

          <View style={styles.card}>
            <View style={styles.settingRow}>
              <Text style={styles.settingLabel}>Name</Text>
              <Text style={styles.settingValue}>{user.name}</Text>
            </View>
          </View>

          <View style={styles.card}>
            <View style={styles.settingRow}>
              <Text style={styles.settingLabel}>Email</Text>
              <Text style={styles.settingValue}>{user.email}</Text>
            </View>
          </View>

          <View style={styles.card}>
            <View style={styles.settingRow}>
              <Text style={styles.settingLabel}>Role</Text>
              <Text style={styles.settingValue}>{user.role.charAt(0).toUpperCase() + user.role.slice(1)}</Text>
            </View>
          </View>
        </View>

        {/* Security Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>SECURITY</Text>

          <TouchableOpacity
            style={styles.card}
            onPress={() => setChangePasswordModal(true)}
            accessibilityRole="button"
            accessibilityLabel="Change password"
          >
            <Text style={styles.actionText}>Change Password</Text>
            <Text style={styles.actionArrow}>›</Text>
          </TouchableOpacity>
        </View>

        {/* About Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>ABOUT</Text>

          <View style={styles.card}>
            <View style={styles.settingRow}>
              <Text style={styles.settingLabel}>App Version</Text>
              <Text style={styles.settingValue}>v{appVersion}</Text>
            </View>
          </View>
        </View>

        {/* Session Section */}
        <View style={styles.section}>
          <TouchableOpacity
            style={[styles.card, styles.logoutCard]}
            onPress={handleLogout}
            accessibilityRole="button"
            accessibilityLabel="Log out"
          >
            <Text style={styles.logoutText}>Log Out</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
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
    paddingVertical: Spacing.lg,
    backgroundColor: Colors.primary,
  },
  title: {
    fontSize: Typography.fontSize['2xl'],
    fontWeight: Typography.fontWeight.bold,
    color: Colors.white,
  },
  section: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.sm,
  },
  sectionTitle: {
    fontSize: Typography.fontSize.xs,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.textSecondary,
    marginBottom: Spacing.md,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  card: {
    backgroundColor: Colors.backgroundAlt,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    marginBottom: Spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  settingRow: {
    flex: 1,
  },
  settingLabel: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.textSecondary,
    marginBottom: Spacing.xs,
  },
  settingValue: {
    fontSize: Typography.fontSize.base,
    color: Colors.text,
    fontWeight: Typography.fontWeight.medium,
  },
  actionText: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.primary,
  },
  actionArrow: {
    fontSize: Typography.fontSize.lg,
    color: Colors.primary,
  },
  logoutCard: {
    justifyContent: 'center',
    marginBottom: Spacing.lg,
  },
  logoutText: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.bold,
    color: '#DC2626',
    textAlign: 'center',
  },

  /* Modal Styles */
  modalHeader: {
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
  modalTitle: {
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
  errorText: {
    fontSize: Typography.fontSize.sm,
    color: '#DC2626',
    marginTop: Spacing.sm,
  },
  submitButton: {
    backgroundColor: Colors.primary,
    paddingVertical: Spacing.md,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: Spacing.lg,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  submitButtonText: {
    color: Colors.white,
    fontWeight: Typography.fontWeight.bold,
    fontSize: Typography.fontSize.base,
  },
})
