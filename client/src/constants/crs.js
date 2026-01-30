// client/src/constants/crs.js
import L from "leaflet";
import "proj4leaflet";

export const getProjectedCRS = (config) => {
  const code = config.crs;
  const params = config.projection_params;

  // 1. Handle standard Leaflet CRS
  if (code === "EPSG3857") return L.CRS.EPSG3857;
  if (code === "EPSG4326") return L.CRS.EPSG4326;

  // 2. Handle Custom Projected CRS (like EPSG:3031)
  if (params && params.proj_string) {
    const [minX, minY, maxX, maxY] = params.extent;
    const bounds = L.bounds(L.point(minX, minY), L.point(maxX, maxY));

    return new L.Proj.CRS(code, params.proj_string, {
      origin: [minX, maxY], // Top-left corner
      resolutions: params.resolutions,
      bounds: bounds
    });
  }

  // Fallback
  return L.CRS.EPSG3857;
};