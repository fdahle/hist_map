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
import TileGrid from "ol/tilegrid/TileGrid";

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

    // Set z-index based on category
    const zIndex = category === "base" ? 0 : 100;

    // --- TILE LAYERS ---
    if (layerConf.type === "tile") {
      const projection = map.getView().getProjection();
      
      // Create source configuration
      const sourceConfig = {
        attributions: layerConf.attribution,
        projection: projection,
        wrapX: layerConf.noWrap !== true,
      };

      // Add tile grid if custom resolutions are provided (for polar projections)
      if (layerConf.crs_options?.resolutions && layerConf.crs_options?.extent) {
        const extent = layerConf.crs_options.extent;
        const resolutions = layerConf.crs_options.resolutions;
        
        sourceConfig.tileGrid = new TileGrid({
          extent: extent,
          resolutions: resolutions,
          tileSize: layerConf.tileSize || 256
        });
      }

      // CRITICAL FIX: Use tileUrlFunction to ensure integer zoom levels
      // GBIF uses standard XYZ tile scheme, so we just need integers
      sourceConfig.tileUrlFunction = (tileCoord) => {
        if (!tileCoord) return '';
        
        const z = tileCoord[0];
        let x = tileCoord[1];
        let y = tileCoord[2];
        
        // Replace placeholders in URL template
        return layerConf.url
          .replace('{z}', z.toString())
          .replace('{x}', x.toString())
          .replace('{y}', y.toString());
      };
      
      const source = new XYZ(sourceConfig);

      const olLayer = new TileLayer({
        source: source,
        visible: layerConf.visible,
        zIndex: zIndex, // Set z-index
        properties: { name: layerConf.name, id: layerId }
      });

      // Add to store
      layerStore.addLayer(
        layerId, layerConf.name, olLayer, "tile", category, layerConf.visible, "tile", null, layerConf.url
      );

      // ALWAYS add to map immediately (visibility controlled via setVisible)
      map.addLayer(olLayer);
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
    // 1. Parse GeoJSON
    const format = new GeoJSON();
    const features = format.readFeatures(geoJsonData, {
      featureProjection: map.getView().getProjection()
    });

    // 2. Assign IDs and Styles
    const baseColor = layer.color || "#3388ff";
    
    // Default Vector Style
    const vectorStyle = new Style({
        stroke: new Stroke({ color: baseColor, width: 2 }),
        fill: new Fill({ color: baseColor + "80" })
    });
    
    // Pin Style for Points
    const pinStyle = createPinStyle(baseColor);

    features.forEach(feature => {
      const fid = feature.get("id") || generateUUID();
      feature.setId(fid);
      feature.set("_layerId", layer._layerId);
      feature.set("_featureId", fid);
      
      layerRegistry[fid] = feature;
    });

    // 3. Create Source and Layer
    const source = new VectorSource({
      features: features
    });

    const olLayer = new VectorLayer({
      source: source,
      visible: layer.active,
      zIndex: 100, // Overlays on top
      style: (feature) => {
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
        
        // ALWAYS add to map immediately
        map.addLayer(olLayer);
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