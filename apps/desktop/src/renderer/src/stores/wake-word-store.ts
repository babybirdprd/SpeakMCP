import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface WakeWordState {
    isEnabled: boolean
    keywords: string[]
    setEnabled: (enabled: boolean) => void
    setKeywords: (keywords: string[]) => void
    addKeyword: (keyword: string) => void
    removeKeyword: (keyword: string) => void
}

export const useWakeWordStore = create<WakeWordState>()(
    persist(
        (set) => ({
            isEnabled: false,
            keywords: ['Hey SpeakMCP'],
            setEnabled: (enabled) => set({ isEnabled: enabled }),
            setKeywords: (keywords) => set({ keywords }),
            addKeyword: (keyword) => set((state) => {
                if (!state.keywords.includes(keyword)) {
                    return { keywords: [...state.keywords, keyword] }
                }
                return state
            }),
            removeKeyword: (keyword) => set((state) => ({
                keywords: state.keywords.filter(k => k !== keyword)
            }))
        }),
        {
            name: 'wake-word-storage'
        }
    )
)
