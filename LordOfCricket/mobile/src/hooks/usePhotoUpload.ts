import { useState, useCallback } from 'react'
import * as ImagePicker from 'expo-image-picker'
import { Alert } from 'react-native'
import { useUploadPlayerPhoto } from './usePlayer'
import { validatePhoto, getPhotoErrorMessage } from '../utils/photoValidation'

export interface PhotoUploadState {
  selectedImageUri: string | null
  selectedImageMimeType: string | null
  selectedImageSize: number | null
  isPermissionPending: boolean
  showPreview: boolean
  previewError: string | null
}

export function usePhotoUpload() {
  const uploadMutation = useUploadPlayerPhoto()
  const [state, setState] = useState<PhotoUploadState>({
    selectedImageUri: null,
    selectedImageMimeType: null,
    selectedImageSize: null,
    isPermissionPending: false,
    showPreview: false,
    previewError: null,
  })

  const requestCameraPermission = useCallback(async () => {
    setState((prev) => ({ ...prev, isPermissionPending: true }))
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync()

      if (!permission.granted) {
        Alert.alert(
          'Camera Access Denied',
          'Lord Of Cricket needs permission to use your camera. Please enable camera access in your settings.'
        )
        return false
      }
      return true
    } finally {
      setState((prev) => ({ ...prev, isPermissionPending: false }))
    }
  }, [])

  const requestPhotoLibraryPermission = useCallback(async () => {
    setState((prev) => ({ ...prev, isPermissionPending: true }))
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()

      if (!permission.granted) {
        Alert.alert(
          'Photo Library Access Denied',
          'Lord Of Cricket needs permission to access your photos. Please enable photo library access in your settings.'
        )
        return false
      }
      return true
    } finally {
      setState((prev) => ({ ...prev, isPermissionPending: false }))
    }
  }, [])

  const launchCamera = useCallback(async () => {
    const hasPermission = await requestCameraPermission()
    if (!hasPermission) return

    try {
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.8,
      })

      if (result.canceled) return

      if (result.assets && result.assets.length > 0) {
        const asset = result.assets[0]
        setState((prev) => ({
          ...prev,
          selectedImageUri: asset.uri,
          selectedImageMimeType: asset.mimeType || 'image/jpeg',
          selectedImageSize: asset.fileSize || null,
          showPreview: true,
          previewError: null,
        }))
      }
    } catch {
      Alert.alert('Camera Error', 'Failed to open camera. Please try again.')
    }
  }, [requestCameraPermission])

  const launchGallery = useCallback(async () => {
    const hasPermission = await requestPhotoLibraryPermission()
    if (!hasPermission) return

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.8,
      })

      if (result.canceled) return

      if (result.assets && result.assets.length > 0) {
        const asset = result.assets[0]
        setState((prev) => ({
          ...prev,
          selectedImageUri: asset.uri,
          selectedImageMimeType: asset.mimeType || 'image/jpeg',
          selectedImageSize: asset.fileSize || null,
          showPreview: true,
          previewError: null,
        }))
      }
    } catch {
      Alert.alert('Gallery Error', 'Failed to open photo library. Please try again.')
    }
  }, [requestPhotoLibraryPermission])

  const resetState = useCallback(() => {
    setState({
      selectedImageUri: null,
      selectedImageMimeType: null,
      selectedImageSize: null,
      isPermissionPending: false,
      showPreview: false,
      previewError: null,
    })
  }, [])

  const handleUpload = useCallback(
    async (imageUri: string) => {
      const validation = await validatePhoto(
        imageUri,
        state.selectedImageMimeType,
        state.selectedImageSize
      )

      if (!validation.valid && validation.error) {
        const message = getPhotoErrorMessage(validation.error)
        setState((prev) => ({ ...prev, previewError: message }))
        throw new Error(message)
      }

      try {
        // Fetch image data from URI and convert to Blob
        const response = await fetch(imageUri)
        const blob = await response.blob()

        await uploadMutation.mutateAsync(blob)

        resetState()
      } catch (error: any) {
        const message = error.response?.data?.message || error.message || 'Upload failed'
        setState((prev) => ({ ...prev, previewError: message }))
        throw new Error(message)
      }
    },
    [state.selectedImageMimeType, state.selectedImageSize, uploadMutation, resetState]
  )

  const closePreview = useCallback(() => {
    setState((prev) => ({ ...prev, showPreview: false }))
  }, [])

  const retryImageSelection = useCallback(() => {
    setState((prev) => ({
      ...prev,
      selectedImageUri: null,
      selectedImageMimeType: null,
      selectedImageSize: null,
      showPreview: true,
      previewError: null,
    }))
  }, [])

  return {
    // State
    selectedImageUri: state.selectedImageUri,
    showPreview: state.showPreview,
    previewError: state.previewError,
    isLoading: state.isPermissionPending || uploadMutation.isPending,

    // Actions
    launchCamera,
    launchGallery,
    handleUpload,
    closePreview,
    retryImageSelection,
    resetState,

    // Mutation state
    isUploading: uploadMutation.isPending,
    uploadError: uploadMutation.error,
  }
}
