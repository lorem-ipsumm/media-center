import { create } from "zustand";
import { persist } from "zustand/middleware";

interface AppStore {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  clearSearchQuery: () => void;
}

export const useAppStore = create<AppStore>()(
  persist(
    (set) => ({
      searchQuery: "",
      setSearchQuery: (query) => set({ searchQuery: query }),
      clearSearchQuery: () => set({ searchQuery: "" }),
    }),
    {
      name: "app-storage",
    },
  ),
);
