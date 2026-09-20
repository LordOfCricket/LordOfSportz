import { create } from 'zustand'
import AsyncStorage from '@react-native-async-storage/async-storage'

const STORAGE_KEY = 'loc_selected_ground_id'

// UI-only state: which of the owner's grounds is currently in focus. It is
// never a security boundary — every backend request is still authorized
// against the URL's ground id server-side. Persisted so the choice survives
// an app restart; reconciled against the live grounds list by useActiveGround.
interface SelectedGroundStore {
  selectedGroundId: string | null
  hydrated: boolean
  hydrate: () => Promise<void>
  setSelectedGround: (publicGroundId: string | null) => void
}

export const useSelectedGroundStore = create<SelectedGroundStore>((set) => ({
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
  setSelectedGround: (publicGroundId) => {
    set({ selectedGroundId: publicGroundId })
    const write = publicGroundId
      ? AsyncStorage.setItem(STORAGE_KEY, publicGroundId)
      : AsyncStorage.removeItem(STORAGE_KEY)
    write.catch(() => {})
  },
}))
