import { create } from 'zustand'
import type { QueryClient } from '@tanstack/react-query'
import * as authApi from '../services/authApi'
import * as playerApi from '../services/playerApi'
import * as umpireApi from '../services/umpireApi'
import * as groundOwnerApi from '../services/groundOwnerApi'
import { fetchMyStaffMemberships } from '../services/staffApi'
import api from '../services/api'
import { useSelectedGroundStore } from './selectedGroundStore'
import { useStaffGroundStore } from './staffGroundStore'
import { useStaffCanteenStore } from './staffCanteenStore'
import { User, Player, MfaStatus, UmpireApproval } from '../types'

const DEFAULT_MFA: MfaStatus = { enrolled: false, required: false, verified: false }

function isUmpireAccount(user: User | null): boolean {
  return user?.role === 'player' && user?.player_type === 'umpire'
}

// Resolved before `status` flips to 'authenticated' so the root router
// never renders a Player screen for an Umpire (or vice-versa).
async function resolveUmpireApproval(user: User | null): Promise<UmpireApproval> {
  if (!isUmpireAccount(user)) return null
  try {
    const request = await umpireApi.getMyUmpireRequest()
    return request?.status ?? 'none'
  } catch {
    return 'unknown'
  }
}

// GROUND_OWNER is a `ground_users` membership, not a `users.role` — the only
// reliable client check is "does this account own at least one ground."
// Resolved before `status` flips to 'authenticated' so the root router picks
// the right experience on the first render. Skipped for Umpire accounts
// (Umpire routing wins) to avoid an extra request they never need.
async function resolveGroundOwnership(user: User | null): Promise<boolean> {
  if (!user || isUmpireAccount(user)) return false
  try {
    const grounds = await groundOwnerApi.fetchMyGrounds()
    return grounds.length > 0
  } catch {
    return false
  }
}

// SUPER_ADMIN is users.role 'staff' plus a resolved staff_roles.name of
// 'super_admin' — both already on the /auth/me user object, so no extra
// request.
function resolveSuperAdmin(user: User | null): boolean {
  return user?.role === 'staff' && user?.staff_role === 'super_admin'
}

// GROUND_ADMIN / CANTEEN_STAFF is a `ground_users` membership, not a
// `users.role` — resolved the same way as ground ownership. A disabled
// membership is already filtered server-side, so an empty list means "no
// active staff access." Skipped for Umpires (they outrank Staff in routing).
async function resolveStaffRole(user: User | null): Promise<boolean> {
  if (!user || isUmpireAccount(user)) return false
  try {
    const memberships = await fetchMyStaffMemberships()
    return memberships.length > 0
  } catch {
    return false
  }
}

// Shared by verifyOtp / loginWithPassword: resolve everything the root
// router needs, THEN flip status to 'authenticated' in one set() so the
// first authenticated render is already the right experience.
async function applyAuthenticatedUser(
  set: (partial: Partial<AuthStore>) => void,
  user: User,
): Promise<void> {
  const umpire = isUmpireAccount(user)
  const [umpireApproval, isGroundOwner, isStaff] = await Promise.all([
    resolveUmpireApproval(user),
    resolveGroundOwnership(user),
    resolveStaffRole(user),
  ])
  let player: Player | null = null
  if (user?.role === 'player' && !umpire) {
    try {
      player = await playerApi.fetchMyPlayer()
    } catch {
      // Player profile not found yet - not an error
    }
  }
  set({ user, player, isUmpire: umpire, umpireApproval, isGroundOwner, isStaff, isSuperAdmin: resolveSuperAdmin(user), status: 'authenticated' })
}

let queryClientInstance: QueryClient | null = null

export function initializeAuthStore(queryClient: QueryClient) {
  queryClientInstance = queryClient
}

interface AuthStore {
  user: User | null
  player: Player | null
  mfa: MfaStatus
  status: 'loading' | 'authenticated' | 'unauthenticated'
  error: string | null

  // Umpire routing. `isUmpire` = role player + player_type umpire.
  // `umpireApproval` is null for non-umpire accounts, otherwise the latest
  // umpire request status resolved during auth ('none'/'unknown' handled).
  isUmpire: boolean
  umpireApproval: UmpireApproval
  refreshUmpireApproval: () => Promise<UmpireApproval>

  // Ground Owner routing. True when the account owns at least one ground
  // (resolved during auth). UI/navigation only — backend authorization is
  // still the security boundary on every /ground-owner route.
  isGroundOwner: boolean

  // Staff routing. True when the account holds at least one active
  // GROUND_ADMIN / CANTEEN_STAFF membership. Outranked by Umpire and Owner.
  isStaff: boolean

  // Super Admin routing. users.role 'staff' + staff_role 'super_admin',
  // read straight from the /auth/me user object. Wins over every other
  // role at the root. Backend authorization is still the boundary on every
  // /admin route.
  isSuperAdmin: boolean

  // Auth actions
  initialize: () => Promise<void>
  requestOtp: (identifier: string) => Promise<void>
  verifyOtp: (identifier: string, code: string) => Promise<User>
  loginWithPassword: (identifier: string, password: string) => Promise<User>
  logout: () => Promise<void>
  forgotPassword: (identifier: string) => Promise<void>
  resetPassword: (identifier: string, code: string, newPassword: string, confirmPassword: string) => Promise<void>
  changePassword: (currentPassword: string, newPassword: string, confirmPassword: string) => Promise<void>

  // Player actions
  refreshPlayer: () => Promise<Player | null>
  selectRole: (role: 'player' | 'staff') => Promise<User>
  selectPlayerType: (playerType: 'team_player' | 'umpire') => Promise<User>
  updatePlayer: (fields: Partial<Player>) => Promise<Player>

  // MFA actions
  refreshMfaStatus: () => Promise<MfaStatus>

  // State management
  setUser: (user: User | null) => void
  setError: (error: string | null) => void
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  user: null,
  player: null,
  mfa: DEFAULT_MFA,
  status: 'loading',
  error: null,
  isUmpire: false,
  umpireApproval: null,
  isGroundOwner: false,
  isStaff: false,
  isSuperAdmin: false,

  refreshUmpireApproval: async () => {
    const approval = await resolveUmpireApproval(get().user)
    set({ umpireApproval: approval })
    return approval
  },

  initialize: async () => {
    try {
      const { user: fetchedUser, mfa: fetchedMfa } = await authApi.fetchMe()
      const umpire = isUmpireAccount(fetchedUser)

      // Resolve umpire approval / ground ownership BEFORE authenticating so
      // the first rendered screen is the correct one for this account type.
      const [umpireApproval, isGroundOwner, isStaff] = await Promise.all([
        resolveUmpireApproval(fetchedUser),
        resolveGroundOwnership(fetchedUser),
        resolveStaffRole(fetchedUser),
      ])
      let fetchedPlayer: Player | null = null
      if (fetchedUser?.role === 'player' && !umpire) {
        try {
          fetchedPlayer = await playerApi.fetchMyPlayer()
        } catch {
          // Player profile not found yet - not an error
        }
      }

      set({
        user: fetchedUser,
        player: fetchedPlayer,
        mfa: fetchedMfa || DEFAULT_MFA,
        isUmpire: umpire,
        umpireApproval,
        isGroundOwner,
        isStaff,
        isSuperAdmin: resolveSuperAdmin(fetchedUser),
        status: 'authenticated',
      })
    } catch {
      set({ status: 'unauthenticated', user: null, player: null, isUmpire: false, umpireApproval: null, isGroundOwner: false, isStaff: false, isSuperAdmin: false })
    }
  },

  requestOtp: async (identifier: string) => {
    try {
      set({ error: null })
      await authApi.sendOtp(identifier)
    } catch (error) {
      set({ error: 'Failed to send OTP' })
      throw error
    }
  },

  verifyOtp: async (identifier: string, code: string) => {
    try {
      set({ error: null })
      const verifiedUser = await authApi.verifyOtp(identifier, code)
      await applyAuthenticatedUser(set, verifiedUser)
      await get().refreshMfaStatus()
      return verifiedUser
    } catch (error) {
      set({ error: 'Failed to verify OTP' })
      throw error
    }
  },

  loginWithPassword: async (identifier: string, password: string) => {
    try {
      set({ error: null })
      const loggedInUser = await authApi.loginWithPassword(identifier, password)
      await applyAuthenticatedUser(set, loggedInUser)
      await get().refreshMfaStatus()
      return loggedInUser
    } catch (error) {
      set({ error: 'Failed to login' })
      throw error
    }
  },

  logout: async () => {
    try {
      await authApi.logout()
    } catch {
      // Logout anyway even if API call fails
    }
    await api.clearSession()

    // Clear all TanStack Query cache to prevent private data leakage to next user
    if (queryClientInstance) {
      queryClientInstance.clear()
    }

    // Drop the persisted ground selection so the next account never starts on
    // a previous owner's ground (useActiveGround also reconciles this, but
    // clearing removes the stale AsyncStorage key too).
    useSelectedGroundStore.getState().setSelectedGround(null)
    useStaffGroundStore.getState().setSelectedStaffGround(null)
    useStaffCanteenStore.getState().setSelectedStaffCanteen(null)

    set({
      user: null,
      player: null,
      mfa: DEFAULT_MFA,
      isUmpire: false,
      umpireApproval: null,
      isGroundOwner: false,
      isStaff: false,
      isSuperAdmin: false,
      status: 'unauthenticated',
      error: null,
    })
  },

  forgotPassword: async (identifier: string) => {
    try {
      set({ error: null })
      await authApi.forgotPassword(identifier)
    } catch (error) {
      set({ error: 'Failed to initiate password reset' })
      throw error
    }
  },

  resetPassword: async (identifier: string, code: string, newPassword: string, confirmPassword: string) => {
    try {
      set({ error: null })
      await authApi.resetPassword(identifier, code, newPassword, confirmPassword)
    } catch (error) {
      set({ error: 'Failed to reset password' })
      throw error
    }
  },

  changePassword: async (currentPassword: string, newPassword: string, confirmPassword: string) => {
    try {
      set({ error: null })
      const result = await authApi.changePassword(currentPassword, newPassword, confirmPassword)
      set((state) => ({
        user: state.user ? { ...state.user, force_password_change: false } : state.user,
      }))
      return result
    } catch (error) {
      set({ error: 'Failed to change password' })
      throw error
    }
  },

  refreshPlayer: async () => {
    try {
      const fetchedPlayer = await playerApi.fetchMyPlayer()
      set({ player: fetchedPlayer })
      return fetchedPlayer
    } catch {
      return null
    }
  },

  selectRole: async (role: 'player' | 'staff') => {
    try {
      set({ error: null })
      const updatedUser = await authApi.selectRole(role)
      set({ user: updatedUser })
      return updatedUser
    } catch (error) {
      set({ error: 'Failed to select role' })
      throw error
    }
  },

  selectPlayerType: async (playerType: 'team_player' | 'umpire') => {
    try {
      set({ error: null })
      const updatedUser = await authApi.selectPlayerType(playerType)
      set({ user: updatedUser })
      return updatedUser
    } catch (error) {
      set({ error: 'Failed to select player type' })
      throw error
    }
  },

  updatePlayer: async (fields: Partial<Player>) => {
    try {
      set({ error: null })
      const updatedPlayer = await playerApi.updateMyPlayer(fields)
      set({ player: updatedPlayer })
      return updatedPlayer
    } catch (error) {
      set({ error: 'Failed to update player profile' })
      throw error
    }
  },

  refreshMfaStatus: async () => {
    try {
      const { mfa: fetchedMfa } = await authApi.fetchMe()
      set({ mfa: fetchedMfa || DEFAULT_MFA })
      return fetchedMfa || DEFAULT_MFA
    } catch {
      return DEFAULT_MFA
    }
  },

  setUser: (user: User | null) => set({ user }),
  setError: (error: string | null) => set({ error }),
}))
