import { create } from 'zustand'
import type { Concept } from '@/types/concept'

interface SerendipityBanner {
  sourceName: string
  targetName: string
  sourceId: string
  targetId: string
  reason: string
}

interface UIState {
  selectedConceptId: string | null
  modalConcept: Concept | null
  searchQuery: string
  serendipityBanner: SerendipityBanner | null

  selectConcept: (id: string | null) => void
  openModal: (concept: Concept) => void
  closeModal: () => void
  setSearchQuery: (q: string) => void
  showSerendipity: (banner: SerendipityBanner) => void
  dismissSerendipity: () => void
}

export const useUIStore = create<UIState>((set) => ({
  selectedConceptId: null,
  modalConcept: null,
  searchQuery: '',
  serendipityBanner: null,

  selectConcept: (id) => set({ selectedConceptId: id }),
  openModal: (concept) => set({ modalConcept: concept }),
  closeModal: () => set({ modalConcept: null }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  showSerendipity: (banner) => set({ serendipityBanner: banner }),
  dismissSerendipity: () => set({ serendipityBanner: null }),
}))
