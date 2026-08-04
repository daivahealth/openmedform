import { create } from 'zustand';

interface SidebarState {
  collapsed: boolean;
  toggle: () => void;
  /** Direct setter for screens that manage the sidebar (e.g. preview's focus mode). */
  setCollapsed: (collapsed: boolean) => void;
}

export const useSidebarStore = create<SidebarState>((set) => ({
  collapsed: false,
  toggle: () => set((s) => ({ collapsed: !s.collapsed })),
  setCollapsed: (collapsed) => set({ collapsed }),
}));
