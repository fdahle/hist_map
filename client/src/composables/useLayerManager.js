// client/src/composables/useLayerManager.js
import L from "leaflet";
import { useLayerStore } from "../stores/layerStore";
import { useSelectionStore } from "../stores/selectionStore";
import { createSvgPin, generateUUID } from "./utils";

export function useLayerManager(map) {
  const layerStore = useLayerStore();
  const selectionStore = useSelectionStore();
  const layerRegistry = {};

  const processLayer = async (layerConf, category) => {
    // Prioritize config ID, otherwise generate one (fallback)
    const layerId = layerConf._id || generateUUID();

    // TILE LAYERS
    if (layerConf.type === "tile") {
      // create Leaflet tile layer
      const leafletLayer = L.tileLayer(layerConf.url, {
        attribution: layerConf.attribution,
      });

      // add to store
      layerStore.addLayer(
        layerId,
        layerConf.name,
        leafletLayer,
        "tile",
        category,
        layerConf.visible,
      );

      // add to map if active
      const storeLayer = layerStore.layers.find((l) => l.id === layerId);
      if (storeLayer && storeLayer.active) {
        leafletLayer.addTo(map);
      }
      return;
    }

    // GEOJSON LAYERS
    if (layerConf.type === "geojson") {
      // add to store with null instance initially
      layerStore.addLayer(
        layerId,  // id
        layerConf.name, // name
        null, // layerInstance
        "geojson", // type
        category,  // category
        layerConf.visible,  // isVisible
        "unknown",  // geometryType
        layerConf.color,  // color
      );

      // Start Worker
      const worker = new Worker(
        new URL("../workers/layerWorker.js", import.meta.url),
        { type: "module" },
      );

      // Send URL to worker
      worker.postMessage({ url: layerConf.url, _id: layerId });

      // Handle messages from worker
      worker.onmessage = (e) => {
        const { type, progress, data, error } = e.data;

        // update message
        if (type === "PROGRESS") {
          layerStore.setLayerProgress(layerId, progress);

          // success message
        } else if (type === "SUCCESS") {
          // finalize layer creation
          finalizeGeoJsonLayer(data, layerConf, category, layerId);
          worker.terminate();

          // error message
        } else if (type === "ERROR") {
          console.error(
            `[LayerManager] Error loading ${layerConf.name} (id: ${layerId}):`,
            error,
          );
          layerStore.setLayerError(layerId, error || "Failed to fetch file");
          worker.terminate();
        }
      };
    }
  };

  const finalizeGeoJsonLayer = async (data, layerConf, category, layerId) => {
    // determine geometry type
    const geometryType = data.features?.[0]?.geometry?.type || "Unknown";

    // create Leaflet GeoJSON layer
    const leafletLayer = L.geoJSON(null, {
      coordsToLatLng: (coords) => {
        const crs = map.options.crs;
        if (crs.projection && typeof crs.unproject === "function") {
          return crs.unproject(L.point(coords[0], coords[1]));
        }
        return L.GeoJSON.coordsToLatLng(coords);
      },

      // set style for polygon and line features
      style: () => ({
        color: layerConf.color || "#3388ff",
        weight: 2,
        fillOpacity: 0.5,
      }),

      // customize point features
      pointToLayer: (feature, latlng) => {
        return L.marker(latlng, {
          icon: createSvgPin(layerConf.color || "#3388ff"),
        });
      },

      // add click handler for feature selection
      onEachFeature: (feature, layer) => {
        if (!feature.properties._id) feature.properties._id = generateUUID();

        feature.properties.layerId = layerId; // Use stable layerId
        layerRegistry[feature.properties.id] = layer;
        layer.on("click", (e) => {
          L.DomEvent.stopPropagation(e);
          selectionStore.selectFeature(feature);
        });
      },
    });

    // Link leaflet instance back to store
    const storeLayer = layerStore.layers.find((l) => l.id === layerId);
    if (storeLayer) {
      storeLayer.layerInstance = leafletLayer;
      storeLayer.geometryType = geometryType;
      storeLayer.loading = false;
      if (storeLayer.active) leafletLayer.addTo(map);
    }

    // Batch processing
    const features = Array.isArray(data.features)
      ? data.features
      : data
        ? [data]
        : [];
    const batchSize = 100;
    let index = 0;

    const processBatch = () => {
      const end = Math.min(index + batchSize, features.length);
      leafletLayer.addData(features.slice(index, end));
      index = end;

      layerStore.setLayerProgress(
        layerId,
        Math.round((index / features.length) * 100),
      );

      if (index < features.length) {
        setTimeout(processBatch, 0);
      } else {
        if (storeLayer) storeLayer.progress = 100;
      }
    };

    processBatch();
  };

  return { processLayer, layerRegistry };
}
