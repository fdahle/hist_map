import L from "leaflet";
import "proj4leaflet";
import proj4 from "proj4";

proj4.defs(
  "EPSG:3031",
  "+proj=stere +lat_0=-90 +lat_ts=-71 +lon_0=0 +k=1 +x_0=0 +y_0=0 +datum=WGS84 +units=m +no_defs"
);

const extent = 12367396.2185; // Correct Extent for GBIF
const tileSize = 512;         // GBIF tiles are 512x512

const resolutions = [];
let res = (extent * 2) / tileSize;
for (let i = 0; i < 16; i++) {
  resolutions.push(res);
  res /= 2;
}

export const CRS_3031 = new L.Proj.CRS(
  "EPSG:3031",
  "+proj=stere +lat_0=-90 +lat_ts=-71 +lon_0=0 +k=1 +x_0=0 +y_0=0 +datum=WGS84 +units=m +no_defs",
  {
    origin: [-extent, extent], // Top-Left of the GBIF grid
    resolutions: resolutions,
    bounds: L.bounds([-extent, -extent], [extent, extent]),
  },
);

// Map human-readable names from your config to the CRS objects
export const CRS_MAP = {
  "EPSG:3857": L.CRS.EPSG3857,
  "EPSG:4326": L.CRS.EPSG4326,
  "EPSG:3031": CRS_3031,
};
