import { create } from 'zustand'
import type { Concept } from '@/types/concept'

interface SerendipityBanner {
  sourceTitle: string
  targetTitle: string
  sourceSlug: string
  targetSlug: string
  reason: string
}

interface UIState {
  selectedConceptSlug: string | null
  modalConcept: Concept | null
  searchQuery: string
  serendipityBanner: SerendipityBanner | null

  selectConcept: (slug: string | null) => void
  openModal: (concept: Concept) => void
  closeModal: () => void
  setSearchQuery: (q: string) => void
  showSerendipity: (banner: SerendipityBanner) => void
  dismissSerendipity: () => void
}

export const useUIStore = create<UIState>((set) => ({
  selectedConceptSlug: null,
  modalConcept: null,
  searchQuery: '',
  serendipityBanner: null,

  selectConcept: (slug) => set({ selectedConceptSlug: slug }),
  openModal: (concept) => set({ modalConcept: concept }),
  closeModal: () => set({ modalConcept: null }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  showSerendipity: (banner) => set({ serendipityBanner: banner }),
  dismissSerendipity: () => set({ serendipityBanner: null }),
}))
