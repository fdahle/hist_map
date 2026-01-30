// client/src/constants/crs.js
import proj4 from "proj4";
import { register } from "ol/proj/proj4";
import { get as getProjection } from "ol/proj";

export const registerCustomProjections = (config) => {
  const code = config.crs;
  const params = config.projection_params;

  // If it's a standard projection, just return the code
  if (!params || !params.proj_string) {
    return code || "EPSG:3857";
  }

  // 1. Define the projection in Proj4
  proj4.defs(code, params.proj_string);
  
  // 2. Register it with OpenLayers
  register(proj4);

  // 3. Configure the extent if provided
  const projection = getProjection(code);
  if (params.extent) {
    projection.setExtent(params.extent);
  }

  return code;
};