import { create } from 'zustand'
import AsyncStorage from '@react-native-async-storage/async-storage'

// Separate key from the Ground Owner selection store so a user who is both
// an owner and staff can never have the two scopes collide.
const STORAGE_KEY = 'loc_staff_selected_ground_id'

// UI-only state: which of the staff member's ground memberships is in focus.
// Never a security boundary — every request is still authorized server-side
// against the ground id in the URL. Reconciled against the live membership
// list by useActiveStaffGround.
export const useStaffGroundStore = create((set) => ({
  selectedGroundId: null,
  hydrated: false,
  hydrate: async () => {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY)
      set({ selectedGroundId: stored, hydrated: true })
    } catch {
      set({ hydrated: true })
    }
  },
  setSelectedStaffGround: (publicGroundId) => {
    set({ selectedGroundId: publicGroundId })
    const write = publicGroundId
      ? AsyncStorage.setItem(STORAGE_KEY, publicGroundId)
      : AsyncStorage.removeItem(STORAGE_KEY)
    write.catch(() => {})
  },
}))
