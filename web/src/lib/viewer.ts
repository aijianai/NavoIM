import { create } from "zustand";

export interface ViewerImage {
  url: string;
  name: string;
}

export interface ViewerVideo {
  url: string;
  name: string;
  mimeType?: string;
}

export interface ViewerLocation {
  latitude: number;
  longitude: number;
  name?: string;
  address?: string;
}

interface ViewerState {
  images: ViewerImage[];
  index: number;
  open: boolean;
  videos: ViewerVideo[];
  videoIndex: number;
  videoOpen: boolean;
  location: ViewerLocation | null;
  locationOpen: boolean;
  show: (images: ViewerImage[], index?: number) => void;
  showVideo: (videos: ViewerVideo[], index?: number) => void;
  showLocation: (loc: ViewerLocation) => void;
  close: () => void;
  closeVideo: () => void;
  closeLocation: () => void;
  next: () => void;
  prev: () => void;
  nextVideo: () => void;
  prevVideo: () => void;
}

export const useViewer = create<ViewerState>((set, get) => ({
  images: [],
  index: 0,
  open: false,
  videos: [],
  videoIndex: 0,
  videoOpen: false,
  location: null,
  locationOpen: false,
  show(images, index = 0) {
    if (images.length === 0) return;
    set({ images, index, open: true });
  },
  showVideo(videos, index = 0) {
    if (videos.length === 0) return;
    set({ videos, videoIndex: index, videoOpen: true });
  },
  showLocation(loc) {
    set({ location: loc, locationOpen: true });
  },
  close() {
    set({ open: false });
  },
  closeVideo() {
    set({ videoOpen: false });
  },
  closeLocation() {
    set({ locationOpen: false });
  },
  next() {
    const { images, index } = get();
    set({ index: (index + 1) % images.length });
  },
  prev() {
    const { images, index } = get();
    set({ index: (index - 1 + images.length) % images.length });
  },
  nextVideo() {
    const { videos, videoIndex } = get();
    set({ videoIndex: (videoIndex + 1) % videos.length });
  },
  prevVideo() {
    const { videos, videoIndex } = get();
    set({ videoIndex: (videoIndex - 1 + videos.length) % videos.length });
  },
}));
