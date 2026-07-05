import { create } from "zustand";

export interface LocationPayload {
  latitude: number;
  longitude: number;
  name: string;
  address: string;
}

interface LocationPickerState {
  open: boolean;
  /**
   * Optional callback fired when the user confirms a location. The composer
   * wires this up to "send a location message"; the picker doesn't know
   * anything about messaging.
   */
  onConfirm: ((loc: LocationPayload) => void) | null;
  openPicker: (onConfirm: (loc: LocationPayload) => void) => void;
  closePicker: () => void;
}

export const useLocationPicker = create<LocationPickerState>((set) => ({
  open: false,
  onConfirm: null,
  openPicker: (onConfirm) => set({ open: true, onConfirm }),
  closePicker: () => set({ open: false, onConfirm: null }),
}));
