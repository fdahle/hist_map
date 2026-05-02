<template>
  <div class="map-container">
    <div id="map" ref="mapContainer" @contextmenu="handleMapContextMenu"></div>
    
    <!-- Map Context Menu -->
    <ContextMenuMap ref="mapContextMenuRef" :is-pins-open="props.isPinsOpen" />

    <!-- Scale bar rendered here so Vue scoped CSS applies cleanly -->
    <div ref="scalebarRef" class="scalebar-anchor" :style="{ bottom: showInfoBar ? '36px' : '8px' }"></div>

    <!-- Pin edit popup -->
    <div
      v-if="activePinId"
      class="pin-popup"
      :style="{ left: activePinScreenPos.x + 'px', top: activePinScreenPos.y + 'px' }"
      @click.stop
    >
      <div class="pin-popup-header">
        <span class="pin-popup-title">📌 Pin</span>
        <button class="pin-popup-close" @click="activePinId = null" title="Close">×</button>
      </div>
      <input
        ref="pinEditInputRef"
        v-model="activePinEditLabel"
        class="pin-popup-input"
        maxlength="80"
        @keydown.enter="savePinLabel"
        @keydown.escape="activePinId = null"
      />
      <div class="pin-popup-actions">
        <button class="pin-popup-btn pin-popup-save" @click="savePinLabel">Save</button>
        <button class="pin-popup-btn pin-popup-delete" @click="removeActivePin">Delete</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { onMounted, onUnmounted, inject, ref, watch, nextTick } from "vue";
import { storeToRefs } from "pinia";
import "ol/ol.css"; // OpenLayers CSS

import Map from "ol/Map";
import View from "ol/View";
import { fromLonLat, toLonLat } from "ol/proj";
import { defaults as defaultControls, ScaleLine } from "ol/control";
import { defaults as defaultInteractions } from "ol/interaction";
import Feature from "ol/Feature";
import { Point } from "ol/geom";
import VectorLayer from "ol/layer/Vector";
import VectorSource from "ol/source/Vector";
import { Style, Text, Fill, Stroke, Icon } from "ol/style";

import { registerCustomProjections } from "../../utils/crs";
import { useMapStore } from "../../stores/map/mapStore";
import { useLayerStore } from "../../stores/map/layerStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { useLayerManager } from "../../composables/useLayerManager";
import { usePinStore } from "../../stores/map/pinStore";
import { getMapPinIcon } from "../../constants/icons";
import ContextMenuMap from "../contextMenus/ContextMenuMap.vue";

const props = defineProps({
  isPinsOpen: { type: Boolean, default: false },
});

const configRef = inject("config");
const config = configRef.value;

// OSM background tile configs keyed by CRS — injected automatically when config.osm_background is true.
const _GBIF = {
  tileSize: 512,
  crs_options: {
    extent: [-12367396.2185, -12367396.2185, 12367396.2185, 12367396.2185],
    resolutions: [67733.469, 33866.734, 16933.367, 8466.684, 4233.342, 2116.671, 1058.335, 529.168, 264.584, 132.292],
  },
};
const OSM_BG_CONFIGS = {
  'EPSG:3031': { name: 'OSM Bright (Antarctic)', type: 'tile', visible: true, url: 'https://tile.gbif.org/3031/omt/{z}/{x}/{y}@1x.png?style=osm-bright-en', attribution: '© OpenStreetMap contributors, GBIF', ..._GBIF },
  'EPSG:3575': { name: 'OSM Bright (Arctic)',    type: 'tile', visible: true, url: 'https://tile.gbif.org/3575/omt/{z}/{x}/{y}@1x.png?style=osm-bright-en', attribution: '© OpenStreetMap contributors, GBIF', ..._GBIF },
  default:     { name: 'OpenStreetMap',           type: 'tile', visible: true, url: 'https://{a-c}.tile.openstreetmap.org/{z}/{x}/{y}.png', attribution: '© OpenStreetMap contributors' },
};
const layerManagerRef = inject("layerManager");
const mapStore = useMapStore();
const layerStore = useLayerStore();

const mapContainer = ref(null);
const mapContextMenuRef = ref(null);
const scalebarRef = ref(null);
const settingsStore = useSettingsStore();
const { showInfoBar } = storeToRefs(settingsStore);
const pinStore = usePinStore();
let map = null;
let layerManager = null;

// Pin edit popup state
const activePinId = ref(null);
const activePinEditLabel = ref('');
const activePinScreenPos = ref({ x: 0, y: 0 });
const pinEditInputRef = ref(null);

const savePinLabel = () => {
  if (activePinId.value) pinStore.updatePin(activePinId.value, activePinEditLabel.value);
  activePinId.value = null;
};

const removeActivePin = () => {
  if (activePinId.value) pinStore.removePin(activePinId.value);
  activePinId.value = null;
};

const handleMapContextMenu = (event) => {
  event.preventDefault();
  
  if (!map || !mapContextMenuRef.value) return;
  
  // Get the coordinate at the click position
  const pixel = map.getEventPixel(event);
  const coordinate = map.getCoordinateFromPixel(pixel);
  
  mapContextMenuRef.value.open(event, coordinate);
};

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

  // Restore map position from sessionStorage if available (persists across in-session route changes)
  const SESSION_POS_KEY = 'map_position';
  let initialZoom = config.view.zoom;
  try {
    const saved = sessionStorage.getItem(SESSION_POS_KEY);
    if (saved) {
      const { lng, lat, zoom: z } = JSON.parse(saved);
      centerProjected = fromLonLat([lng, lat], projectionCode);
      initialZoom = z;
    }
  } catch { /* ignore corrupt storage data */ }

  // 3. Get view extent if specified
  const viewExtent = config.view.extent || config.projection_params?.extent;

  // 3. Initialize Map
  map = new Map({
    target: mapContainer.value,
    controls: defaultControls({ zoom: false, attribution: false }),
    interactions: defaultInteractions({ shiftDragZoom: false }),
    layers: [], // Layers added via Manager
    view: new View({
      projection: projectionCode,
      center: centerProjected,
      zoom: initialZoom,
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

  // Save position to sessionStorage on every map move so it survives route changes
  map.on('moveend', () => {
    const v = map.getView();
    const c = v.getCenter();
    if (c) {
      const [lon, lat] = toLonLat(c, v.getProjection());
      sessionStorage.setItem(SESSION_POS_KEY, JSON.stringify({ lng: lon, lat, zoom: v.getZoom() }));
    }
  });

  // ---- Pin layer ----
  const PIN_COLOR = '#e63946';
  const createPinStyle = (label) => {
    const svgStr = getMapPinIcon(PIN_COLOR, 28, 36);
    const src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgStr);
    return new Style({
      image: new Icon({ src, anchor: [0.5, 1], anchorXUnits: 'fraction', anchorYUnits: 'fraction' }),
      text: new Text({
        text: label,
        offsetY: 8,
        font: 'bold 11px Segoe UI, sans-serif',
        fill: new Fill({ color: '#222' }),
        stroke: new Stroke({ color: '#fff', width: 3 }),
        textAlign: 'center',
        textBaseline: 'top',
      }),
    });
  };

  const pinSource = new VectorSource();
  const olPinLayer = new VectorLayer({ source: pinSource, zIndex: 1000 });
  map.addLayer(olPinLayer);

  const pinFeatureMap = new globalThis.Map();

  const syncPins = (pins) => {
    const currentIds = new Set(pins.map(p => p.id));
    for (const [id, f] of pinFeatureMap) {
      if (!currentIds.has(id)) { pinSource.removeFeature(f); pinFeatureMap.delete(id); }
    }
    for (const pin of pins) {
      if (pinFeatureMap.has(pin.id)) {
        const f = pinFeatureMap.get(pin.id);
        if (f.get('_pinLabel') !== pin.label) {
          f.set('_pinLabel', pin.label);
          f.setStyle(createPinStyle(pin.label));
        }
      } else {
        const f = new Feature({ geometry: new Point(pin.coordinate) });
        f.set('_pinId', pin.id);
        f.set('_pinLabel', pin.label);
        f.setStyle(createPinStyle(pin.label));
        pinSource.addFeature(f);
        pinFeatureMap.set(pin.id, f);
      }
    }
  };

  syncPins(pinStore.pins);
  watch(() => pinStore.pins, syncPins, { deep: true });

  // Change cursor when hovering a pin
  map.on('pointermove', (e) => {
    if (e.dragging) return;
    const hit = map.hasFeatureAtPixel(e.pixel, {
      layerFilter: l => l === olPinLayer,
      hitTolerance: 6,
    });
    map.getTargetElement().style.cursor = hit ? 'pointer' : '';
  });

  // Click to open edit popup
  map.on('singleclick', (e) => {
    let hitPin = false;
    map.forEachFeatureAtPixel(e.pixel, (feature) => {
      if (hitPin) return;
      const pinId = feature.get('_pinId');
      if (pinId) {
        hitPin = true;
        const pin = pinStore.pins.find(p => p.id === pinId);
        if (pin) {
          activePinId.value = pinId;
          activePinEditLabel.value = pin.label;
          activePinScreenPos.value = { x: e.pixel[0], y: e.pixel[1] - 110 };
          nextTick(() => pinEditInputRef.value?.focus());
        }
      }
    }, { hitTolerance: 6 });
    if (!hitPin) activePinId.value = null;
  });

  // Add scale bar into our own container div so Vue scoped CSS controls it
  map.addControl(new ScaleLine({ units: 'metric', target: scalebarRef.value }));

  // 4. Initialize Manager and load layers
  layerManager = useLayerManager(map);
  // Fill the shared ref so LayerPanel / SearchBar can see the manager
  layerManagerRef.value = layerManager;

  const promises = [];
  // OSM is treated as a regular base layer so it participates in the switcher's
  // radio group. osm_background_order controls its position among the basemaps.
  const osmPos = Math.min(config.osm_background_order ?? 0, (config.basemaps ?? []).length);
  if (config.osm_background) {
    const crsKey = (config.crs || 'EPSG:3857').trim().toUpperCase();
    const bgConf = { ...(OSM_BG_CONFIGS[crsKey] ?? OSM_BG_CONFIGS.default), order: osmPos };
    promises.push(layerManager.processLayer(bgConf, 'base'));
  }
  if (config.basemaps) {
    promises.push(
      ...config.basemaps.map((l, i) =>
        layerManager.processLayer({ ...l, order: i < osmPos ? i : i + 1 }, "base")
      )
    );
  }
  if (config.data_layers) {
    promises.push(
      ...config.data_layers.map((l) =>
        layerManager.processLayer(l, "overlay")
      )
    );
  }
  await Promise.all(promises);

  // 5. Setup Selection Interaction (now handled in layerManager)
  layerManager.setupSelection();
});

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

.scalebar-anchor {
  position: absolute;
  /* bottom is set reactively via :style to account for the InformationBar */
  left: 50%;
  transform: translateX(-50%);
  z-index: 999;
  pointer-events: none;
  transition: bottom 0.3s ease;
}

/* OL renders into scalebar-anchor; reset its default absolute positioning */
.scalebar-anchor :deep(.ol-scale-line) {
  position: static;
  display: inline-block;
  background: rgba(0, 0, 0, 0.45);
  border-radius: 4px 4px 0 0;
  padding: 2px 4px;
  left: unset;
  bottom: unset;
}

.scalebar-anchor :deep(.ol-scale-line-inner) {
  color: #fff;
  border: 1.5px solid rgba(255, 255, 255, 0.85);
  border-top: none;
  font-size: 10px;
  font-family: "Segoe UI", sans-serif;
  padding: 1px 5px;
  white-space: nowrap;
  text-align: center;
}

/* ---- Pin edit popup ---- */
.pin-popup {
  position: absolute;
  z-index: 1200;
  background: #fff;
  border: 1px solid #ccc;
  border-radius: 6px;
  box-shadow: 0 4px 16px rgba(0,0,0,0.22);
  padding: 10px 12px 8px;
  min-width: 190px;
  font-family: "Segoe UI", sans-serif;
  font-size: 13px;
  transform: translateX(-50%);
}

.pin-popup::after {
  content: '';
  position: absolute;
  bottom: -8px;
  left: 50%;
  transform: translateX(-50%);
  border: 8px solid transparent;
  border-top-color: #fff;
  border-bottom: none;
  filter: drop-shadow(0 2px 2px rgba(0,0,0,0.1));
}

.pin-popup-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}

.pin-popup-title {
  font-weight: 600;
  font-size: 12px;
  color: #444;
}

.pin-popup-close {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 16px;
  color: #888;
  padding: 0 2px;
  line-height: 1;
}
.pin-popup-close:hover { color: #333; }

.pin-popup-input {
  width: 100%;
  box-sizing: border-box;
  padding: 5px 7px;
  border: 1px solid #ccc;
  border-radius: 4px;
  font-size: 13px;
  font-family: "Segoe UI", sans-serif;
  outline: none;
  margin-bottom: 7px;
}
.pin-popup-input:focus { border-color: #3b82f6; box-shadow: 0 0 0 2px rgba(59,130,246,0.2); }

.pin-popup-actions {
  display: flex;
  gap: 6px;
}

.pin-popup-btn {
  flex: 1;
  padding: 4px 8px;
  border-radius: 4px;
  border: 1px solid transparent;
  font-size: 12px;
  cursor: pointer;
  font-family: "Segoe UI", sans-serif;
}
.pin-popup-save {
  background: #3b82f6;
  color: #fff;
  border-color: #2563eb;
}
.pin-popup-save:hover { background: #2563eb; }
.pin-popup-delete {
  background: #fff;
  color: #dc2626;
  border-color: #fca5a5;
}
.pin-popup-delete:hover { background: #fee2e2; }

/* Dark theme */
.theme-dark .pin-popup {
  background: #2a2a2a;
  border-color: #555;
  color: #e0e0e0;
}
.theme-dark .pin-popup::after { border-top-color: #2a2a2a; }
.theme-dark .pin-popup-input {
  background: #1e1e1e;
  border-color: #555;
  color: #e0e0e0;
}
.theme-dark .pin-popup-close { color: #aaa; }
.theme-dark .pin-popup-close:hover { color: #e0e0e0; }
.theme-dark .pin-popup-delete {
  background: #2a2a2a;
  border-color: #7f1d1d;
  color: #fca5a5;
}
.theme-dark .pin-popup-delete:hover { background: #3d1212; }
</style>