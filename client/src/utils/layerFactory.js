// Factory functions for creating different OpenLayers layer types
import TileLayer from "ol/layer/Tile";
import WebGLTileLayer from "ol/layer/WebGLTile";
import XYZ from "ol/source/XYZ";
import TileGrid from "ol/tilegrid/TileGrid";
import { createXYZ } from "ol/tilegrid";
import WMTS from "ol/source/WMTS";
import WMTSTileGrid from "ol/tilegrid/WMTS";
import TileWMS from "ol/source/TileWMS";
import GeoTIFF from "ol/source/GeoTIFF";
import { DEFAULT_TILE_SIZE } from "../constants/layerConstants";
import { COLORMAP_MAP } from "../constants/colormaps";

/**
 * Build a WebGL tile style expression for a given colormap.
 * Works with normalize:true — band values arrive in [0, 1] from OL.
 * When hasNoData is true, OL appends an alpha band (band 2) that masks nodata pixels.
 *
 * @param {string} colormapId - Key from COLORMAP_MAP (e.g. 'viridis'). Falls back to grayscale.
 * @param {boolean} hasNoData
 * @returns {object} OL WebGL style object  { color: [...] }
 */
export function buildColormapStyle(colormapId, hasNoData, inverted = false) {
  const alpha = hasNoData ? ['band', 2] : 1;
  const colormap = COLORMAP_MAP[colormapId];

  if (!colormap || colormapId === 'grayscale') {
    if (inverted) {
      const v = ['-', 1, ['band', 1]];
      return { color: ['array', v, v, v, alpha] };
    }
    return { color: ['array', ['band', 1], ['band', 1], ['band', 1], alpha] };
  }

  const stops = inverted
    ? colormap.stops.map(([pos, r, g, b]) => [1 - pos, r, g, b]).sort((a, b) => a[0] - b[0])
    : colormap.stops;

  const rInterp = ['interpolate', ['linear'], ['band', 1], ...stops.flatMap(([pos, r])     => [pos, r])];
  const gInterp = ['interpolate', ['linear'], ['band', 1], ...stops.flatMap(([pos, , g])   => [pos, g])];
  const bInterp = ['interpolate', ['linear'], ['band', 1], ...stops.flatMap(([pos, , , b]) => [pos, b])];

  return { color: ['array', rInterp, gInterp, bInterp, alpha] };
}

// OpenLayers XYZ uses {a-c} for subdomains; Leaflet / common configs use {s}.
// Convert {s} so browser can resolve the hostname.
function normalizeTileUrl(url) {
  return url ? url.replace('{s}', '{a-c}') : url;
}

/**
 * Create a tile layer configuration object
 * @param {Object} layerConf - Layer configuration
 * @param {import('ol/Map').default} map - OpenLayers map instance
 * @param {number} zIndex - Layer z-index
 * @param {string} layerId - Unique layer identifier
 * @returns {Object} Layer configuration object
 */
export function createTileLayerConfig(layerConf, map, zIndex, layerId) {
  const projection = map.getView().getProjection();
  const isWMTS = layerConf.url.includes("{z}/{y}/{x}");

  const sourceConfig = {
    attributions: layerConf.attribution,
    projection: projection,
    wrapX: false,
    crossOrigin: 'anonymous',
  };

  // Add tile grid if custom resolutions are provided (for polar projections)
  if (layerConf.crs_options?.resolutions && layerConf.crs_options?.extent) {
    const extent = layerConf.crs_options.extent;
    const resolutions = layerConf.crs_options.resolutions;
    const tileSize = layerConf.tileSize || DEFAULT_TILE_SIZE;

    if (isWMTS) {
      // WMTS uses TMS-style tiles with origin at top-left
      sourceConfig.tileGrid = new TileGrid({
        extent: extent,
        resolutions: resolutions,
        tileSize: tileSize,
        origin: [extent[0], extent[3]], // Top-left corner
      });

      // Custom tile URL function for WMTS {z}/{y}/{x} pattern
      sourceConfig.tileUrlFunction = (tileCoord) => {
        if (!tileCoord) return "";
        const z = tileCoord[0];
        const x = tileCoord[1];
        const y = tileCoord[2];

        return layerConf.url
          .replace("{z}", z.toString())
          .replace("{y}", y.toString())
          .replace("{x}", x.toString());
      };
    } else {
      // Standard XYZ tiles
      sourceConfig.tileGrid = createXYZ({
        extent: extent,
        resolutions: resolutions,
        tileSize: tileSize,
      });
      sourceConfig.url = normalizeTileUrl(layerConf.url);
    }
  } else {
    // No custom tile grid - use URL directly
    sourceConfig.url = normalizeTileUrl(layerConf.url);
  }

  const source = new XYZ(sourceConfig);
  const olLayer = new TileLayer({
    source: source,
    visible: layerConf.visible,
    zIndex: zIndex,
    properties: { name: layerConf.name, id: layerId },
  });

  return {
    layerId,
    name: layerConf.name,
    layerInstance: olLayer,
    type: "tile",
    visible: layerConf.visible,
    url: layerConf.url,
  };
}

/**
 * Create a WMS layer configuration object
 * @param {Object} layerConf - Layer configuration
 * @param {import('ol/Map').default} map - OpenLayers map instance
 * @param {number} zIndex - Layer z-index
 * @param {string} layerId - Unique layer identifier
 * @returns {Object} Layer configuration object
 */
export function createWMSLayerConfig(layerConf, map, zIndex, layerId) {
  const source = new TileWMS({
    url: layerConf.url,
    params: {
      LAYERS: layerConf.layers || "0",
      FORMAT: layerConf.format || "image/jpeg",
      VERSION: "1.3.0",
    },
    projection: map.getView().getProjection(),
    attributions: layerConf.attribution,
    crossOrigin: 'anonymous',
  });

  const olLayer = new TileLayer({
    source: source,
    visible: layerConf.visible,
    zIndex: zIndex,
    properties: { name: layerConf.name, id: layerId },
  });

  return {
    layerId,
    name: layerConf.name,
    layerInstance: olLayer,
    type: "wms",
    visible: layerConf.visible,
    url: layerConf.url,
  };
}

/**
 * Create a WMTS layer configuration object
 * @param {Object} layerConf - Layer configuration
 * @param {import('ol/Map').default} map - OpenLayers map instance
 * @param {number} zIndex - Layer z-index
 * @param {string} layerId - Unique layer identifier
 * @returns {Object} Layer configuration object
 */
export function createWMTSLayerConfig(layerConf, map, zIndex, layerId) {
  const source = new WMTS({
    url: layerConf.url,
    layer: layerConf.layer,
    matrixSet: layerConf.matrixSet,
    format: layerConf.format,
    projection: map.getView().getProjection(),
    crossOrigin: 'anonymous',
    tileGrid: new WMTSTileGrid({
      origin: layerConf.origin || [-4194304, 4194304],
      resolutions: layerConf.resolutions || [8192, 4096, 2048, 1024, 512, 256],
      matrixIds: layerConf.matrixIds || [0, 1, 2, 3, 4, 5],
      tileSize: layerConf.tileSize || 512,
    }),
  });

  const olLayer = new TileLayer({
    source: source,
    visible: layerConf.visible,
    zIndex: zIndex,
    properties: { name: layerConf.name, id: layerId },
  });

  return {
    layerId,
    name: layerConf.name,
    layerInstance: olLayer,
    type: "wmts",
    visible: layerConf.visible,
    url: layerConf.url,
  };
}

/**
 * Create a GeoJSON layer configuration object (deferred loading)
 * @param {Object} layerConf - Layer configuration
 * @param {string} layerId - Unique layer identifier
 * @returns {Object} Layer configuration object
 */
export function createGeoJSONLayerConfig(layerConf, layerId) {
  return {
    layerId,
    name: layerConf.name,
    layerInstance: null, // Will be created after download
    type: "geojson",
    visible: layerConf.visible,
    // color is the UI badge color; falls back to stroke_color if only that is provided
    color: layerConf.color ?? layerConf.stroke_color,
    strokeColor: layerConf.stroke_color ?? null,
    fillColor: layerConf.fill_color ?? null,
    renderMode: layerConf.render_mode ?? 'vector',
    url: layerConf.url,
    searchFields: layerConf.search_fields || [],
    metadata: layerConf._metadata || {},
    groupBy: layerConf.group_by ?? null,
    thumbnailUrl: layerConf.thumbnail_url ?? null,
  };
}

/**
 * Create a GeoTIFF layer configuration object
 * @param {Object} layerConf - Layer configuration
 * @param {import('ol/Map').default} map - OpenLayers map instance
 * @param {number} zIndex - Layer z-index
 * @param {string} layerId - Unique layer identifier
 * @returns {Object} Layer configuration object
 */
export function createGeoTIFFLayerConfig(layerConf, map, zIndex, layerId) {
  // For a single-band file (DEM etc.) build a simple grayscale style.
  // Always use normalize:true so OL maps the band to [0,1] in the GPU shader.
  // When we know the real data range (from the worker scan), pass it as
  // source-level min/max so OL normalises against the *actual* terrain range
  // instead of the full type range (0–65535 for uint16 → DEMs appear black).
  //
  // Avoid normalize:false + manual WebGL clamp expressions: that path fails
  // silently for Float32 rasters in some OL/WebGL configurations.
  const isSingleBand = layerConf.bandCount === 1;
  const dataMin = layerConf.dataMin ?? null;
  const dataMax = layerConf.dataMax ?? null;
  const hasRange = isSingleBand && dataMin !== null && dataMax !== null && dataMax > dataMin;
  const hasNoData = layerConf.noDataValue !== null && layerConf.noDataValue !== undefined;

  let resolvedStyle;
  if (layerConf.style) {
    resolvedStyle = layerConf.style;
  } else if (isSingleBand) {
    // With normalize:true the band arrives already in [0,1].
    // Apply the requested colormap (defaults to grayscale).
    resolvedStyle = buildColormapStyle(layerConf.colormap ?? 'grayscale', hasNoData);
  } else {
    resolvedStyle = undefined;
  }

  const sourceConfig = {
    sources: [
      {
        // Use blob directly for local files — blob: URLs don't support HTTP
        // range requests, causing OL's tile loader to fail with AggregateError.
        ...(layerConf.file ? { blob: layerConf.file } : { url: layerConf.url }),
        // Only restrict bands if explicitly configured; otherwise render all bands
        ...(layerConf.bands ? { bands: layerConf.bands } : {}),
        // When we know the real data range, tell OL to normalise against it.
        // OL maps [min, max] → [0, 1]; values outside are clamped.
        ...(hasRange ? { min: dataMin, max: dataMax } : {}),
        // Mask nodata pixels — OL sets their alpha to 0 in the WebGL shader.
        ...(layerConf.noDataValue !== null && layerConf.noDataValue !== undefined
          ? { nodata: layerConf.noDataValue }
          : {}),
      }
    ],
    normalize: layerConf.normalize !== undefined ? layerConf.normalize : true,
    // Explicitly declare the source CRS so OL can reproject to the map's CRS.
    // Without this, OL tries to read the CRS from GeoKeys which can fail for
    // projections not natively known to OL (e.g. EPSG:3031).
    ...(layerConf.tiffProjection ? { projection: layerConf.tiffProjection } : {}),
  };

  // Add optional overviews for better performance with large GeoTIFFs
  if (layerConf.overviews) {
    sourceConfig.sources[0].overviews = layerConf.overviews;
  }

  const source = new GeoTIFF(sourceConfig);

  // Use WebGLTileLayer for better performance with GeoTIFFs
  const olLayer = new WebGLTileLayer({
    source: source,
    visible: layerConf.visible,
    zIndex: zIndex,
    // transition: 0 — disables the per-tile fade-in animation.
    // The default fade uses canvas read-back (getImageData) on every tile
    // render, which is very expensive for large GeoTIFFs and freezes the UI.
    transition: 0,
    // preload: 0 — don't fetch tiles outside the current viewport on load,
    // reducing the burst of work when the layer is first added.
    preload: 0,
    properties: { name: layerConf.name, id: layerId },
    style: resolvedStyle,
  });

  // Set opacity if specified
  if (layerConf.opacity !== undefined) {
    olLayer.setOpacity(layerConf.opacity);
  }

  return {
    layerId,
    name: layerConf.name,
    layerInstance: olLayer,
    type: "geotiff",
    geometryType: "raster",
    visible: layerConf.visible,
    url: layerConf.url,
  };
}
