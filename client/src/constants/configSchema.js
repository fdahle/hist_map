// src/constants/configSchema.js
// Single source of truth for all configuration structure and defaults.
// Covers every section that config.yaml supports.

export const CONFIG_SCHEMA = {
  // Map view settings
  view: {
    required: ["center", "zoom"],
    types: { center: "array", zoom: "number" },
    optional: {
      extent: { type: "array", description: "View extent [minX, minY, maxX, maxY]" },
      minZoom: { type: "number", default: 0 },
      maxZoom: { type: "number", default: 28 },
    },
  },

  // Coordinate Reference System
  crs: {
    required: true,
    type: "string",
    default: "EPSG:3857",
  },

  // Custom projection parameters (optional, for non-standard CRS)
  projection_params: {
    required: false,
    fields: {
      proj_string: { type: "string", required: true },
      extent: { type: "array", required: false },
    },
  },

  // Layer type definitions and their required fields
  layerTypes: {
    tile: {
      required: ["url", "attribution"],
      optional: ["tileSize", "crs_options"],
    },
    wmts: {
      required: ["url", "layer", "matrixSet", "format", "attribution"],
      optional: ["origin", "resolutions", "matrixIds", "tileSize", "style", "crs_options"],
    },
    wms: {
      required: ["url", "layers", "format", "attribution"],
      optional: ["version", "transparent"],
    },
    geojson: {
      required: ["url"],
      optional: ["color", "stroke_color", "fill_color", "render_mode", "search_fields", "pointType", "group_by", "color_by"],
    },
    geotiff: {
      required: ["url"],
      optional: ["bands", "normalize", "overviews", "opacity", "style", "noDataValue", "tiffProjection", "tiffProj4", "bandCount"],
    },
  },

  // Common layer fields (apply to all layer types)
  commonLayerFields: {
    required: ["name", "type", "visible", "order"],
    optional: ["attribution", "description"],
  },
};

/**
 * Get default value for a config field
 * @param {string} section - Config section (e.g., 'website', 'view')
 * @param {string} field - Field name
 * @returns {any} Default value or undefined
 */
export function getConfigDefault(section, field) {
  const sectionSchema = CONFIG_SCHEMA[section];
  if (!sectionSchema) return undefined;

  // Check fields
  if (sectionSchema.fields?.[field]?.default !== undefined) {
    return sectionSchema.fields[field].default;
  }
  // Check optional
  if (sectionSchema.optional?.[field]?.default !== undefined) {
    return sectionSchema.optional[field].default;
  }
  // Check top-level default
  if (field === undefined && sectionSchema.default !== undefined) {
    return sectionSchema.default;
  }
  return undefined;
}