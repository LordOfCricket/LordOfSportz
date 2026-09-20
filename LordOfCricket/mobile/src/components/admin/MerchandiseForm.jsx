import React, { useState } from 'react'
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity } from 'react-native'
import { AdminFormField } from './AdminFormField'
import { AdminImagePicker } from './AdminImagePicker'
import { AdminOptionPicker } from './AdminOptionPicker'
import { MERCHANDISE_CATEGORIES, MERCHANDISE_STATUSES, merchStatusMeta, validateMerchandisePrices } from '../../utils/adminContent'
import { LocColors, Spacing, Typography, BorderRadius } from '../../constants/colors'

const CATEGORY_OPTS = MERCHANDISE_CATEGORIES.map((c) => ({ value: c, label: c }))
const STATUS_OPTS = MERCHANDISE_STATUSES.map((s) => ({ value: s, label: merchStatusMeta(s).label }))

const EMPTY = {
  name: '',
  category: '',
  description: '',
  sellingPrice: '',
  originalPrice: '',
  discountPrice: '',
  status: 'DRAFT',
  sortOrder: '',
}

// Shared create/edit form. `onSubmit(fields, image)` — fields are strings;
// `image` is the picked asset or null. `currentImageUrl` shows an existing
// image on edit; `requireImage` enforces a pick on create.
export function MerchandiseForm({ initial, currentImageUrl, requireImage = false, submitLabel, pending, error, onSubmit }) {
  const [f, setF] = useState({ ...EMPTY, ...(initial || {}) })
  const [image, setImage] = useState(null)
  const [localError, setLocalError] = useState(null)
  const [picker, setPicker] = useState(null)
  const set = (patch) => setF((prev) => ({ ...prev, ...patch }))
  const num = (v) => v.replace(/[^0-9.]/g, '')

  const submit = () => {
    if (!f.name.trim()) return setLocalError('A product name is required.')
    if (!f.category) return setLocalError('Choose a category.')
    if (requireImage && !image) return setLocalError('Choose a product image.')
    const priceError = validateMerchandisePrices(f)
    if (priceError) return setLocalError(priceError)
    if (f.sortOrder.trim()) {
      const n = Number(f.sortOrder)
      if (!Number.isInteger(n) || n < 0) return setLocalError('Display order must be a whole number of 0 or more.')
    }
    setLocalError(null)
    const fields = {
      name: f.name.trim(),
      category: f.category,
      description: f.description.trim() || undefined,
      sellingPrice: f.sellingPrice.trim(),
      originalPrice: f.originalPrice.trim() || undefined,
      discountPrice: f.discountPrice.trim() || undefined,
      status: f.status,
      sortOrder: f.sortOrder.trim() || undefined,
    }
    onSubmit(fields, image)
  }

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <AdminFormField label="Name" required value={f.name} onChangeText={(v) => set({ name: v })} maxLength={150} />
      <AdminImagePicker
        label="Product image"
        required={requireImage}
        value={image}
        currentUrl={currentImageUrl}
        onChange={setImage}
        disabled={pending}
      />

      <Selector label="Category" required value={f.category} placeholder="Choose a category" onPress={() => setPicker('category')} />

      <AdminFormField label="Description" value={f.description} onChangeText={(v) => set({ description: v })} multiline maxLength={2000} />
      <AdminFormField label="Selling price (₹)" required value={f.sellingPrice} onChangeText={(v) => set({ sellingPrice: num(v) })} keyboardType="decimal-pad" maxLength={12} />
      <AdminFormField label="Original price (₹)" value={f.originalPrice} onChangeText={(v) => set({ originalPrice: num(v) })} keyboardType="decimal-pad" maxLength={12} />
      <AdminFormField label="Discount price (₹)" value={f.discountPrice} onChangeText={(v) => set({ discountPrice: num(v) })} keyboardType="decimal-pad" maxLength={12} />

      <Selector label="Status" value={f.status} onPress={() => setPicker('status')} display={merchStatusMeta(f.status).label} />

      <AdminFormField
        label="Display order"
        value={f.sortOrder}
        onChangeText={(v) => set({ sortOrder: v.replace(/[^0-9]/g, '') })}
        placeholder="0"
        keyboardType="number-pad"
        maxLength={4}
      />

      {(localError || error) ? <Text style={styles.error}>{localError || error}</Text> : null}

      <TouchableOpacity style={[styles.submitBtn, pending && styles.disabled]} onPress={submit} disabled={pending} accessibilityRole="button">
        {pending ? <ActivityIndicator color={LocColors.surface} /> : <Text style={styles.submitText}>{submitLabel}</Text>}
      </TouchableOpacity>

      <AdminOptionPicker
        visible={picker === 'category'}
        title="Category"
        options={CATEGORY_OPTS}
        selected={f.category}
        onSelect={(v) => set({ category: v })}
        onClose={() => setPicker(null)}
      />
      <AdminOptionPicker
        visible={picker === 'status'}
        title="Status"
        options={STATUS_OPTS}
        selected={f.status}
        onSelect={(v) => set({ status: v })}
        onClose={() => setPicker(null)}
      />
    </ScrollView>
  )
}

function Selector({ label, required, value, display, placeholder, onPress }) {
  return (
    <View style={styles.field}>
      <Text style={styles.selLabel}>
        {label}
        {required ? <Text style={styles.req}> *</Text> : null}
      </Text>
      <TouchableOpacity style={styles.selTrigger} onPress={onPress} accessibilityRole="button">
        <Text style={[styles.selValue, !value && styles.selPlaceholder]} numberOfLines={1}>
          {value ? (display ?? value) : placeholder}
        </Text>
      </TouchableOpacity>
    </View>
  )
}

const styles = StyleSheet.create({
  content: { padding: Spacing.lg, gap: Spacing.md, paddingBottom: Spacing['3xl'] },
  field: { gap: 4 },
  selLabel: { fontSize: Typography.fontSize.xs, fontWeight: '700', color: LocColors.muted },
  req: { color: '#B91C1C' },
  selTrigger: {
    borderWidth: 1,
    borderColor: LocColors.borderSoft,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: LocColors.surface,
  },
  selValue: { fontSize: Typography.fontSize.sm, color: LocColors.navy },
  selPlaceholder: { color: LocColors.faint },
  error: { fontSize: Typography.fontSize.sm, color: '#B91C1C' },
  submitBtn: { paddingVertical: Spacing.md, borderRadius: BorderRadius.full, backgroundColor: LocColors.green, alignItems: 'center' },
  submitText: { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.bold, color: LocColors.surface },
  disabled: { opacity: 0.5 },
})
