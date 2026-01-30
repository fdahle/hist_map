<template>
  <div class="map-container">
    <div id="map" ref="mapContainer"></div>
  </div>
</template>

<script setup>
import { onMounted, onUnmounted, inject, ref } from "vue";
import "ol/ol.css"; // OpenLayers CSS

import Map from "ol/Map";
import View from "ol/View";
import { fromLonLat } from "ol/proj";
import { defaults as defaultControls } from "ol/control";
import { Select } from "ol/interaction";
import { click } from "ol/events/condition";

import { registerCustomProjections } from "../constants/crs";
import { useMapStore } from "../stores/mapStore";
import { useSelectionStore } from "../stores/selectionStore";
import { useLayerStore } from "../stores/layerStore";
import { useLayerManager } from "../composables/useLayerManager";
import { Stroke, Style, Fill } from "ol/style";

const configRef = inject("config");
const config = configRef.value;
const mapStore = useMapStore();
const selectionStore = useSelectionStore();
const layerStore = useLayerStore();

const mapContainer = ref(null);
let map = null;
let layerManager = null;
let selectInteraction = null;

onMounted(async () => {
  if (!mapContainer.value) return;

  // 1. Register Projections (e.g. EPSG:3031)
  const projectionCode = registerCustomProjections(config);

  // 2. Determine Center
  let centerProjected;
  const centerValues = config.view.center;

  if (Math.abs(centerValues[0]) > 360 || Math.abs(centerValues[1]) > 360) {
    // Already in projected coordinates (meters)
    centerProjected = centerValues;
  } else {
    // Geographic coordinates [lon, lat] - transform them
    centerProjected = fromLonLat(centerValues, projectionCode);
  }

  // 3. Get view extent if specified
  const viewExtent = config.view.extent || config.projection_params?.extent;

  // 3. Initialize Map
  map = new Map({
    target: mapContainer.value,
    controls: defaultControls({ zoom: false, attribution: false }),
    layers: [], // Layers added via Manager
    view: new View({
      projection: projectionCode,
      center: centerProjected,
      zoom: config.view.zoom,
      minZoom: config.view.minZoom,
      maxZoom: config.view.maxZoom,
      extent: viewExtent,  // Constrain panning to this extent
      constrainResolution: true, // Force integer zoom levels
      showFullExtent: true  // Prevent panning outside extent
    }),
  });

  if (window.__APP_DEBUG__) {
    const view = map.getView();
    const proj = view.getProjection();
    console.debug("=== MAP DEBUG ===");
    console.debug("Projection Code:", proj.getCode());
    console.debug("Projection Extent:", proj.getExtent());
    console.debug("View Extent:", viewExtent);
    console.debug("Current Center:", view.getCenter());
    console.debug("Current Zoom:", view.getZoom());
  }

  mapStore.setMap(map);

  // 4. Initialize Manager and load layers
  layerManager = useLayerManager(map);

  const promises = [];
  if (config.base_layers) {
    promises.push(
      ...config.base_layers.map((l) => layerManager.processLayer(l, "base"))
    );
  }
  if (config.overlay_layers) {
    promises.push(
      ...config.overlay_layers.map((l) =>
        layerManager.processLayer(l, "overlay")
      )
    );
  }
  await Promise.all(promises);

  // 5. Setup Selection Interaction
  setupSelection();
});

const setupSelection = () => {
  // Highlight Style
  const highlightStyle = new Style({
    stroke: new Stroke({ color: "#FFFF00", width: 4 }),
    fill: new Fill({ color: "rgba(255, 255, 0, 0.3)" }),
    zIndex: 999,
  });

  selectInteraction = new Select({
    condition: click,
    style: highlightStyle,
  });

  selectInteraction.on("select", (e) => {
    const selected = e.selected[0];
    if (selected) {
      const properties = selected.getProperties();
      const { geometry, ...props } = properties;

      selectionStore.selectFeature({
        properties: props,
      });
    } else {
      selectionStore.clearSelection();
    }
  });

  map.addInteraction(selectInteraction);
};

// REMOVED: The deep watcher that was causing performance issues
// Layers are now added to the map immediately and only visibility is toggled

onUnmounted(() => {
  if (layerManager) layerManager.cleanup();
  if (map) map.setTarget(null);
});
</script>

<style scoped>
.map-container {
  width: 100%;
  height: 100%;
  position: absolute;
  top: 0;
  left: 0;
}
#map {
  width: 100%;
  height: 100%;
}
</style>