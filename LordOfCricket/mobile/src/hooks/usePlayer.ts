import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as playerApi from '../services/playerApi'
import { Player, EditablePlayerFields } from '../types'
import { playerKeys } from './playerKeys'

/**
 * Fetch authenticated user's player profile
 * Returns player object with all profile fields
 * Refetches on window focus; cached for 5 minutes
 */
export function useMyPlayer(enabled = true) {
  return useQuery({
    queryKey: playerKeys.me(),
    queryFn: () => playerApi.fetchMyPlayer(),
    staleTime: 1000 * 60 * 5, // 5 minutes
    enabled,
  })
}

/**
 * Update authenticated user's player profile
 * Accepts partial EditablePlayerFields (only those fields are sent to backend)
 * Invalidates player profile and stats queries on success
 */
export function useUpdateMyPlayer() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (updates: EditablePlayerFields) => playerApi.updateMyPlayer(updates),
    onSuccess: (updatedPlayer: Player) => {
      // Update cache with new player data
      queryClient.setQueryData(playerKeys.me(), updatedPlayer)
      // Invalidate stats (might have changed based on profile updates)
      queryClient.invalidateQueries({ queryKey: playerKeys.stats() })
    },
    onError: (error: any) => {
      // Error is handled by caller for user feedback
      // Do not suppress error
    },
  })
}

/**
 * Upload player profile photo
 * Accepts Blob (Image, Photo, etc.)
 * Invalidates player profile on success
 */
export function useUploadPlayerPhoto() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (file: Blob) => playerApi.uploadPlayerPhoto(file),
    onSuccess: (updatedPlayer: Player) => {
      // Update cache with new player data (includes new photo_url)
      queryClient.setQueryData(playerKeys.me(), updatedPlayer)
    },
    onError: (error: any) => {
      // Error is handled by caller
    },
  })
}

/**
 * Fetch authenticated user's career statistics
 * Includes career stats, recent form, and paginated match history
 * Cached for 5 minutes
 */
export function useMyPlayerStats(limit: number = 10, offset: number = 0, enabled = true) {
  return useQuery({
    queryKey: playerKeys.statsWithPagination(limit, offset),
    queryFn: () => playerApi.getMyPlayerStats(limit, offset),
    staleTime: 1000 * 60 * 5, // 5 minutes
    enabled,
  })
}

/**
 * Fetch public player profile by publicPlayerId
 * No authentication required
 * Cached for 5 minutes
 */
export function usePublicPlayerProfile(publicPlayerId: string | null, enabled = true) {
  return useQuery({
    queryKey: publicPlayerId ? playerKeys.public(publicPlayerId) : [],
    queryFn: () => {
      if (!publicPlayerId) throw new Error('Player ID required')
      return playerApi.getPublicPlayerProfile(publicPlayerId)
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
    enabled: enabled && !!publicPlayerId,
  })
}

/**
 * Fetch public player statistics by publicPlayerId
 * No authentication required
 * Cached for 5 minutes
 */
export function usePublicPlayerStats(
  publicPlayerId: string | null,
  limit: number = 10,
  offset: number = 0,
  enabled = true
) {
  return useQuery({
    queryKey: publicPlayerId ? playerKeys.publicStatsWithPagination(publicPlayerId, limit, offset) : [],
    queryFn: () => {
      if (!publicPlayerId) throw new Error('Player ID required')
      return playerApi.getPublicPlayerStats(publicPlayerId, limit, offset)
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
    enabled: enabled && !!publicPlayerId,
  })
}

/**
 * Player directory/search (GET /players).
 * No authentication required. An empty `query` lists all players
 * (directory behavior); a non-empty one filters by the backend's own
 * case-insensitive name/publicPlayerId match — the caller is responsible
 * for debouncing `query` before passing it in, so this doesn't fire a
 * request per keystroke.
 */
export function usePlayerSearch(query: string, limit: number = 20, offset: number = 0) {
  return useQuery({
    queryKey: playerKeys.search(query, limit, offset),
    queryFn: () => playerApi.searchPlayers(query, limit, offset),
    staleTime: 1000 * 60, // 1 minute
  })
}
