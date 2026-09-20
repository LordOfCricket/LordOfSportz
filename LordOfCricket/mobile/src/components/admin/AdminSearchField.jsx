import React from 'react'
import { View, StyleSheet, TextInput, TouchableOpacity } from 'react-native'
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import { LocColors, Spacing, Typography, BorderRadius } from '../../constants/colors'

export function AdminSearchField({ value, onChangeText, placeholder }) {
  return (
    <View style={styles.wrap}>
      <MaterialCommunityIcons name="magnify" size={18} color={LocColors.faint} />
      <TextInput
        style={styles.input}
        placeholder={placeholder}
        placeholderTextColor={LocColors.faint}
        value={value}
        onChangeText={onChangeText}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
      />
      {value ? (
        <TouchableOpacity onPress={() => onChangeText('')} hitSlop={8} accessibilityRole="button" accessibilityLabel="Clear search">
          <MaterialCommunityIcons name="close-circle" size={18} color={LocColors.faint} />
        </TouchableOpacity>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: LocColors.surface,
    borderWidth: 1,
    borderColor: LocColors.border,
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  input: { flex: 1, fontSize: Typography.fontSize.sm, color: LocColors.navy, padding: 0 },
})
