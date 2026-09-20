import React, { useState } from 'react'
import {
  View,
  Text,
  Modal,
  Image,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  SafeAreaView,
} from 'react-native'
import { Colors, Spacing, Typography } from '../constants/colors'

interface PhotoPreviewModalProps {
  visible: boolean
  imageUri: string | null
  onUpload: (uri: string) => Promise<void>
  onCancel: () => void
  onChooseAnother: () => void
}

export function PhotoPreviewModal({
  visible,
  imageUri,
  onUpload,
  onCancel,
  onChooseAnother,
}: PhotoPreviewModalProps) {
  const [isUploading, setIsUploading] = useState(false)

  const handleUpload = async () => {
    if (!imageUri) return

    setIsUploading(true)

    try {
      await onUpload(imageUri)
    } catch (error: any) {
      const message =
        error.message || 'Failed to upload photo. Please try again.'
      Alert.alert('Upload Failed', message)
    } finally {
      setIsUploading(false)
    }
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={onCancel}
    >
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={onCancel}
            disabled={isUploading}
            style={styles.closeButton}
          >
            <Text style={styles.closeButtonText}>✕</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Profile Photo</Text>
          <View style={{ width: 44 }} />
        </View>

        <View style={styles.content}>
          {imageUri && (
            <Image
              source={{ uri: imageUri }}
              style={styles.imagePreview}
              resizeMode="contain"
            />
          )}

          <View style={styles.buttonContainer}>
            <TouchableOpacity
              style={[styles.secondaryButton, isUploading && styles.buttonDisabled]}
              onPress={onChooseAnother}
              disabled={isUploading}
            >
              <Text style={styles.secondaryButtonText}>Choose Another</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.primaryButton,
                isUploading && styles.buttonDisabled,
              ]}
              onPress={handleUpload}
              disabled={isUploading}
            >
              {isUploading ? (
                <ActivityIndicator size="small" color={Colors.white} />
              ) : (
                <Text style={styles.primaryButtonText}>Upload Photo</Text>
              )}
            </TouchableOpacity>
          </View>

          {isUploading && (
            <View style={styles.loadingContainer}>
              <Text style={styles.uploadingText}>Uploading your photo...</Text>
            </View>
          )}
        </View>
      </SafeAreaView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  closeButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: Typography.fontSize.xl,
    color: Colors.text,
    fontWeight: Typography.fontWeight.bold,
  },
  title: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.text,
  },
  content: {
    flex: 1,
    padding: Spacing.lg,
    justifyContent: 'center',
  },
  imagePreview: {
    width: '100%',
    height: 350,
    borderRadius: 8,
    marginBottom: Spacing.xl,
    backgroundColor: Colors.gray[100],
  },
  buttonContainer: {
    gap: Spacing.md,
  },
  primaryButton: {
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 48,
  },
  primaryButtonText: {
    color: Colors.white,
    fontWeight: Typography.fontWeight.semibold,
    fontSize: Typography.fontSize.base,
  },
  secondaryButton: {
    backgroundColor: Colors.gray[100],
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 48,
  },
  secondaryButtonText: {
    color: Colors.text,
    fontWeight: Typography.fontWeight.semibold,
    fontSize: Typography.fontSize.base,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  loadingContainer: {
    marginTop: Spacing.lg,
    alignItems: 'center',
  },
  uploadingText: {
    fontSize: Typography.fontSize.base,
    color: Colors.textSecondary,
    fontWeight: Typography.fontWeight.medium,
  },
})
