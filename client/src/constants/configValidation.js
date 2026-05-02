// Config validation utilities
import { CONFIG_SCHEMA } from './configSchema';

/**
 * Validate the basic structure of the config
 * @param {Object} config - Configuration object
 * @throws {Error} If required fields are missing
 */
function validateBasicStructure(config) {
  if (!config) {
    throw new Error('Configuration file is empty.');
  }

  if (!config.view) {
    throw new Error("Missing 'view' section.");
  }

  CONFIG_SCHEMA.view.required.forEach((field) => {
    if (config.view[field] === undefined) {
      throw new Error(`view.${field} is required.`);
    }
  });
}

/**
 * Validate base layers configuration
 * @param {Array} baseLayers - Array of base layer configurations
 * @throws {Error} If base layers are invalid
 */
function validateBaseLayers(baseLayers) {
  if (!Array.isArray(baseLayers) || baseLayers.length === 0) {
    throw new Error('You must define at least one base layer.');
  }

  const baseOrders = [];

  baseLayers.forEach((layer, index) => {
    const prefix = `basemaps[${index}] (${layer.name || 'unnamed'})`;

    // Check type validity
    if (!CONFIG_SCHEMA.layerTypes[layer.type]) {
      throw new Error(
        `${prefix}: Invalid type '${layer.type}'. Allowed: ${Object.keys(
          CONFIG_SCHEMA.layerTypes
        ).join(', ')}`
      );
    }

    // Check specific attributes for that type
    const requiredFields = CONFIG_SCHEMA.layerTypes[layer.type].required;
    requiredFields.forEach((field) => {
      if (!layer[field]) {
        throw new Error(
          `${prefix}: Missing required field '${field}' for type '${layer.type}'.`
        );
      }
    });

    // Check Order Logic
    if (typeof layer.order !== 'number') {
      throw new Error(`${prefix}: 'order' must be a number.`);
    }
    baseOrders.push(layer.order);
  });

  // Check for duplicate orders in base layers
  if (new Set(baseOrders).size !== baseOrders.length) {
    throw new Error("Base layers must have unique 'order' values.");
  }
}

/**
 * Validate overlay layers configuration
 * @param {Array} overlayLayers - Array of overlay layer configurations
 * @throws {Error} If overlay layers are invalid
 */
function validateOverlayLayers(overlayLayers) {
  if (!overlayLayers) return; // Optional

  const mapRenderableTypes = ['geojson', 'geotiff'];
  // model and pointcloud layers are valid config entries (used by the 3D viewer)
  // but are not rendered on the map, so skip map-specific field validation for them.
  const knownNonMapTypes = ['model', 'pointcloud'];

  overlayLayers.forEach((layer, index) => {
    const prefix = `data_layers[${index}] (${layer.name || 'unnamed'})`;

    if (!mapRenderableTypes.includes(layer.type) && !knownNonMapTypes.includes(layer.type)) {
      throw new Error(
        `${prefix}: Unsupported type '${layer.type}'. Allowed: ${[...mapRenderableTypes, ...knownNonMapTypes].join(', ')}`
      );
    }

    if (!mapRenderableTypes.includes(layer.type)) return; // skip field checks for non-map types

    const requiredFields = CONFIG_SCHEMA.layerTypes[layer.type]?.required || [];
    requiredFields.forEach((field) => {
      if (!layer[field]) {
        throw new Error(`${prefix}: Missing required field '${field}'.`);
      }
    });
  });
}

/**
 * Validate that exactly one base layer is set as visible
 * @param {Array} baseLayers - Array of base layer configurations
 * @throws {Error} If visibility rules are violated
 */
function validateLayerVisibility(baseLayers) {
  const visibleBaseLayers = baseLayers.filter((l) => l.visible);

  if (visibleBaseLayers.length === 0) {
    throw new Error(
      "No base layer is set to 'visible: true'. The map will be empty."
    );
  }

  if (visibleBaseLayers.length > 1) {
    throw new Error(
      "Multiple base layers are set to 'visible: true'. Please choose only one default."
    );
  }
}

/**
 * Main validation function for the entire config
 * @param {Object} config - Configuration object to validate
 * @returns {boolean} True if validation passes
 * @throws {Error} If validation fails
 */
export function validateConfig(config) {
  validateBasicStructure(config);
  if (config.basemaps?.length) {
    validateBaseLayers(config.basemaps);
    // Skip strict visibility check when OSM background is enabled — the map won't be empty.
    if (!config.osm_background) {
      validateLayerVisibility(config.basemaps);
    }
  }
  validateOverlayLayers(config.data_layers);
  return true;
}
