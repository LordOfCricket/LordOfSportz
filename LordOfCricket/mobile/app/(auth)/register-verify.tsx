import React, { useState } from 'react'
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
import * as authApi from '../../src/services/authApi'
import { Colors, Spacing, Typography } from '../../src/constants/colors'
import { getErrorMessage } from '../../src/utils/errors'

export default function RegisterVerifyScreen() {
  const router = useRouter()
  const params = useLocalSearchParams<{
    firstName: string
    middleName: string
    lastName: string
    email: string
    phone: string
    accountType: 'PLAYER' | 'UMPIRE'
    password: string
    confirmPassword: string
  }>()

  const [emailCode, setEmailCode] = useState('')
  const [phoneCode, setPhoneCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleCreateAccount = async () => {
    setError(null)

    if (!emailCode.trim() || !phoneCode.trim()) {
      setError('Enter the code sent to your email and phone')
      return
    }

    setLoading(true)
    try {
      // Both identifiers must be verified independently before create-account
      // will accept them — backend re-checks this itself either way.
      await authApi.signupVerifyCode(params.email, emailCode.trim())
      await authApi.signupVerifyCode(params.phone, phoneCode.trim())

      await authApi.signupCreateAccount({
        firstName: params.firstName,
        middleName: params.middleName,
        lastName: params.lastName,
        accountType: params.accountType,
        email: params.email,
        phone: params.phone,
        password: params.password,
        confirmPassword: params.confirmPassword,
      })

      Alert.alert('Account Created', 'You can now sign in with your new account.', [
        { text: 'OK', onPress: () => router.replace('/(auth)/login') },
      ])
    } catch (err) {
      Alert.alert('Registration Failed', getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <View style={styles.content}>
        <TouchableOpacity onPress={() => router.back()} disabled={loading}>
          <Text style={styles.backButton}>← Back</Text>
        </TouchableOpacity>

        <Text style={styles.title}>Verify Your Details</Text>
        <Text style={styles.subtitle}>
          We{"'"}ve sent a code to {params.email} and {params.phone}
        </Text>

        <View style={styles.form}>
          <Text style={styles.label}>Email Code</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter email code"
            placeholderTextColor={Colors.textTertiary}
            value={emailCode}
            onChangeText={setEmailCode}
            editable={!loading}
            keyboardType="number-pad"
          />

          <Text style={styles.label}>Phone Code</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter phone code"
            placeholderTextColor={Colors.textTertiary}
            value={phoneCode}
            onChangeText={setPhoneCode}
            editable={!loading}
            keyboardType="number-pad"
          />

          {error && <Text style={styles.error}>{error}</Text>}

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleCreateAccount}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color={Colors.white} />
            ) : (
              <Text style={styles.buttonText}>Create Account</Text>
            )}
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
  },
  backButton: {
    fontSize: Typography.fontSize.base,
    color: Colors.primary,
    marginBottom: Spacing.lg,
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
    marginBottom: Spacing.xl,
  },
  form: {
    gap: Spacing.md,
  },
  label: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.medium,
    color: Colors.text,
    marginBottom: -Spacing.sm,
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
})
