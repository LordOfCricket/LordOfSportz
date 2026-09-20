import { create } from 'zustand'
import AsyncStorage from '@react-native-async-storage/async-storage'

// Separate from the Owner canteen scope and from the staff ground store.
const STORAGE_KEY = 'loc_staff_selected_canteen_id'

// UI-only state: which canteen on the active staff ground is in focus.
// Reconciled against the active ground's canteens[] by useStaffCanteenScope
// (falls back to the first canteen when the stored id no longer belongs to
// the current ground). Never a security boundary.
export const useStaffCanteenStore = create((set) => ({
  selectedCanteenId: null,
  hydrated: false,
  hydrate: async () => {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY)
      set({ selectedCanteenId: stored, hydrated: true })
    } catch {
      set({ hydrated: true })
    }
  },
  setSelectedStaffCanteen: (publicCanteenId) => {
    set({ selectedCanteenId: publicCanteenId })
    const write = publicCanteenId
      ? AsyncStorage.setItem(STORAGE_KEY, publicCanteenId)
      : AsyncStorage.removeItem(STORAGE_KEY)
    write.catch(() => {})
  },
}))
