// Centralized icon definitions for easy maintenance and consistency

/**
 * Generate SVG markup for a map pin/marker icon
 * @param {string} color - Hex color for the pin
 * @param {number} width - Icon width in pixels
 * @param {number} height - Icon height in pixels
 * @returns {string} SVG markup
 */
export function getMapPinIcon(color, width = 32, height = 32) {
  return `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${width}" height="${height}">
    <path fill="${color}" stroke="white" stroke-width="1.5"
      d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
    <circle cx="12" cy="9" r="2.5" fill="white"/>
  </svg>`;
}

/**
 * SVG icon for point geometry type
 */
export const ICON_POINT = `
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="6" />
  </svg>`;

/**
 * SVG icon for line geometry type
 */
export const ICON_LINE = `
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M3 17 L9 7 L15 17 L21 7" />
  </svg>`;

/**
 * SVG icon for polygon geometry type
 */
export const ICON_POLYGON = `
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <rect x="4" y="4" width="16" height="16" rx="2" />
  </svg>`;

/**
 * SVG icon for close/cancel button
 */
export const ICON_CLOSE = `
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M18 6L6 18M6 6l12 12" />
  </svg>`;

/**
 * SVG icon for chevron down (collapse/expand)
 */
export const ICON_CHEVRON_DOWN = `
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M19 9l-7 7-7-7" />
  </svg>`;

/**
 * SVG icon for chevron right (collapse/expand)
 */
export const ICON_CHEVRON_RIGHT = `
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M9 5l7 7-7 7" />
  </svg>`;

/**
 * SVG icons for common actions and states
 * NOTE: CLOSE, SETTINGS, INFO reuse the standalone ICON_ constants (single source of truth)
 */
export const EMOJI_ICONS = {
  WARNING: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><circle cx="12" cy="17" r="0.5" fill="currentColor"/></svg>`,
  SEARCH: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`,
  get CLOSE() { return ICON_CLOSE; },
  get SETTINGS() { return ICON_SETTINGS; },
  get INFO() { return ICON_INFO; },
  CHECK: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
  CROSS: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
  TRASH: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>`,
};

/** Info icon */
export const ICON_INFO = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><circle cx="12" cy="8" r="0.5" fill="currentColor"/></svg>`;

/** Settings/cog icon */
export const ICON_SETTINGS = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/></svg>`;

/** Raster/image layer icon (grid of pixels) */
export const ICON_RASTER = `
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2"/>
    <path d="M3 9h18M3 15h18M9 3v18M15 3v18"/>
  </svg>`;

/**
 * Get appropriate SVG icon markup for a geometry type
 * @param {string} geometryType - 'point', 'line', 'polygon', 'raster', or 'unknown'
 * @returns {string} SVG markup string
 */
export function getGeometryIcon(geometryType) {
  switch (geometryType) {
    case 'Point':
      return ICON_POINT;
    case 'line':
      return ICON_LINE;
    case 'raster':
      return ICON_RASTER;
    case 'polygon':
    case 'unknown':
    default:
      return ICON_POLYGON;
  }
}

// ============================================================
// 3D Viewer SVG Icons
// ============================================================

/** 3D Model (cube) */
export const ICON_3D_MODEL = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>`;

/** Point cloud (scatter dots) */
export const ICON_POINT_CLOUD = `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><circle cx="4" cy="8" r="1.5"/><circle cx="10" cy="4" r="1.5"/><circle cx="16" cy="6" r="1.5"/><circle cx="7" cy="14" r="1.5"/><circle cx="13" cy="11" r="1.5"/><circle cx="19" cy="13" r="1.5"/><circle cx="5" cy="20" r="1.5"/><circle cx="11" cy="18" r="1.5"/><circle cx="17" cy="20" r="1.5"/></svg>`;

/** Camera */
export const ICON_CAMERA = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>`;

/** Grid */
export const ICON_GRID = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M3 3v18h18"/><path d="M3 9h18"/><path d="M3 15h18"/><path d="M9 3v18"/><path d="M15 3v18"/></svg>`;
export const ICON_AXES = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><line x1="12" y1="12" x2="22" y2="12" stroke="#f55"/><line x1="12" y1="12" x2="12" y2="2" stroke="#5c5"/><line x1="12" y1="12" x2="5" y2="19" stroke="#55f"/><circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none"/></svg>`;

/** Reset view (circular arrow) */
export const ICON_RESET = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 102.13-9.36L1 10"/></svg>`;

/** Fit to scene (expand arrows) */
export const ICON_FIT = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>`;

/** Wireframe (cube edges) */
export const ICON_WIREFRAME = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l8 4.5v11L12 22l-8-4.5v-11L12 2z"/><path d="M12 22V11"/><path d="M20 6.5L12 11 4 6.5"/></svg>`;

/** Bounding box */
export const ICON_BBOX = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-dasharray="3 2"><rect x="3" y="3" width="18" height="18" rx="1"/></svg>`;

/** Surface normals (arrows perpendicular to a base line) */
export const ICON_NORMALS = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 19h18"/><line x1="6" y1="19" x2="6" y2="11"/><line x1="12" y1="19" x2="12" y2="7"/><line x1="18" y1="19" x2="18" y2="11"/><polyline points="4,13 6,11 8,13"/><polyline points="10,9 12,7 14,9"/><polyline points="16,13 18,11 20,13"/></svg>`;

/** Distance measure (ruler) */
export const ICON_DISTANCE = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 20L20 2"/><path d="M7 17l2-2"/><path d="M11 13l2-2"/><path d="M15 9l2-2"/><circle cx="3" cy="21" r="1.5" fill="currentColor"/><circle cx="21" cy="3" r="1.5" fill="currentColor"/></svg>`;

/** Area measure */
export const ICON_AREA = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20L4 4l16 0 0 16z" fill="currentColor" opacity="0.1"/><path d="M4 20L4 4l16 0 0 16z"/><circle cx="4" cy="4" r="1.5" fill="currentColor"/><circle cx="20" cy="4" r="1.5" fill="currentColor"/><circle cx="20" cy="20" r="1.5" fill="currentColor"/><circle cx="4" cy="20" r="1.5" fill="currentColor"/></svg>`;

/** Top view (eye looking down) */
export const ICON_VIEW_TOP = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="1"/><circle cx="12" cy="12" r="3"/><line x1="12" y1="1" x2="12" y2="4"/><polygon points="10,1 12,0 14,1" fill="currentColor" stroke="none"/></svg>`;

/** Front view */
export const ICON_VIEW_FRONT = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6" width="18" height="14" rx="1"/><circle cx="12" cy="13" r="3"/><line x1="12" y1="3" x2="12" y2="6"/><polygon points="10,3 12,1 14,3" fill="currentColor" stroke="none"/></svg>`;

/** Back view */
export const ICON_VIEW_BACK = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="14" rx="1"/><circle cx="12" cy="11" r="3"/><line x1="12" y1="18" x2="12" y2="21"/><polygon points="10,21 12,23 14,21" fill="currentColor" stroke="none"/></svg>`;

/** Side view (right) */
export const ICON_VIEW_RIGHT = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="3" width="14" height="18" rx="1"/><circle cx="13" cy="12" r="3"/><line x1="3" y1="12" x2="6" y2="12"/><polygon points="3,10 1,12 3,14" fill="currentColor" stroke="none"/></svg>`;

/** Side view (left) */
export const ICON_VIEW_LEFT = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3" width="14" height="18" rx="1"/><circle cx="11" cy="12" r="3"/><line x1="21" y1="12" x2="18" y2="12"/><polygon points="21,10 23,12 21,14" fill="currentColor" stroke="none"/></svg>`;

/** GCP / survey flag marker */
export const ICON_MARKER_FLAG = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><line x1="7" y1="3" x2="7" y2="21"/><path d="M7 3 L19 8 L7 13" fill="currentColor" stroke="none" opacity="0.9"/><path d="M7 3 L19 8 L7 13"/></svg>`;
export const ICON_DEM = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="2 18 7 8 11 14 15 6 22 18"/><line x1="2" y1="18" x2="22" y2="18"/></svg>`;

/** Eye (visibility on) */
export const ICON_EYE = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>`;

/** Eye off (visibility off) */
export const ICON_EYE_OFF = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;

/** Trash / delete */
export const ICON_TRASH = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>`;

/** Package / generic layer */
export const ICON_PACKAGE = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l8 4.5v11L12 22l-8-4.5v-11L12 2z"/><path d="M12 22V11"/><path d="M20 6.5L12 11 4 6.5"/></svg>`;

/** Elevation profile (mountain silhouette with baseline) */
export const ICON_ELEVATION = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 17 7 10 11 14 15 7 21 17"/><line x1="3" y1="20" x2="21" y2="20"/></svg>`;

/** 3D cube / 3D viewer */
export const ICON_3D = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l8 4.5v11L12 22l-8-4.5v-11L12 2z"/><path d="M12 22V11"/><path d="M20 6.5L12 11 4 6.5"/></svg>`;

/** Share / export scene */
export const ICON_SHARE = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>`;

/** XYZ coordinate picker (crosshair with dot) */
export const ICON_PICK_XYZ = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/></svg>`;

/** Bookmark with plus (add bookmark) */
export const ICON_BOOKMARK_ADD = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/><line x1="12" y1="8" x2="12" y2="14"/><line x1="9" y1="11" x2="15" y2="11"/></svg>`;

/** Bug / issue report */
export const ICON_BUG = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2l1.5 1.5"/><path d="M14.5 3.5L16 2"/><path d="M9 9h6"/><path d="M9 13h6"/><path d="M12 21c-3.31 0-6-2.69-6-6V9a3 3 0 0 1 3-3h6a3 3 0 0 1 3 3v6c0 3.31-2.69 6-6 6z"/><path d="M6 10H3"/><path d="M21 10h-3"/><path d="M6 16H3"/><path d="M21 16h-3"/></svg>`;

/** Save image / screenshot */
export const ICON_SAVE_IMAGE = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>`;
