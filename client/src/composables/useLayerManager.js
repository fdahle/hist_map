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
import { Style, Stroke, Fill, Circle as CircleStyle } from "ol/style";
import { transformExtent } from "ol/proj";

export function useLayerManager(map) {
  const layerStore = useLayerStore();
  const selectionStore = useSelectionStore();
  const layerRegistry = {}; // Maps feature ID -> OL Feature
  const activeWorkers = new Map();

  // Watcher to trigger downloads
  watch(
    () => layerStore.layers,
    (layers) => {
      layers.forEach((layer) => {
        if (layer.active && layer.status === "idle" && layer.type === "geojson") {
          loadGeoJsonLayer(layer);
        }
      });
    },
    { deep: true }
  );

  const processLayer = async (layerConf, category) => {
    const layerId = layerConf._layerId || generateUUID();

    // --- TILE LAYERS ---
    if (layerConf.type === "tile") {
      // Handle Custom Grids (NASA / GBIF) if 'crs_options' exists
      // For simplicity, we stick to standard XYZ, which works for 90% of cases
      // If you need the specific matrix sets, we can add WMTSTileGrid later.
      
      const source = new XYZ({
        url: layerConf.url,
        attributions: layerConf.attribution,
        projection: map.getView().getProjection(), // Align with map projection
        wrapX: layerConf.noWrap !== true,
      });

      const olLayer = new TileLayer({
        source: source,
        visible: layerConf.visible,
        properties: { name: layerConf.name, id: layerId }
      });

      layerStore.addLayer(
        layerId, layerConf.name, olLayer, "tile", category, layerConf.visible, "tile", null, layerConf.url
      );

      if (layerConf.visible) {
        map.addLayer(olLayer);
      }
    }

    // --- GEOJSON LAYERS ---
    if (layerConf.type === "geojson") {
      // Placeholder for Vector Layer
      layerStore.addLayer(
        layerId, layerConf.name, null, "geojson", category, layerConf.visible, "unknown", layerConf.color, layerConf.url
      );
    }
  };

  const loadGeoJsonLayer = (layer) => {
    layerStore.setLayerStatus(layer._layerId, "downloading");

    const worker = new Worker(new URL("../workers/layerWorker.js", import.meta.url), { type: "module" });
    activeWorkers.set(layer._layerId, worker);

    worker.postMessage({
      url: layer.url,
      layerId: layer._layerId,
      layerName: layer.name,
    });

    worker.onmessage = (e) => {
      const { type, progress, data, error } = e.data;
      if (type === "PROGRESS") layerStore.setLayerProgress(layer._layerId, progress);
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
    // 1. Parse GeoJSON (OpenLayers handles projection automatically if featureProjection is set)
    const format = new GeoJSON();
    const features = format.readFeatures(geoJsonData, {
      featureProjection: map.getView().getProjection() // Transform to Map Projection
    });

    // 2. Assign IDs and Styles
    const baseColor = layer.color || "#3388ff";
    
    // Default Vector Style
    const vectorStyle = new Style({
        stroke: new Stroke({ color: baseColor, width: 2 }),
        fill: new Fill({ color: baseColor + "80" }) // Add transparency hex
    });
    
    // Pin Style for Points
    const pinStyle = createPinStyle(baseColor);

    features.forEach(feature => {
      // Ensure ID
      const fid = feature.get("id") || generateUUID();
      feature.setId(fid);
      feature.set("_layerId", layer._layerId);
      feature.set("_featureId", fid);
      
      // Store in registry for quick lookup
      layerRegistry[fid] = feature;
    });

    // 3. Create Source and Layer
    const source = new VectorSource({
      features: features
    });

    const olLayer = new VectorLayer({
      source: source,
      visible: layer.active, // Only show if active
      style: (feature) => {
          // Dynamic Style Function
          if (feature.getGeometry().getType() === "Point") return pinStyle;
          return vectorStyle;
      },
      properties: { id: layer._layerId }
    });

    // 4. Update Store
    const storeLayer = layerStore.layers.find(l => l._layerId === layer._layerId);
    if (storeLayer) {
        storeLayer.layerInstance = olLayer;
        storeLayer.status = "ready";
        
        if (storeLayer.active) {
            map.addLayer(olLayer);
        }
    }

    worker.terminate();
    activeWorkers.delete(layer._layerId);
  };

  const cleanup = () => {
    activeWorkers.forEach(w => w.terminate());
    activeWorkers.clear();
  };

  return { processLayer, cleanup, layerRegistry };
}