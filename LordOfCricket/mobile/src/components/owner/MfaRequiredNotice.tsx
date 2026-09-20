import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import { LocColors, Spacing, Typography, BorderRadius } from '../../constants/colors'

// The backend requires a verified second factor for Ground Owner accounts
// and answers 403 MFA_REQUIRED. The mobile app has no MFA verification flow
// yet, so this is an honest dead-end: it tells the owner what is needed and
// points them to the web app. It never marks MFA as satisfied.
export function MfaRequiredNotice() {
  return (
    <View style={styles.card}>
      <MaterialCommunityIcons name="shield-lock-outline" size={28} color={LocColors.green} />
      <Text style={styles.title}>Extra verification needed</Text>
      <Text style={styles.body}>
        Your Ground Owner account is protected by two-factor authentication. Verifying a second factor
        isn’t supported in the app yet — please sign in on the LOC website to continue managing your
        grounds.
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: LocColors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: LocColors.border,
    padding: Spacing.lg,
    gap: Spacing.sm,
    alignItems: 'center',
  },
  title: { fontSize: Typography.fontSize.base, fontWeight: '800', color: LocColors.navy },
  body: {
    fontSize: Typography.fontSize.sm,
    color: LocColors.muted,
    textAlign: 'center',
    lineHeight: Typography.fontSize.sm * Typography.lineHeight.relaxed,
  },
})
