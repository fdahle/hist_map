// Layer processing constants
export const BATCH_SIZE = 2000;
export const PROGRESS_UPDATE_DEBOUNCE = 50;

// Layer z-indexes
export const Z_INDEX = {
  BACKGROUND: -1,
  BASE: 0,
  OVERLAY: 100,
  SELECTION: 999,
};

// Layer statuses
export const LAYER_STATUS = {
  IDLE: 'idle',
  DOWNLOADING: 'downloading',
  PROCESSING: 'processing',
  LOADING_DETAILS: 'loading-details',
  READY: 'ready',
  ERROR: 'error',
};

// Layer categories
export const LAYER_CATEGORY = {
  BACKGROUND: 'background', // reserved; currently unused
  BASE: 'base',
  OVERLAY: 'overlay',
};

// Geometry types
// All values match OL-native casing for direct comparison with feature.getGeometry().getType()
export const GEOMETRY_TYPE = {
  POINT: 'Point',               // OL-native
  MULTI_POINT: 'MultiPoint',    // OL-native
  LINE: 'line',                 // Custom simplified type
  LINE_STRING: 'LineString',    // OL-native
  MULTI_LINE_STRING: 'MultiLineString', // OL-native
  POLYGON: 'polygon',           // Custom simplified type
  RASTER: 'raster',             // Custom type for GeoTIFF layers
  UNKNOWN: 'unknown',
};

// Map event throttling
export const MAP_POINTER_THROTTLE_MS = 50;

// Search settings
export const SEARCH_MIN_LENGTH = 2;
export const SEARCH_DEBOUNCE_MS = 300;

// Default values
export const DEFAULT_COLOR = '#3388ff';
export const DEFAULT_STROKE_WIDTH = 2;
export const DEFAULT_SELECTION_WIDTH = 5;
export const DEFAULT_TILE_SIZE = 256;
export const DEFAULT_OPACITY = 0.5; // 50% fill opacity (hex: ~80)
export const DEFAULT_SELECTION_OPACITY = 0.7; // 70% selection fill opacity (hex: ~B3)

// Colour palette for auto-assigning sub-category group colours.
// Chosen for good contrast against each other and a white/dark map background.
export const SUBCATEGORY_COLORS = [
  '#e74c3c', // red
  '#3498db', // blue
  '#2ecc71', // green
  '#f39c12', // orange
  '#9b59b6', // purple
  '#1abc9c', // teal
  '#e67e22', // dark orange
  '#34495e', // dark grey
  '#e91e63', // pink
  '#00bcd4', // cyan
];
