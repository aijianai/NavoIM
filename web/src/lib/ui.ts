import { create } from "zustand";
import type { ID } from "@navo/shared";

export type MainView = "chat" | "friends" | "profile" | "notifications" | "createChannel" | "explore";

export type Overlay =
  | { kind: "none" }
  | { kind: "channelManage"; channelId: ID }
  | { kind: "userCard"; userId: ID; anchor?: { x: number; y: number }; }
  | { kind: "exploreChannelInfo"; channelId: ID };

interface UIState {
  mainView: MainView;
  overlay: Overlay;
  setMainView: (view: MainView) => void;
  openFriends: () => void;
  openProfile: () => void;
  openNotifications: () => void;
  openCreateChannel: () => void;
  openExplore: () => void;
  openChannelManage: (channelId: ID) => void;
  openUserCard: (userId: ID, anchor?: { x: number; y: number }) => void;
  openExploreChannelInfo: (channelId: ID) => void;
  close: () => void;
}

export const useUI = create<UIState>((set) => ({
  mainView: "chat",
  overlay: { kind: "none" },
  setMainView: (view) => set({ mainView: view }),
  openFriends: () => set({ mainView: "friends", overlay: { kind: "none" } }),
  openProfile: () => set({ mainView: "profile", overlay: { kind: "none" } }),
  openNotifications: () => set({ mainView: "notifications", overlay: { kind: "none" } }),
  openCreateChannel: () => set({ mainView: "createChannel", overlay: { kind: "none" } }),
  openExplore: () => set({ mainView: "explore", overlay: { kind: "none" } }),
  openChannelManage: (channelId) => set({ overlay: { kind: "channelManage", channelId } }),
  openUserCard: (userId, anchor) => set({ overlay: { kind: "userCard", userId, anchor } }),
  openExploreChannelInfo: (channelId) => set({ overlay: { kind: "exploreChannelInfo", channelId } }),
  close: () => set({ overlay: { kind: "none" } }),
}));
