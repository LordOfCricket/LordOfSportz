import React, { useState, useEffect } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  AccessibilityInfo,
} from 'react-native'
import { useRouter } from 'expo-router'
import { useAuthStore } from '../../src/store/authStore'
import { Colors, Spacing, Typography } from '../../src/constants/colors'
import { getErrorMessage } from '../../src/utils/errors'

export default function LoginScreen() {
  const router = useRouter()
  const { requestOtp, error, setError } = useAuthStore()
  const [identifier, setIdentifier] = useState('')
  const [loading, setLoading] = useState(false)

  // Announce errors to screen readers
  useEffect(() => {
    if (error) {
      AccessibilityInfo.announceForAccessibility(error)
    }
  }, [error])

  const handleSendOtp = async () => {
    if (!identifier.trim()) {
      setError('Please enter your mobile number')
      return
    }

    setLoading(true)
    try {
      await requestOtp(identifier)
      router.push({
        pathname: '/(auth)/otp-verify',
        params: { identifier },
      })
    } catch (err) {
      Alert.alert('Error', getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Lord Of Cricket</Text>
        <Text style={styles.subtitle}>Mobile App</Text>

        <View style={styles.form}>
          <Text style={styles.label}>Mobile Number</Text>
          <TextInput
            style={styles.input}
            placeholder="+91 XXXXX XXXXX"
            placeholderTextColor={Colors.textTertiary}
            value={identifier}
            onChangeText={(text) => {
              setIdentifier(text.trim())
              setError(null)
            }}
            editable={!loading}
            keyboardType="phone-pad"
            autoCapitalize="none"
            accessibilityRole="text"
          />

          {error && <Text style={styles.error}>{error}</Text>}

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleSendOtp}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color={Colors.white} />
            ) : (
              <Text style={styles.buttonText}>Send OTP</Text>
            )}
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.registerLink}
          onPress={() => router.push('/(auth)/register' as any)}
          disabled={loading}
        >
          <Text style={styles.registerLinkText}>New here? Create an account</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    flex: 1,
    padding: Spacing.lg,
    justifyContent: 'center',
  },
  title: {
    fontSize: Typography.fontSize['3xl'],
    fontWeight: Typography.fontWeight.bold,
    color: Colors.text,
    marginBottom: Spacing.sm,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: Typography.fontSize.lg,
    color: Colors.textSecondary,
    marginBottom: Spacing['3xl'],
    textAlign: 'center',
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
    fontSize: Typography.fontSize.base,
    color: Colors.text,
    backgroundColor: Colors.backgroundAlt,
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
  registerLink: {
    marginTop: Spacing.xl,
    alignItems: 'center',
  },
  registerLinkText: {
    color: Colors.primary,
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.medium,
  },
})
