// client/src/composables/useLayerManager.js
import { watch, markRaw } from "vue";
import { useLayerStore } from "../stores/map/layerStore";
import { useSelectionStore } from "../stores/map/selectionStore";
import { useSettingsStore } from "../stores/settingsStore";
import { generateUUID } from "../utils/helpers";
import { logger } from "../utils/logger";
import { tryRegisterProjection } from "../utils/crs";
import {
  buildLayerSharedStyle,
  buildGroupByStyleFunction,
  createSelectionStyleFunction,
} from "../utils/styleFactory";
import {
  createTileLayerConfig,
  createWMSLayerConfig,
  createWMTSLayerConfig,
  createGeoJSONLayerConfig,
  createGeoTIFFLayerConfig,
  buildColormapStyle,
} from "../utils/layerFactory";
import {
  Z_INDEX,
  LAYER_CATEGORY,
  LAYER_STATUS,
  GEOMETRY_TYPE,
  SUBCATEGORY_COLORS,
  DEFAULT_COLOR,
} from "../constants/layerConstants";

// OpenLayers Imports
import VectorLayer from "ol/layer/Vector";
import VectorImageLayer from "ol/layer/VectorImage";
import VectorSource from "ol/source/Vector";
import GeoJSON from "ol/format/GeoJSON";
import { Select, DragBox } from "ol/interaction";
import { click, shiftKeyOnly } from "ol/events/condition";

export function useLayerManager(map) {
  const layerStore = useLayerStore();
  const selectionStore = useSelectionStore();
  const settingsStore = useSettingsStore();
  const activeWorkers = new Map();
  let selectInteraction = null;

  // ---------------------------------------------------------------------------
  // #5 — Search index: layerId → Map<lowerCaseName, OL Feature>
  // Built once per layer when it finishes loading; SearchBar reads it instead
  // of scanning every feature on every keystroke.
  // ---------------------------------------------------------------------------
  const searchIndex = new Map();

  // ---------------------------------------------------------------------------
  // #4 — Register the cancel handler so the store can terminate workers.
  // The store calls this function when cancelLayerLoad() is invoked.
  // ---------------------------------------------------------------------------
  layerStore.registerCancelHandler((layerId) => {
    // 1. Terminate the worker
    const worker = activeWorkers.get(layerId);
    if (worker) {
      worker.terminate();
      activeWorkers.delete(layerId);
    }
    // 2. Remove any partially-loaded OL layer from the map
    const storeLayer = layerStore.layers.find((l) => l._layerId === layerId);
    if (storeLayer?.layerInstance) {
      map.removeLayer(storeLayer.layerInstance);
      storeLayer.layerInstance = null;
    }
    // 3. Clear any partial search index entries
    searchIndex.delete(layerId);
  });

  // Watcher to trigger downloads - only watch the specific conditions we care about
  // Using a computed to extract only the relevant data prevents unnecessary re-runs
  watch(
    () =>
      layerStore.layers.map((l) => ({
        id: l._layerId,
        active: l.active,
        status: l.status,
        type: l.type,
      })),
    (layerStates) => {
      layerStates.forEach((state) => {
        if (
          state.active &&
          state.status === LAYER_STATUS.IDLE &&
          state.type === "geojson"
        ) {
          const layer = layerStore.layers.find((l) => l._layerId === state.id);
          if (layer) loadGeoJsonLayer(layer);
        }
      });
    },
  );

  // ---------------------------------------------------------------------------
  // CRS Compatibility Check — probes WMS/WMTS capabilities asynchronously
  // and marks each base layer as compatible (true), incompatible (false), or
  // unchecked (null) so the UI can warn users about mismatched projections.
  // ---------------------------------------------------------------------------
  const checkCrsCompatibility = async (layerConf, layerId) => {
    const mapCrs = map.getView().getProjection().getCode(); // e.g. "EPSG:3031"
    const epsgCode = mapCrs.split(":")[1]; // e.g. "3031"

    // Allow the config to hard-code compatibility rather than probing the network.
    // `crs_support: false`              → always incompatible
    // `crs_support: ["EPSG:3031", ...]` → compatible only when mapCrs is in the list
    // omitted                           → probe the network (type-dependent below)
    if (layerConf.crs_support !== undefined) {
      if (layerConf.crs_support === false) {
        layerStore.setCrsCompatibility(layerId, false);
      } else if (Array.isArray(layerConf.crs_support)) {
        const upper = layerConf.crs_support.map((c) => String(c).toUpperCase());
        layerStore.setCrsCompatibility(layerId, upper.includes(mapCrs.toUpperCase()));
      }
      return;
    }

    try {
      // Tile layers: compatible only when crs_options is explicitly defined,
      // meaning the user has configured the tile grid for the current CRS.
      if (layerConf.type === "tile") {
        layerStore.setCrsCompatibility(layerId, !!layerConf.crs_options);
        return;
      }

      if (layerConf.type === "wmts") {
        // Normalize the base URL: replace load-balancing templates (e.g. {a-c})
        // and strip query parameters before building the capabilities URL.
        let baseUrl = layerConf.url
          .replace(/\{[a-z]-[a-z]\}/g, layerConf.url.match(/\{([a-z])-[a-z]\}/)?.[1] ?? "a")
          .replace(/[?#].*$/, "")
          .replace(/\/$/, "");

        // Try KVP format first (works for CGI endpoints like GIBS), then REST fallback.
        const candidates = [
          `${baseUrl}?SERVICE=WMTS&REQUEST=GetCapabilities`,
          `${baseUrl}/WMTSCapabilities.xml`,
        ];

        let doc = null;
        for (const capUrl of candidates) {
          try {
            const res = await fetch(capUrl, { signal: AbortSignal.timeout(8000) });
            if (!res.ok) continue;
            const xml = await res.text();
            doc = new DOMParser().parseFromString(xml, "text/xml");
            // A parsed error document has a <parsererror> root element.
            if (doc.querySelector("parsererror")) { doc = null; continue; }
            break;
          } catch { continue; }
        }

        if (!doc) {
          // Couldn't fetch capabilities — leave as null (unknown).
          layerStore.setCrsCompatibility(layerId, null);
          return;
        }

        // Find the TileMatrixSet element whose <Identifier> matches matrixSet.
        const sets = doc.querySelectorAll("TileMatrixSet");
        for (const set of sets) {
          const id = set.querySelector(":scope > Identifier, :scope > ows\\:Identifier")?.textContent?.trim();
          if (id !== layerConf.matrixSet) continue;
          const supportedCrs =
            set.querySelector(":scope > SupportedCRS, :scope > ows\\:SupportedCRS")?.textContent?.trim() ?? "";
          const compatible =
            supportedCrs.includes(epsgCode) ||
            supportedCrs.toUpperCase().includes(mapCrs.toUpperCase());
          layerStore.setCrsCompatibility(layerId, compatible);
          return;
        }

        // matrixSet was not found in capabilities — mark as incompatible.
        layerStore.setCrsCompatibility(layerId, false);
        return;
      }

      if (layerConf.type === "wms") {
        // Browser-side WMS GetCapabilities is blocked by CORS on virtually all
        // public WMS servers (the server must opt-in with CORS headers, and most
        // don't). Attempting the fetch would always produce a browser CORS error
        // in the console even though our catch() handles the exception. Instead
        // we leave crsCompatible as null (unknown) for WMS layers; users can
        // work around this by adding `crs_support: false` to the layer config.
        layerStore.setCrsCompatibility(layerId, null);
        return;
      }
    } catch (e) {
      // Network errors etc. — leave crsCompatible as null so the UI stays neutral.
      logger.warn("LayerManager", `CRS check failed for "${layerConf.name}":`, e.message);
    }
  };

  // ── GeoTIFF URL metadata scan ─────────────────────────────────────────────────
  // Spawns the geotiff worker to extract band count, data range and projection
  // from a server-hosted GeoTIFF via HTTP range requests — the same scan that
  // drag-dropped files go through before their OL layer is created.
  // Resolves with the metadata object on success or null on timeout / error.
  const scanGeoTIFFUrl = (url, layerId) => new Promise((resolve) => {
    const worker = new Worker(
      new URL('../workers/geotiffWorker.js', import.meta.url),
      { type: 'module' },
    );
    const timeout = setTimeout(() => { worker.terminate(); resolve(null); }, 30_000);
    worker.onmessage = (e) => {
      const { type, metadata, progress } = e.data;
      if (type === 'PROGRESS') {
        // Layer may not be in the store yet; setLayerProgress handles missing IDs.
        layerStore.setLayerProgress(layerId, progress ?? 0);
      } else if (type === 'COMPLETE') {
        clearTimeout(timeout);
        worker.terminate();
        resolve(metadata);
      } else if (type === 'ERROR') {
        clearTimeout(timeout);
        worker.terminate();
        resolve(null);
      }
    };
    worker.onerror = () => { clearTimeout(timeout); worker.terminate(); resolve(null); };
    worker.postMessage({ url, layerId });
  });

  // Fire-and-forget finalization for URL GeoTIFFs scanned after processLayer returns.
  // Runs concurrently with map setup so it doesn't block map initialization.
  const _scanAndApplyGeoTIFF = async (layerId, layerConf, category, zIndex) => {
    const resolvedConf = { ...layerConf };

    try {
      const scanned = await scanGeoTIFFUrl(resolvedConf.url, layerId);
      if (scanned) {
        if (scanned.bands      != null) resolvedConf.bandCount    = scanned.bands;
        if (scanned.dataMin    != null) resolvedConf.dataMin      = scanned.dataMin;
        if (scanned.dataMax    != null) resolvedConf.dataMax      = scanned.dataMax;
        if (scanned.noDataValue!= null) resolvedConf.noDataValue  = scanned.noDataValue;
        if (scanned.extent     != null) resolvedConf.extent       = scanned.extent;
        if (scanned.projection != null && !resolvedConf.tiffProjection)
          resolvedConf.tiffProjection = scanned.projection;

        // Ensure the GeoTIFF's native CRS is registered with proj4/OL so it
        // can be reprojected to the map's CRS (same step that drag-drop does).
        if (resolvedConf.tiffProjection) {
          const registered = await tryRegisterProjection(
            resolvedConf.tiffProjection,
            resolvedConf.tiffProj4,    // server-supplied proj4 string (avoids epsg.io fetch)
          );
          if (!registered) {
            console.warn(`[GeoTIFF] Could not register CRS ${resolvedConf.tiffProjection} — layer may not reproject correctly`);
          }
        }

        if (window.__APP_DEBUG__ || import.meta.env.DEV) {
          console.debug(`=== LAYER DEBUG — ${resolvedConf.name} (GeoTIFF, URL) ===`);
          console.debug('  bands:', scanned.bands, '| min:', scanned.dataMin, '| max:', scanned.dataMax);
          console.debug('  projection:', scanned.projection, '| nodata:', scanned.noDataValue);
          console.debug('  extent:', scanned.extent, '| tiled:', scanned.isTiled);
        }

        // Non-COG (strip-based) GeoTIFFs can't be served reliably via HTTP
        // range requests — tile fetches fail with AggregateError and leave gaps.
        // Pre-download the entire file as a Blob so geotiff.js uses Blob.slice()
        // for random access instead of range requests.
        if (scanned.isTiled === false) {
          try {
            layerStore.setLayerProgress(layerId, 85, 'Downloading raster…');
            const resp = await fetch(resolvedConf.url);
            if (resp.ok) {
              resolvedConf.file = await resp.blob();
              // Clear the URL so createGeoTIFFLayerConfig picks the blob path.
              resolvedConf.url  = undefined;
            }
          } catch (_blobErr) {
            // Non-fatal — fall through to URL-based loading as a last resort.
            console.warn(`[GeoTIFF] Could not pre-download non-COG file for ${resolvedConf.name}, falling back to range requests`);
          }
        }
      }
    } catch (_) {
      // Non-fatal — proceed with whatever metadata is available.
    }

    const layerConfig = createGeoTIFFLayerConfig(resolvedConf, map, zIndex, layerId);
    const resolvedMetadata = {
      bands:          resolvedConf.bandCount       ?? null,
      dataMin:        resolvedConf.dataMin         ?? null,
      dataMax:        resolvedConf.dataMax         ?? null,
      noDataValue:    resolvedConf.noDataValue     ?? null,
      extent:         resolvedConf.extent          ?? null,
      tiffProjection: resolvedConf.tiffProjection  ?? null,
      file:           null,
    };

    // Patch the store entry that was pre-created as a placeholder.
    const storeEntry = layerStore.getLayerById(layerId);
    if (storeEntry) {
      storeEntry.layerInstance = markRaw(layerConfig.layerInstance);
      storeEntry.metadata = resolvedMetadata;
    }

    map.addLayer(layerConfig.layerInstance);
    layerStore.setLayerStatus(layerId, LAYER_STATUS.READY);
    layerStore.updateLayerZIndexes();

    const src = layerConfig.layerInstance.getSource?.();
    if (src) {
      src.once('error', () => {
        const proj = resolvedConf.tiffProjection ?? 'unknown CRS';
        layerStore.setLayerError(
          layerId,
          `Could not display GeoTIFF — the file's CRS (${proj}) cannot be reprojected to the map's projection. Re-project the file with GDAL/QGIS first.`,
        );
      });
    }
  };

  const processLayer = async (layerConf, category) => {
    const layerId = layerConf._layerId || generateUUID();
    const zIndex = category === LAYER_CATEGORY.BACKGROUND
      ? Z_INDEX.BACKGROUND
      : category === LAYER_CATEGORY.BASE
        ? Z_INDEX.BASE
        : Z_INDEX.OVERLAY;

    let layerConfig;
    
    // Create layer configuration based on type
    switch (layerConf.type) {
      case "tile":
        layerConfig = createTileLayerConfig(layerConf, map, zIndex, layerId);
        break;
      case "wms":
        layerConfig = createWMSLayerConfig(layerConf, map, zIndex, layerId);
        break;
      case "wmts":
        layerConfig = createWMTSLayerConfig(layerConf, map, zIndex, layerId);
        break;
      case "geotiff": {
        // For server-loaded GeoTIFFs served by URL (no local blob), always run
        // the async worker scan to extract data range, nodata and CRS — even
        // when bandCount is already known from the config.  Without the scan,
        // single-band rasters render flat-black because OL normalises against
        // the full type range (0-65535) rather than the actual value range.
        if (layerConf.url && !layerConf.file) {
          layerStore.addLayer({
            layerId,
            name:         layerConf.name,
            layerInstance: null,
            type:         'geotiff',
            geometryType: GEOMETRY_TYPE.RASTER,
            category,
            visible:      layerConf.visible,
            isUserAdded:  layerConf.isUserAdded ?? false,
            attribution:  layerConf.attribution ?? null,
            url:          layerConf.url,
            metadata: {
              bands: null, dataMin: null, dataMax: null, noDataValue: null,
              extent: null, tiffProjection: layerConf.tiffProjection ?? null, file: null,
            },
          });
          layerStore.setLayerStatus(layerId, LAYER_STATUS.LOADING_DETAILS);
          // Fire-and-forget: finalization happens inside _scanAndApplyGeoTIFF.
          _scanAndApplyGeoTIFF(layerId, layerConf, category, zIndex);
          return;
        }
        // Drag-dropped files (or config layers with pre-scanned metadata) are
        // created synchronously with the full metadata already present.
        layerConfig = createGeoTIFFLayerConfig(layerConf, map, zIndex, layerId);
        layerConfig.metadata = {
          bands:           layerConf.bandCount       ?? null,
          dataMin:         layerConf.dataMin         ?? null,
          dataMax:         layerConf.dataMax         ?? null,
          noDataValue:     layerConf.noDataValue     ?? null,
          extent:          layerConf.extent          ?? null,
          tiffProjection:  layerConf.tiffProjection  ?? null,
          file:            layerConf.file            ?? null,
        };
        break;
      }
      case "geojson":
        layerConfig = createGeoJSONLayerConfig(layerConf, layerId);
        break;
      default:
        logger.error('LayerManager', `Unknown layer type: ${layerConf.type}`);
        return;
    }

    // Add layer to store with category
    layerStore.addLayer({
      ...layerConfig,
      category,
      isUserAdded: layerConf.isUserAdded ?? false,
      attribution: layerConf.attribution ?? null,
    });

    // For raster layers (tile, wms, wmts), add to map immediately
    if (layerConfig.layerInstance) {
      map.addLayer(layerConfig.layerInstance);
      layerStore.setLayerStatus(layerId, LAYER_STATUS.READY);
      // Update z-indexes to respect current layer ordering
      layerStore.updateLayerZIndexes();

      // GeoTIFF: listen for OL source errors (e.g. "No transform available")
      // so the layer is marked as errored instead of silently failing.
      if (layerConf.type === 'geotiff') {
        if (window.__APP_DEBUG__ || import.meta.env.DEV) {
          console.debug(`=== LAYER DEBUG — ${layerConf.name} (GeoTIFF, blob) ===`);
          console.debug('  bands:', layerConf.bandCount, '| min:', layerConf.dataMin, '| max:', layerConf.dataMax);
          console.debug('  projection:', layerConf.tiffProjection, '| nodata:', layerConf.noDataValue);
        }
        const src = layerConfig.layerInstance.getSource?.();
        if (src) {
          src.once('error', () => {
            const proj = layerConf.tiffProjection ?? 'unknown CRS';
            layerStore.setLayerError(
              layerId,
              `Could not display GeoTIFF — the file's CRS (${proj}) cannot be reprojected to the map's projection. Re-project the file with GDAL/QGIS first.`,
            );
          });
        }
      }
    }

    // Fire-and-forget CRS probe for base layers — doesn't block map init.
    if (category === LAYER_CATEGORY.BASE) {
      checkCrsCompatibility(layerConf, layerId);
    }

    return layerConfig;
  };

  const loadGeoJsonLayer = (layer) => {
    layerStore.setLayerStatus(layer._layerId, LAYER_STATUS.DOWNLOADING);

    const worker = new Worker(
      new URL("../workers/layerWorker.js", import.meta.url),
      { type: "module" },
    );
    activeWorkers.set(layer._layerId, worker);

    worker.postMessage({
      url: layer.url,
      layerId: layer._layerId,
      layerName: layer.name,
      debug: !!(window.__APP_DEBUG__ || import.meta.env.DEV),
    });

    // State shared across all CHUNK messages for this layer.
    const format = new GeoJSON();
    const layerSearchIndex = new Map();
    let source = null;
    let olLayer = null;
    let detectedGeomType = GEOMETRY_TYPE.POLYGON;
    // Collect unique groupBy values while streaming chunks
    const groupByValues = new Set();

    worker.onmessage = (e) => {
      const { type, progress, chunkIndex, totalChunks, isFirst, dataProjection, geojsonChunk, metadata, error } = e.data;

      if (type === "PROGRESS") {
        layerStore.setLayerProgress(layer._layerId, progress);
      }

      if (type === "CHUNK") {
        if (isFirst) {
          layerStore.setLayerStatus(layer._layerId, LAYER_STATUS.PROCESSING);
          layerStore.setLayerProgress(layer._layerId, 0);
        }

        // Parse this chunk's features (applies CRS projection — must run on main thread).
        // dataProjection tells OL what CRS the coordinates are actually in;
        // featureProjection tells OL what CRS the map view uses.
        const readOptions = {
          featureProjection: map.getView().getProjection(),
        };
        if (dataProjection) {
          readOptions.dataProjection = dataProjection;
        }
        if (isFirst && (window.__APP_DEBUG__ || import.meta.env.DEV)) {
          console.debug(`=== LAYER DEBUG — ${layer.name} (main thread) ===`);
          console.debug("  dataProjection (from file):",  readOptions.dataProjection ?? "undefined → OL defaults to EPSG:4326");
          console.debug("  featureProjection (map view):", map.getView().getProjection().getCode());
          const sample = geojsonChunk.features[0]?.geometry?.coordinates;
          if (sample) console.debug("  First feature raw coords:", JSON.stringify(sample)?.slice(0, 120));
        }
        const features = format.readFeatures(geojsonChunk, readOptions);

        // Assign stable IDs and build the search index.
        for (const feature of features) {
          const fid = feature.get("_featureId") || feature.get("id") || generateUUID();
          feature.setId(fid);
          feature.set("_layerId", layer._layerId);
          if (!feature.get("_featureId")) feature.set("_featureId", fid);

          // Inject thumbnail URL from config if not already set on the feature.
          // Supports $<fieldname> and $<fieldname:start:end> (JS .slice) placeholders.
          if (!feature.get("_thumbnailUrl") && layer.thumbnailUrl) {
            const resolved = layer.thumbnailUrl.replace(/\$<([^>]+)>/g, (_, expr) => {
              const parts = expr.split(':');
              const val = feature.get(parts[0]);
              if (val == null) return '';
              const str = String(val);
              if (parts.length === 1) return str;
              const start = parts[1] !== '' ? parseInt(parts[1], 10) : 0;
              if (parts.length === 2) return str.slice(start);
              const end = parts[2] !== '' ? parseInt(parts[2], 10) : undefined;
              return str.slice(start, end);
            });
            if (resolved) feature.set("_thumbnailUrl", resolved);
          }

          // Track unique values for group_by
          if (layer.groupBy) {
            const val = feature.get(layer.groupBy);
            if (val != null && String(val) !== "") groupByValues.add(String(val));
          }

          if (layer.searchFields?.length) {
            const props = feature.getProperties();
            for (const field of layer.searchFields) {
              const value = props[field];
              if (value != null && String(value) !== '') {
                const key = String(value).toLowerCase();
                const entry = { feature, displayValue: String(value) };
                const existing = layerSearchIndex.get(key);
                if (existing) {
                  existing.push(entry);
                } else {
                  layerSearchIndex.set(key, [entry]);
                }
              }
            }
          }
        }

        if (isFirst) {
          // Detect geometry type from the first loaded feature with a non-null geometry.
          const firstWithGeom = features.find(f => f.getGeometry() != null);
          if (firstWithGeom) {
            const firstType = firstWithGeom.getGeometry().getType();
            if (firstType === GEOMETRY_TYPE.POINT || firstType === GEOMETRY_TYPE.MULTI_POINT) {
              detectedGeomType = GEOMETRY_TYPE.POINT;
            } else if (firstType === GEOMETRY_TYPE.LINE_STRING || firstType === GEOMETRY_TYPE.MULTI_LINE_STRING) {
              detectedGeomType = GEOMETRY_TYPE.LINE;
            }
          }

          const sharedStyle = buildLayerSharedStyle(
            layer.color,
            layer.strokeColor ?? null,
            layer.fillColor ?? null,
            detectedGeomType,
          );

          // Create source + layer and add to the map immediately so the first
          // batch of features is visible while the rest are still streaming in.
          source = new VectorSource({ features });
          const LayerClass = layer.renderMode === "image" ? VectorImageLayer : VectorLayer;

          // Use a style function for grouped layers so each group can be
          // coloured and toggled independently. For plain layers, use the
          // static shared style (faster — avoids per-feature lookup).
          const layerStyle = layer.groupBy
            ? buildGroupByStyleFunction(layer._layerId, layerStore)
            : sharedStyle;

          olLayer = new LayerClass({
            source,
            style: layerStyle,
            visible: layer.active,
            zIndex: Z_INDEX.OVERLAY,
            updateWhileAnimating: false,
            updateWhileInteracting: false,
            properties: { id: layer._layerId },
          });

          const storeLayer = layerStore.layers.find((l) => l._layerId === layer._layerId);
          if (storeLayer) {
            storeLayer.layerInstance = markRaw(olLayer);
            storeLayer.geometryType = detectedGeomType;
          }
          map.addLayer(olLayer);
          layerStore.updateLayerZIndexes();
        } else {
          // Append to the existing source — OL re-renders on the next animation frame.
          source.addFeatures(features);
        }

        layerStore.setLayerProgress(layer._layerId, Math.round(((chunkIndex + 1) / totalChunks) * 100));
      }

      if (type === "COMPLETE") {
        searchIndex.set(layer._layerId, layerSearchIndex);

        // Resolve the store layer first — needed both for groupBy and for
        // setting status/metadata below. (Must be before the groupBy block
        // or `storeLayer` would be in the temporal dead zone inside the else.)
        const storeLayer = layerStore.layers.find((l) => l._layerId === layer._layerId);

        // Build sub-categories from collected unique values.
        if (layer.groupBy) {
          if (groupByValues.size > 0) {
            // All sub-groups start with the same colour as the parent layer so
            // the main colour still makes sense visually. The user can then
            // change individual group colours via the right-click context menu.
            const baseColor = layer.strokeColor || layer.color || DEFAULT_COLOR;
            const categories = {};
            for (const val of [...groupByValues].sort()) {
              categories[val] = { color: baseColor, visible: true };
            }
            layerStore.initSubCategories(layer._layerId, categories);
            if (olLayer) olLayer.changed();
          } else {
            // The configured field name was not present in any feature — warn.
            const msg = `group_by field "${layer.groupBy}" not found in any feature. Check the spelling in config.yaml.`;
            logger.warn("LayerManager", `Layer "${layer.name}": ${msg}`);
            if (storeLayer) {
              storeLayer.groupByMissing = true;
              storeLayer.warning = msg;
            }
          }
        }

        if (storeLayer) {
          storeLayer.status = LAYER_STATUS.READY;
          storeLayer.metadata = metadata ?? {};
        }

        worker.terminate();
        activeWorkers.delete(layer._layerId);
      }

      if (type === "ERROR") {
        logger.error("LayerManager", "Worker Error:", error);
        layerStore.setLayerError(layer._layerId, error);
        worker.terminate();
        activeWorkers.delete(layer._layerId);
      }
    };
  };

  const applyLayerColor = (layerId) => {
    const layerObj = layerStore.getLayerById(layerId);
    if (!layerObj || !layerObj.layerInstance) return;

    // For grouped layers the style function already reads from the store;
    // just force OL to re-render the image tile.
    if (layerObj.groupBy) {
      layerObj.layerInstance.changed();
      return;
    }

    // Update layer-level style — O(1) regardless of feature count.
    const newStyle = buildLayerSharedStyle(
      layerObj.color,
      layerObj.strokeColor ?? null,
      layerObj.fillColor ?? null,
      layerObj.geometryType
    );
    layerObj.layerInstance.setStyle(newStyle);

    // Clear any per-feature style overrides (e.g. from a previous selection)
    // so the new layer style takes effect on all non-selected features.
    const source = layerObj.layerInstance.getSource?.();
    if (source) {
      const selectedIds = selectInteraction
        ? new Set(selectInteraction.getFeatures().getArray().map(f => f.getId()))
        : new Set();
      source.getFeatures().forEach(f => {
        if (!selectedIds.has(f.getId())) f.setStyle(null);
      });
    }
    // Force a full re-render (required for VectorImageLayer and large feature sets)
    layerObj.layerInstance.changed();
  };

  /**
   * Rebuild the WebGL style for a single-band GeoTIFF layer with a new colormap.
   * @param {string} layerId
   * @param {string} colormapId - Key from COLORMAP_MAP (e.g. 'viridis')
   */
  const applyLayerColormap = (layerId, colormapId) => {
    const layerObj = layerStore.getLayerById(layerId);
    if (!layerObj?.layerInstance || layerObj.type !== 'geotiff') return;
    const hasNoData =
      layerObj.metadata?.noDataValue !== null &&
      layerObj.metadata?.noDataValue !== undefined;
    const newStyle = buildColormapStyle(colormapId, hasNoData, layerObj.colormapInverted ?? false);
    layerObj.layerInstance.setStyle(newStyle);
  };

  /**
   * Force OL to re-render a grouped layer after a sub-category change.
   * Call this from the UI after toggling visibility or changing a group colour.
   */
  const applySubCategories = (layerId) => {
    const layerObj = layerStore.getLayerById(layerId);
    if (layerObj?.layerInstance) layerObj.layerInstance.changed();
  };

  let dragBoxInteraction = null;

  // Sync the OL selection collection into the store
  const syncSelectionToStore = () => {
    const allSelected = selectInteraction.getFeatures().getArray();
    if (allSelected.length === 0) {
      selectionStore.clearSelection();
    } else {
      const featureData = allSelected.map((f) => {
        const properties = f.getProperties();
        const { geometry, ...props } = properties;
        return { properties: props };
      });
      selectionStore.setSelectedFeatures(featureData);
    }
  };

  const setupSelection = () => {
    // Create selection style function using the factory
    const selectionStyleFunction = createSelectionStyleFunction(
      layerStore.getLayerById
    );

    selectInteraction = new Select({
      condition: click,
      toggleCondition: shiftKeyOnly, // shift+click adds/removes from selection
      style: selectionStyleFunction,
      filter: (feature) => feature.get('_layerId') != null, // exclude measurement/temp features
    });

    selectInteraction.on("select", (e) => {
      // Clear the per-feature selection style — OL falls back to the
      // layer-level shared style automatically.
      e.deselected.forEach((deselected) => {
        deselected.setStyle(null);
      });

      syncSelectionToStore();
    });

    // DragBox interaction for shift+drag box selection
    dragBoxInteraction = new DragBox({ condition: shiftKeyOnly });

    dragBoxInteraction.on("boxend", () => {
      const boxExtent = dragBoxInteraction.getGeometry().getExtent();
      const selFeatures = selectInteraction.getFeatures();

      // Collect features already in the selection for fast duplicate check
      const alreadySelected = new Set(selFeatures.getArray().map((f) => f.getId()));

      map.getLayers().forEach((layer) => {
        if (!(layer instanceof VectorLayer) && !(layer instanceof VectorImageLayer)) return;
        if (!layer.getVisible()) return; // skip hidden layers
        layer.getSource().forEachFeatureIntersectingExtent(boxExtent, (feature) => {
          if (!alreadySelected.has(feature.getId())) {
            selFeatures.push(feature);
            alreadySelected.add(feature.getId());
            // Apply selection style manually since we're bypassing the Select interaction
            feature.setStyle(selectionStyleFunction(feature));
          }
        });
      });

      syncSelectionToStore();
    });

    map.addInteraction(dragBoxInteraction);
    map.addInteraction(selectInteraction);
  };

  const setSelectionActive = (active) => {
    if (selectInteraction) selectInteraction.setActive(active);
    if (dragBoxInteraction) dragBoxInteraction.setActive(active);
    if (!active) selectionStore.clearSelection();
  };

  const removeLayer = (layerId) => {
    const layer = layerStore.getLayerById(layerId);
    if (!layer) return;
    // Remove OL layer instance from the map
    if (layer.layerInstance) {
      map.removeLayer(layer.layerInstance);
    }
    // Revoke blob URL if one was used (prevents memory leak)
    if (layer.url && layer.url.startsWith('blob:')) {
      URL.revokeObjectURL(layer.url);
    }
    // Clean up search index
    searchIndex.delete(layerId);
    // Terminate any active worker for this layer
    const worker = activeWorkers.get(layerId);
    if (worker) {
      worker.terminate();
      activeWorkers.delete(layerId);
    }
    // Remove from store
    layerStore.removeLayer(layerId);
  };

  const cleanup = () => {
    activeWorkers.forEach((w) => w.terminate());
    activeWorkers.clear();
    searchIndex.clear();
    if (dragBoxInteraction) {
      map.removeInteraction(dragBoxInteraction);
      dragBoxInteraction = null;
    }
    if (selectInteraction) {
      map.removeInteraction(selectInteraction);
      selectInteraction = null;
    }
  };

  return { processLayer, removeLayer, cleanup, applyLayerColor, applyLayerColormap, applySubCategories, searchIndex, setupSelection, setSelectionActive };
}
