// Floor map configuration — single source of truth for all floor data
export const MAPS = {
  G:  { key: "G",  name: "Ground",      url: "/ground_floor.png",  w: 4642, h: 3924 },
  FA: { key: "FA", name: "1st Floor A", url: "/first_floor_a.png", w: 1742, h: 2442 },
  FB: { key: "FB", name: "1st Floor B", url: "/first_floor_b.png", w: 1111, h: 912  },
  S:  { key: "S",  name: "2nd Floor",   url: "/second_floor.png",  w: 681,  h: 852  },
}

// Node types that users can select and navigate to
export const SELECTABLE_TYPES = ["room", "lab", "washroom", "faculty", "stairs"]

// API base URL — change this for production
export const API_BASE = "https://smart-campus-navigator-qijx.onrender.com/api"
