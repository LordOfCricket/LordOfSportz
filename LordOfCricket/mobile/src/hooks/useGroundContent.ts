import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as groundOwnerApi from '../services/groundOwnerApi'
import type { PricingSlotInput } from '../services/groundOwnerApi'
import type { GroundAmenity } from '../services/groundApi'
import { useAuthStore } from '../store/authStore'
import { groundOwnerKeys } from './useMyGrounds'
import { EditableGroundLocation, EditableGroundProfile } from '../types'

// Every hook here is scoped to one ground via its publicGroundId; queries
// stay disabled until an id is resolved by useActiveGround. Backend
// ownership authorization is unchanged — the id only selects which ground.

function useGroundProfileInvalidation() {
  const queryClient = useQueryClient()
  const userId = useAuthStore((s) => s.user?.id) ?? 'anon'
  return (publicGroundId: string) => {
    // The public ground-detail query is the read source for Profile,
    // Location, Amenities and Pricing screens.
    queryClient.invalidateQueries({ queryKey: ['grounds', publicGroundId] })
    queryClient.invalidateQueries({ queryKey: groundOwnerKeys.grounds(userId) })
    queryClient.invalidateQueries({ queryKey: groundOwnerKeys.dashboard(userId, publicGroundId) })
  }
}

export function useUpdateGroundProfile(publicGroundId: string) {
  const invalidateProfile = useGroundProfileInvalidation()
  return useMutation({
    mutationFn: (updates: EditableGroundProfile | EditableGroundLocation) =>
      groundOwnerApi.updateGroundProfile(publicGroundId, updates),
    onSuccess: () => invalidateProfile(publicGroundId),
  })
}

// --- Media ---------------------------------------------------------------

export function useGroundMedia(publicGroundId: string | undefined) {
  return useQuery({
    queryKey: groundOwnerKeys.media(publicGroundId ?? 'none'),
    queryFn: () => groundOwnerApi.fetchGroundMedia(publicGroundId as string),
    enabled: Boolean(publicGroundId),
    staleTime: 1000 * 60,
  })
}

function useMediaMutation<TArgs>(
  publicGroundId: string,
  mutationFn: (args: TArgs) => Promise<unknown>,
) {
  const queryClient = useQueryClient()
  const invalidateProfile = useGroundProfileInvalidation()
  return useMutation({
    mutationFn,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: groundOwnerKeys.media(publicGroundId) })
      queryClient.invalidateQueries({ queryKey: ['grounds', publicGroundId] })
      invalidateProfile(publicGroundId)
    },
  })
}

export function useUploadGroundMedia(publicGroundId: string) {
  return useMediaMutation(publicGroundId, (file: Blob) =>
    groundOwnerApi.uploadGroundMedia(publicGroundId, file),
  )
}

export function useSetGroundHeroPhoto(publicGroundId: string) {
  return useMediaMutation(publicGroundId, (photoId: number) =>
    groundOwnerApi.setGroundHeroPhoto(publicGroundId, photoId),
  )
}

export function useDeleteGroundMedia(publicGroundId: string) {
  return useMediaMutation(publicGroundId, (photoId: number) =>
    groundOwnerApi.deleteGroundMedia(publicGroundId, photoId),
  )
}

// --- Amenities ---------------------------------------------------------

export function useGroundAmenities(publicGroundId: string | undefined) {
  return useQuery({
    queryKey: groundOwnerKeys.amenities(publicGroundId ?? 'none'),
    queryFn: () => groundOwnerApi.fetchGroundAmenities(publicGroundId as string),
    enabled: Boolean(publicGroundId),
    staleTime: 1000 * 60,
  })
}

export function useAmenityCatalog(enabled = true) {
  return useQuery({
    queryKey: groundOwnerKeys.amenityCatalog(),
    queryFn: groundOwnerApi.fetchAmenityCatalog,
    enabled,
    staleTime: 1000 * 60 * 30,
  })
}

function useAmenityMutation(
  publicGroundId: string,
  mutationFn: (amenityKey: string) => Promise<GroundAmenity[]>,
) {
  const queryClient = useQueryClient()
  const invalidateProfile = useGroundProfileInvalidation()
  return useMutation({
    mutationFn,
    onSuccess: (amenities) => {
      queryClient.setQueryData(groundOwnerKeys.amenities(publicGroundId), amenities)
      queryClient.invalidateQueries({ queryKey: ['grounds', publicGroundId] })
      invalidateProfile(publicGroundId)
    },
  })
}

export function useAddGroundAmenity(publicGroundId: string) {
  return useAmenityMutation(publicGroundId, (amenityKey) =>
    groundOwnerApi.addGroundAmenity(publicGroundId, amenityKey),
  )
}

export function useRemoveGroundAmenity(publicGroundId: string) {
  return useAmenityMutation(publicGroundId, (amenityKey) =>
    groundOwnerApi.removeGroundAmenity(publicGroundId, amenityKey),
  )
}

// --- Pricing slots ---------------------------------------------------

export function useGroundPricingSlots(publicGroundId: string | undefined) {
  return useQuery({
    queryKey: groundOwnerKeys.pricing(publicGroundId ?? 'none'),
    queryFn: () => groundOwnerApi.fetchGroundPricingSlots(publicGroundId as string),
    enabled: Boolean(publicGroundId),
    staleTime: 1000 * 60,
  })
}

function usePricingMutation<TArgs>(
  publicGroundId: string,
  mutationFn: (args: TArgs) => Promise<unknown>,
) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: groundOwnerKeys.pricing(publicGroundId) })
      queryClient.invalidateQueries({ queryKey: ['grounds', publicGroundId] })
    },
  })
}

export function useCreateGroundPricingSlot(publicGroundId: string) {
  return usePricingMutation(publicGroundId, (input: PricingSlotInput) =>
    groundOwnerApi.createGroundPricingSlot(publicGroundId, input),
  )
}

export function useUpdateGroundPricingSlot(publicGroundId: string) {
  return usePricingMutation(
    publicGroundId,
    (args: { slotId: number; input: Partial<PricingSlotInput> & { isActive?: boolean } }) =>
      groundOwnerApi.updateGroundPricingSlot(publicGroundId, args.slotId, args.input),
  )
}

export function useDeleteGroundPricingSlot(publicGroundId: string) {
  return usePricingMutation(publicGroundId, (slotId: number) =>
    groundOwnerApi.deleteGroundPricingSlot(publicGroundId, slotId),
  )
}
