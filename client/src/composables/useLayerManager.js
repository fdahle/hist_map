// client/src/composables/useLayerManager.js
import { watch } from "vue";
import { useLayerStore } from "../stores/layerStore";
import { useSelectionStore } from "../stores/selectionStore";
import { createPinStyle, generateUUID } from "./utils";

// OpenLayers Imports
import TileLayer from "ol/layer/Tile";
import VectorLayer from "ol/layer/Vector";
import XYZ from "ol/source/XYZ";
import VectorSource from "ol/source/Vector";
import GeoJSON from "ol/format/GeoJSON";
import { Style, Stroke, Fill } from "ol/style";
import { createXYZ } from "ol/tilegrid";
import TileGrid from "ol/tilegrid/TileGrid";
import WMTS from "ol/source/WMTS";
import WMTSTileGrid from "ol/tilegrid/WMTS";
import TileWMS from "ol/source/TileWMS"; // <--- 1. ADD THIS IMPORT

export function useLayerManager(map) {
  const layerStore = useLayerStore();
  const selectionStore = useSelectionStore();
  const layerRegistry = {}; // Maps feature ID -> OL Feature
  const activeWorkers = new Map();

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
          state.status === "idle" &&
          state.type === "geojson"
        ) {
          const layer = layerStore.layers.find((l) => l._layerId === state.id);
          if (layer) loadGeoJsonLayer(layer);
        }
      });
    },
  );

  const processLayer = async (layerConf, category) => {
    const layerId = layerConf._layerId || generateUUID();

    // Set z-index based on category
    const zIndex = category === "base" ? 0 : 100;

    // --- TILE LAYERS ---
    if (layerConf.type === "tile") {
      const projection = map.getView().getProjection();

      // Detect if this is WMTS (like NASA GIBS) or XYZ (like GBIF)
      const isWMTS = layerConf.url.includes("{z}/{y}/{x}");

      // Create source configuration
      const sourceConfig = {
        attributions: layerConf.attribution,
        projection: projection,
        wrapX: false, // TODO: Make configurable?
      };

      // Add tile grid if custom resolutions are provided (for polar projections)
      if (layerConf.crs_options?.resolutions && layerConf.crs_options?.extent) {
        const extent = layerConf.crs_options.extent;
        const resolutions = layerConf.crs_options.resolutions;
        const tileSize = layerConf.tileSize || 256;

        if (isWMTS) {
          // WMTS uses TMS-style tiles with origin at top-left
          // and Y increases downward (standard)
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

            // WMTS pattern: {z}/{y}/{x}
            return layerConf.url
              .replace("{z}", z.toString())
              .replace("{y}", y.toString())
              .replace("{x}", x.toString());
          };
        } else {
          // Standard XYZ tiles (like GBIF)
          sourceConfig.tileGrid = createXYZ({
            extent: extent,
            resolutions: resolutions,
            tileSize: tileSize,
          });
          sourceConfig.url = layerConf.url;
        }
      } else {
        // No custom tile grid - use URL directly
        sourceConfig.url = layerConf.url;
      }

      // Create the XYZ source and layer
      const source = new XYZ(sourceConfig);
      const olLayer = new TileLayer({
        source: source,
        visible: layerConf.visible,
        zIndex: zIndex,
        properties: { name: layerConf.name, id: layerId },
      });

      // Add to store
      layerStore.addLayer(
        layerId,
        layerConf.name,
        olLayer,
        "tile",
        category,
        layerConf.visible,
        "tile",
        null, // color, only for vector layers
        layerConf.order,
        layerConf.url,
      );

      // ALWAYS add to map immediately (visibility controlled via setVisible)
      map.addLayer(olLayer);
      // set layer to ready
      layerStore.setLayerStatus(layerId, "ready");
    }

    // --- WMS LAYERS ---
    if (layerConf.type === "wms") {
      const source = new TileWMS({
        url: layerConf.url,
        params: {
          LAYERS: layerConf.layers || "0",
          FORMAT: layerConf.format || "image/jpeg",
          VERSION: "1.3.0",
        },
        projection: map.getView().getProjection(),
        attributions: layerConf.attribution,
      });

      const olLayer = new TileLayer({
        source: source,
        visible: layerConf.visible,
        zIndex: zIndex,
        properties: { name: layerConf.name, id: layerId },
      });

      layerStore.addLayer(
        layerId,
        layerConf.name,
        olLayer,
        "wms",
        category,
        layerConf.visible,
        "tile",
        null,
        layerConf.url,
        layerConf.order,
      );

      map.addLayer(olLayer);
      // Mark as ready immediately so the switcher sees it
      layerStore.setLayerStatus(layerId, "ready");
    }

    // --- WMTS LAYERS ---
    if (layerConf.type === "wmts") {
      const source = new WMTS({
        url: layerConf.url,
        layer: layerConf.layer,
        matrixSet: layerConf.matrixSet,
        format: layerConf.format,
        projection: map.getView().getProjection(),
        tileGrid: new WMTSTileGrid({
          origin: layerConf.origin || [-4194304, 4194304],
          resolutions: layerConf.resolutions || [
            8192, 4096, 2048, 1024, 512, 256,
          ],
          matrixIds: layerConf.matrixIds || [0, 1, 2, 3, 4, 5],
          tileSize: layerConf.tileSize || 512,
        }),
      });

      const olLayer = new TileLayer({
        source: source,
        visible: layerConf.visible,
        zIndex: category === "base" ? 0 : 100,
        properties: { name: layerConf.name, id: layerId },
      });

      map.addLayer(olLayer);
      layerStore.addLayer(
        layerId,
        layerConf.name,
        olLayer,
        "wmts",
        category,
        layerConf.visible,
        "tile",
        null, // color, only for vector layers
        layerConf.order,
        layerConf.url,
      );
      layerStore.setLayerStatus(layerId, "ready");
    }

    // --- GEOJSON LAYERS ---
    if (layerConf.type === "geojson") {
      // Placeholder for Vector Layer
      layerStore.addLayer(
        layerId,
        layerConf.name,
        null,
        "geojson",
        category,
        layerConf.visible,
        "unknown",
        layerConf.color,
        0, // order (only for basemaps)
        layerConf.url,
      );
    }
  };

  const loadGeoJsonLayer = (layer) => {
    layerStore.setLayerStatus(layer._layerId, "downloading");

    const worker = new Worker(
      new URL("../workers/layerWorker.js", import.meta.url),
      { type: "module" },
    );
    activeWorkers.set(layer._layerId, worker);

    worker.postMessage({
      url: layer.url,
      layerId: layer._layerId,
      layerName: layer.name,
    });

    worker.onmessage = (e) => {
      const { type, progress, data, error } = e.data;
      if (type === "PROGRESS")
        layerStore.setLayerProgress(layer._layerId, progress);
      if (type === "SUCCESS") {
        layerStore.setLayerStatus(layer._layerId, "processing");
        finalizeGeoJsonLayer(data, layer, worker);
      }
      if (type === "ERROR") {
        console.error("Worker Error:", error);
        layerStore.setLayerError(layer._layerId, error);
        worker.terminate();
      }
    };
  };

  const finalizeGeoJsonLayer = (geoJsonData, layer, worker) => {
    // 1. Parse GeoJSON
    const format = new GeoJSON();
    const features = format.readFeatures(geoJsonData, {
      featureProjection: map.getView().getProjection(),
    });

    // 2. Create cached styles (NOT in style function for performance)
    const baseColor = layer.color || "#3388ff";
    const vectorStyle = new Style({
      stroke: new Stroke({ color: baseColor, width: 2 }),
      fill: new Fill({ color: baseColor + "80" }),
    });
    const pinStyle = createPinStyle(baseColor);

    // 3. Pre-assign styles to features for better performance
    features.forEach((feature) => {
      const fid = feature.get("id") || generateUUID();
      feature.setId(fid);
      feature.set("_layerId", layer._layerId);
      feature.set("_featureId", fid);

      // Pre-assign style based on geometry type
      const geomType = feature.getGeometry().getType();
      if (geomType === "Point" || geomType === "MultiPoint") {
        feature.setStyle(pinStyle);
      } else {
        feature.setStyle(vectorStyle);
      }

      layerRegistry[fid] = feature;
    });

    // 4. Create Source and Layer
    const source = new VectorSource({
      features: features,
    });

    const olLayer = new VectorLayer({
      source: source,
      visible: layer.active,
      zIndex: 100,
      // Performance optimizations
      updateWhileAnimating: true,
      updateWhileInteracting: true,
      properties: { id: layer._layerId },
    });

    // 4. Update Store
    const storeLayer = layerStore.layers.find(
      (l) => l._layerId === layer._layerId,
    );
    if (storeLayer) {
      storeLayer.layerInstance = olLayer;
      storeLayer.status = "ready";

      // ALWAYS add to map immediately
      map.addLayer(olLayer);
    }

    worker.terminate();
    activeWorkers.delete(layer._layerId);
  };

  const cleanup = () => {
    activeWorkers.forEach((w) => w.terminate());
    activeWorkers.clear();
  };

  return { processLayer, cleanup, layerRegistry };
}
