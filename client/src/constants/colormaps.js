// Colormap definitions for single-band raster (GeoTIFF) rendering.
// Each stop: [position, r, g, b] — position 0–1, color channels 0–1.
// `gradient` is a CSS string used to preview the colormap in the UI.

export const COLORMAPS = [
  {
    id: 'grayscale',
    label: 'Gray',
    gradient: 'linear-gradient(to right, #000, #fff)',
    stops: [
      [0,   0, 0, 0],
      [1,   1, 1, 1],
    ],
  },
  {
    id: 'viridis',
    label: 'Viridis',
    gradient: 'linear-gradient(to right, #440154, #31688e, #35b779, #90d743, #fde725)',
    stops: [
      [0,    0.267, 0.005, 0.329],
      [0.25, 0.192, 0.408, 0.557],
      [0.5,  0.208, 0.718, 0.475],
      [0.75, 0.565, 0.843, 0.263],
      [1,    0.992, 0.906, 0.145],
    ],
  },
  {
    id: 'plasma',
    label: 'Plasma',
    gradient: 'linear-gradient(to right, #0d0887, #7e03a8, #cc4778, #f89441, #f0f921)',
    stops: [
      [0,    0.051, 0.035, 0.529],
      [0.25, 0.494, 0.012, 0.659],
      [0.5,  0.800, 0.278, 0.471],
      [0.75, 0.973, 0.580, 0.255],
      [1,    0.941, 0.976, 0.129],
    ],
  },
  {
    id: 'inferno',
    label: 'Inferno',
    gradient: 'linear-gradient(to right, #000004, #57106e, #bc3754, #f98e09, #fcffa4)',
    stops: [
      [0,    0.000, 0.000, 0.016],
      [0.25, 0.341, 0.063, 0.431],
      [0.5,  0.737, 0.216, 0.329],
      [0.75, 0.976, 0.557, 0.035],
      [1,    0.988, 1.000, 0.643],
    ],
  },
  {
    id: 'hot',
    label: 'Hot',
    gradient: 'linear-gradient(to right, #000, #f00, #ff0, #fff)',
    stops: [
      [0,    0, 0, 0],
      [0.33, 1, 0, 0],
      [0.67, 1, 1, 0],
      [1,    1, 1, 1],
    ],
  },
  {
    id: 'terrain',
    label: 'Terrain',
    gradient: 'linear-gradient(to right, #336699, #33996a, #cccc66, #996633, #fff)',
    stops: [
      [0,    0.200, 0.400, 0.600],
      [0.25, 0.200, 0.600, 0.416],
      [0.5,  0.800, 0.800, 0.400],
      [0.75, 0.600, 0.400, 0.200],
      [1,    1.000, 1.000, 1.000],
    ],
  },
  {
    id: 'rdylbu',
    label: 'RdYlBu',
    gradient: 'linear-gradient(to right, #d73027, #f46d43, #ffffbf, #74add1, #4575b4)',
    stops: [
      [0,    0.843, 0.188, 0.153],
      [0.25, 0.957, 0.427, 0.263],
      [0.5,  1.000, 1.000, 0.749],
      [0.75, 0.455, 0.678, 0.820],
      [1,    0.271, 0.459, 0.706],
    ],
  },
  {
    id: 'rdylgn',
    label: 'RdYlGn',
    gradient: 'linear-gradient(to right, #d73027, #fc8d59, #ffffbf, #91cf60, #1a9850)',
    stops: [
      [0,    0.843, 0.188, 0.153],
      [0.25, 0.988, 0.553, 0.349],
      [0.5,  1.000, 1.000, 0.749],
      [0.75, 0.569, 0.812, 0.376],
      [1,    0.102, 0.596, 0.314],
    ],
  },
];

// Quick lookup by id
export const COLORMAP_MAP = Object.fromEntries(COLORMAPS.map(c => [c.id, c]));
