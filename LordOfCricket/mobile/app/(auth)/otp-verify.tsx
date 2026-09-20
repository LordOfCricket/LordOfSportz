import React, { useState, useRef } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native'
import { useRouter, useLocalSearchParams } from 'expo-router'
import { useAuthStore } from '../../src/store/authStore'
import { Colors, Spacing, Typography } from '../../src/constants/colors'
import { getErrorMessage } from '../../src/utils/errors'
import { getDevOtpCode } from '../../src/services/authApi'

export default function OtpVerifyScreen() {
  const router = useRouter()
  const { identifier } = useLocalSearchParams<{ identifier: string }>()
  const { verifyOtp, error, setError } = useAuthStore()
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<TextInput>(null)

  const handleVerifyOtp = async () => {
    if (!code.trim()) {
      setError('Please enter the OTP')
      return
    }

    if (!identifier) {
      setError('Identifier missing')
      return
    }

    setLoading(true)
    try {
      await verifyOtp(identifier, code)
      router.replace('/(tabs)/home')
    } catch (err) {
      Alert.alert('Verification Failed', getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  const handleBackToLogin = () => {
    router.back()
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <View style={styles.content}>
        <TouchableOpacity onPress={handleBackToLogin} disabled={loading}>
          <Text style={styles.backButton}>← Back</Text>
        </TouchableOpacity>

        <Text style={styles.title}>Verify OTP</Text>
        <Text style={styles.subtitle}>We{"'"}ve sent an OTP to {identifier}</Text>

        {/* DEVELOPMENT-ONLY: Show OTP code for testing */}
        {getDevOtpCode() && (
          <View style={styles.devModeBox}>
            <Text style={styles.devModeLabel}>🔧 Development Mode</Text>
            <Text style={styles.devModeOtp}>OTP: {getDevOtpCode()}</Text>
            <Text style={styles.devModeNote}>This is test-only. Not for production.</Text>
          </View>
        )}

        <View style={styles.form}>
          <Text style={styles.label}>Enter OTP</Text>
          <TextInput
            ref={inputRef}
            style={styles.input}
            placeholder="000000"
            placeholderTextColor={Colors.textTertiary}
            value={code}
            onChangeText={(text) => {
              setCode(text.replace(/\D/g, '').slice(0, 6))
              setError(null)
            }}
            editable={!loading}
            keyboardType="number-pad"
            maxLength={6}
            textAlign="center"
          />

          {error && <Text style={styles.error}>{error}</Text>}

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleVerifyOtp}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color={Colors.white} />
            ) : (
              <Text style={styles.buttonText}>Verify OTP</Text>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.helpSection}>
          <Text style={styles.helpText}>Didn{"'"}t receive the OTP?</Text>
          <TouchableOpacity onPress={handleBackToLogin} disabled={loading}>
            <Text style={styles.resendLink}>Request new OTP</Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  contentContainer: {
    flexGrow: 1,
  },
  content: {
    flex: 1,
    padding: Spacing.lg,
    justifyContent: 'center',
  },
  backButton: {
    fontSize: Typography.fontSize.base,
    color: Colors.primary,
    marginBottom: Spacing.xl,
    fontWeight: Typography.fontWeight.semibold,
  },
  title: {
    fontSize: Typography.fontSize['3xl'],
    fontWeight: Typography.fontWeight.bold,
    color: Colors.text,
    marginBottom: Spacing.sm,
  },
  subtitle: {
    fontSize: Typography.fontSize.base,
    color: Colors.textSecondary,
    marginBottom: Spacing['3xl'],
  },
  form: {
    gap: Spacing.md,
  },
  label: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.medium,
    color: Colors.text,
    marginBottom: Spacing.sm,
  },
  input: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    padding: Spacing.md,
    fontSize: Typography.fontSize['2xl'],
    color: Colors.text,
    backgroundColor: Colors.backgroundAlt,
    letterSpacing: 10,
  },
  button: {
    backgroundColor: Colors.primary,
    padding: Spacing.md,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.md,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: Colors.white,
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.semibold,
  },
  error: {
    color: Colors.error,
    fontSize: Typography.fontSize.sm,
  },
  helpSection: {
    alignItems: 'center',
    marginTop: Spacing['3xl'],
    gap: Spacing.sm,
  },
  helpText: {
    fontSize: Typography.fontSize.base,
    color: Colors.textSecondary,
  },
  resendLink: {
    fontSize: Typography.fontSize.base,
    color: Colors.primary,
    fontWeight: Typography.fontWeight.semibold,
  },
  // DEVELOPMENT-ONLY: Styles for dev mode OTP display
  devModeBox: {
    backgroundColor: '#FEF3C7',
    borderLeftWidth: 4,
    borderLeftColor: '#F59E0B',
    padding: Spacing.md,
    borderRadius: 6,
    marginBottom: Spacing.lg,
    marginTop: Spacing.lg,
  },
  devModeLabel: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.semibold,
    color: '#B45309',
    marginBottom: Spacing.xs,
  },
  devModeOtp: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.bold,
    color: '#000000',
    marginBottom: Spacing.sm,
    fontFamily: 'monospace',
  },
  devModeNote: {
    fontSize: Typography.fontSize.xs,
    color: '#92400E',
    fontStyle: 'italic',
  },
})
