import React, { useState } from 'react'
import { View, StyleSheet } from 'react-native'
import { useRouter } from 'expo-router'
import { AdminGuard } from '../../../../src/components/admin/AdminGuard'
import { AdminSubHeader } from '../../../../src/components/admin/AdminSubHeader'
import { MerchandiseForm } from '../../../../src/components/admin/MerchandiseForm'
import { useCreateMerchandise } from '../../../../src/hooks/useAdminMerchandise'
import { contentErrorMessage } from '../../../../src/utils/adminContent'
import { LocColors } from '../../../../src/constants/colors'

function NewMerchandiseContent() {
  const router = useRouter()
  const create = useCreateMerchandise()
  const [error, setError] = useState(null)

  const onSubmit = async (fields, image) => {
    setError(null)
    try {
      await create.mutateAsync({ fields, image })
      router.back()
    } catch (err) {
      setError(contentErrorMessage(err))
    }
  }

  return (
    <View style={styles.container}>
      <AdminSubHeader title="New product" />
      <MerchandiseForm requireImage submitLabel="Create product" pending={create.isPending} error={error} onSubmit={onSubmit} />
    </View>
  )
}

export default function AdminNewMerchandiseScreen() {
  return (
    <AdminGuard>
      <NewMerchandiseContent />
    </AdminGuard>
  )
}

const styles = StyleSheet.create({ container: { flex: 1, backgroundColor: LocColors.mint } })
