import L from "leaflet";
import "proj4leaflet";

/**
 * EPSG:3031 - WGS 84 / Antarctic Polar Stereographic
 * Used for GBIF Antarctic tiles and polar data.
 *
 */
// Verification of your CRS constant for these URLs
export const CRS_3031 = new L.Proj.CRS(
  "EPSG:3031",
  "+proj=stere +lat_0=-90 +lat_ts=-71 +lon_0=0 +k=1 +x_0=0 +y_0=0 +datum=WGS84 +units=m +no_defs",
  {
    // These resolutions are required for GBIF tiles to line up with zoom levels
    resolutions: [32768, 16384, 8192, 4096, 2048, 1024, 512, 256, 128, 64, 32],
    origin: [-12367396.2185, 12367396.2185], // Origin for GBIF polar tiles
    bounds: L.bounds(
      [-12367396.2185, -12367396.2185],
      [12367396.2185, 12367396.2185],
    ),
  },
);

// Map human-readable names from your config to the CRS objects
export const CRS_MAP = {
  "EPSG:3857": L.CRS.EPSG3857,
  "EPSG:4326": L.CRS.EPSG4326,
  "EPSG:3031": CRS_3031,
};
