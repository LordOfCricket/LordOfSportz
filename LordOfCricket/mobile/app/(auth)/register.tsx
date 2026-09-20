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
import { useRouter } from 'expo-router'
import * as authApi from '../../src/services/authApi'
import { Colors, Spacing, Typography } from '../../src/constants/colors'
import { getErrorMessage } from '../../src/utils/errors'

type AccountType = 'PLAYER' | 'UMPIRE'

export default function RegisterScreen() {
  const router = useRouter()
  const [firstName, setFirstName] = useState('')
  const [middleName, setMiddleName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [accountType, setAccountType] = useState<AccountType>('PLAYER')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleContinue = async () => {
    setError(null)

    if (!firstName.trim() || !middleName.trim() || !lastName.trim()) {
      setError('First, middle, and last name are required')
      return
    }
    if (!email.trim() || !phone.trim()) {
      setError('Email and phone number are required')
      return
    }
    if (!password || !confirmPassword) {
      setError('Password and confirmation are required')
      return
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    setLoading(true)
    try {
      // Two independent verifications must be requested before account creation.
      await authApi.signupSendCode(email.trim())
      await authApi.signupSendCode(phone.trim())

      router.push({
        pathname: '/(auth)/register-verify' as any,
        params: {
          firstName: firstName.trim(),
          middleName: middleName.trim(),
          lastName: lastName.trim(),
          email: email.trim(),
          phone: phone.trim(),
          accountType,
          password,
          confirmPassword,
        },
      })
    } catch (err) {
      Alert.alert('Error', getErrorMessage(err))
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

        <Text style={styles.title}>Create Account</Text>
        <Text style={styles.subtitle}>Join Lord Of Cricket</Text>

        <View style={styles.form}>
          <Text style={styles.label}>First Name</Text>
          <TextInput
            style={styles.input}
            placeholder="First name"
            placeholderTextColor={Colors.textTertiary}
            value={firstName}
            onChangeText={setFirstName}
            editable={!loading}
          />

          <Text style={styles.label}>Middle Name</Text>
          <TextInput
            style={styles.input}
            placeholder="Middle name"
            placeholderTextColor={Colors.textTertiary}
            value={middleName}
            onChangeText={setMiddleName}
            editable={!loading}
          />

          <Text style={styles.label}>Last Name</Text>
          <TextInput
            style={styles.input}
            placeholder="Last name"
            placeholderTextColor={Colors.textTertiary}
            value={lastName}
            onChangeText={setLastName}
            editable={!loading}
          />

          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            placeholder="you@example.com"
            placeholderTextColor={Colors.textTertiary}
            value={email}
            onChangeText={setEmail}
            editable={!loading}
            keyboardType="email-address"
            autoCapitalize="none"
          />

          <Text style={styles.label}>Phone Number</Text>
          <TextInput
            style={styles.input}
            placeholder="+91 XXXXX XXXXX"
            placeholderTextColor={Colors.textTertiary}
            value={phone}
            onChangeText={setPhone}
            editable={!loading}
            keyboardType="phone-pad"
            autoCapitalize="none"
          />

          <Text style={styles.label}>Account Type</Text>
          <View style={styles.typeRow}>
            {(['PLAYER', 'UMPIRE'] as AccountType[]).map((type) => (
              <TouchableOpacity
                key={type}
                style={[styles.typeButton, accountType === type && styles.typeButtonActive]}
                onPress={() => setAccountType(type)}
                disabled={loading}
              >
                <Text style={[styles.typeButtonText, accountType === type && styles.typeButtonTextActive]}>
                  {type === 'PLAYER' ? 'Player' : 'Umpire'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>Password</Text>
          <TextInput
            style={styles.input}
            placeholder="Create a password"
            placeholderTextColor={Colors.textTertiary}
            value={password}
            onChangeText={setPassword}
            editable={!loading}
            secureTextEntry
          />

          <Text style={styles.label}>Confirm Password</Text>
          <TextInput
            style={styles.input}
            placeholder="Confirm your password"
            placeholderTextColor={Colors.textTertiary}
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            editable={!loading}
            secureTextEntry
          />

          {error && <Text style={styles.error}>{error}</Text>}

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleContinue}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color={Colors.white} />
            ) : (
              <Text style={styles.buttonText}>Continue</Text>
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
    fontSize: Typography.fontSize.lg,
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
  typeRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  typeButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    padding: Spacing.md,
    alignItems: 'center',
    backgroundColor: Colors.backgroundAlt,
  },
  typeButtonActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary,
  },
  typeButtonText: {
    fontSize: Typography.fontSize.base,
    color: Colors.text,
    fontWeight: Typography.fontWeight.medium,
  },
  typeButtonTextActive: {
    color: Colors.white,
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
