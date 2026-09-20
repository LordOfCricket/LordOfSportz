import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '../store/authStore'
import {
  getPlayerFollowState,
  followPlayer,
  unfollowPlayer,
  getTeamFollowState,
  followTeam,
  unfollowTeam,
  getGroundFollowState,
  followGround,
  unfollowGround,
  getFollowing,
  FollowState,
  FollowingResponse,
} from '../services/followApi'

export const followKeys = {
  all: ['follow'] as const,
  player: (publicPlayerId: string) => [...followKeys.all, 'player', publicPlayerId] as const,
  team: (teamId: number) => [...followKeys.all, 'team', teamId] as const,
  ground: (publicGroundId: string) => [...followKeys.all, 'ground', publicGroundId] as const,
  following: () => [...followKeys.all, 'following'] as const,
}

function useIsAuthed() {
  return !!useAuthStore((s) => s.user)
}

/**
 * Follow state + toggle for one player. Only queries when authenticated (a
 * follow is authenticated-only). The mutation is optimistic and reverts on
 * error; `following` is otherwise whatever the server returns.
 */
export function usePlayerFollow(publicPlayerId: string | null) {
  const authed = useIsAuthed()
  const qc = useQueryClient()
  const enabled = authed && !!publicPlayerId

  const query = useQuery<FollowState>({
    queryKey: publicPlayerId ? followKeys.player(publicPlayerId) : [],
    queryFn: () => getPlayerFollowState(publicPlayerId as string),
    enabled,
    staleTime: 1000 * 60,
  })

  const mutation = useMutation({
    mutationFn: (next: boolean) =>
      next ? followPlayer(publicPlayerId as string) : unfollowPlayer(publicPlayerId as string),
    onMutate: async (next) => {
      if (!publicPlayerId) return
      await qc.cancelQueries({ queryKey: followKeys.player(publicPlayerId) })
      const prev = qc.getQueryData<FollowState>(followKeys.player(publicPlayerId))
      qc.setQueryData(followKeys.player(publicPlayerId), { following: next })
      return { prev }
    },
    onError: (_e, _next, ctx) => {
      if (publicPlayerId && ctx?.prev) qc.setQueryData(followKeys.player(publicPlayerId), ctx.prev)
    },
    onSuccess: (data) => {
      if (publicPlayerId) qc.setQueryData(followKeys.player(publicPlayerId), data)
      qc.invalidateQueries({ queryKey: followKeys.following() })
    },
  })

  return {
    available: enabled,
    following: query.data?.following ?? null,
    loading: query.isPending && enabled,
    pending: mutation.isPending,
    toggle: () => {
      if (!enabled || mutation.isPending) return
      mutation.mutate(!(query.data?.following ?? false))
    },
  }
}

export function useTeamFollow(teamId: number | null) {
  const authed = useIsAuthed()
  const qc = useQueryClient()
  const enabled = authed && teamId != null

  const query = useQuery<FollowState>({
    queryKey: teamId != null ? followKeys.team(teamId) : [],
    queryFn: () => getTeamFollowState(teamId as number),
    enabled,
    staleTime: 1000 * 60,
  })

  const mutation = useMutation({
    mutationFn: (next: boolean) => (next ? followTeam(teamId as number) : unfollowTeam(teamId as number)),
    onMutate: async (next) => {
      if (teamId == null) return
      await qc.cancelQueries({ queryKey: followKeys.team(teamId) })
      const prev = qc.getQueryData<FollowState>(followKeys.team(teamId))
      qc.setQueryData(followKeys.team(teamId), { following: next })
      return { prev }
    },
    onError: (_e, _next, ctx) => {
      if (teamId != null && ctx?.prev) qc.setQueryData(followKeys.team(teamId), ctx.prev)
    },
    onSuccess: (data) => {
      if (teamId != null) qc.setQueryData(followKeys.team(teamId), data)
      qc.invalidateQueries({ queryKey: followKeys.following() })
    },
  })

  return {
    available: enabled,
    following: query.data?.following ?? null,
    loading: query.isPending && enabled,
    pending: mutation.isPending,
    toggle: () => {
      if (!enabled || mutation.isPending) return
      mutation.mutate(!(query.data?.following ?? false))
    },
  }
}

export function useGroundFollow(publicGroundId: string | null) {
  const authed = useIsAuthed()
  const qc = useQueryClient()
  const enabled = authed && !!publicGroundId

  const query = useQuery<FollowState>({
    queryKey: publicGroundId ? followKeys.ground(publicGroundId) : [],
    queryFn: () => getGroundFollowState(publicGroundId as string),
    enabled,
    staleTime: 1000 * 60,
  })

  const mutation = useMutation({
    mutationFn: (next: boolean) =>
      next ? followGround(publicGroundId as string) : unfollowGround(publicGroundId as string),
    onMutate: async (next) => {
      if (!publicGroundId) return
      await qc.cancelQueries({ queryKey: followKeys.ground(publicGroundId) })
      const prev = qc.getQueryData<FollowState>(followKeys.ground(publicGroundId))
      qc.setQueryData(followKeys.ground(publicGroundId), { following: next })
      return { prev }
    },
    onError: (_e, _next, ctx) => {
      if (publicGroundId && ctx?.prev) qc.setQueryData(followKeys.ground(publicGroundId), ctx.prev)
    },
    onSuccess: (data) => {
      if (publicGroundId) qc.setQueryData(followKeys.ground(publicGroundId), data)
      qc.invalidateQueries({ queryKey: followKeys.following() })
    },
  })

  return {
    available: enabled,
    following: query.data?.following ?? null,
    loading: query.isPending && enabled,
    pending: mutation.isPending,
    toggle: () => {
      if (!enabled || mutation.isPending) return
      mutation.mutate(!(query.data?.following ?? false))
    },
  }
}

/** The authenticated user's Following quick-access list. */
export function useFollowing(enabled = true) {
  const authed = useIsAuthed()
  return useQuery<FollowingResponse>({
    queryKey: followKeys.following(),
    queryFn: getFollowing,
    enabled: enabled && authed,
    staleTime: 1000 * 30,
  })
}
