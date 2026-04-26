<template>
  <div class="ribbon-menu">
    <div class="ribbon-tabs">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        :class="['tab-btn', { active: activeTab === tab.id }]"
        @click="activeTab = tab.id"
      >
        {{ tab.label }}
      </button>

      <!-- Contextual layer tab – visible only when a layer is selected -->
      <template v-if="selectedLayer">
        <div class="ctx-tab-divider"></div>
        <button
          :class="['tab-btn', 'tab-btn--context', { active: activeTab === 'layer' }]"
          @click="activeTab = 'layer'"
          :title="'Layer: ' + selectedLayer.name"
        >
          <span class="ctx-tab-name">{{ selectedLayer.name }}</span>
          <span
            class="ctx-deselect"
            @click.stop="layerStore.deselectLayer()"
            title="Deselect layer"
            v-html="ICON_CLOSE_SM"
          ></span>
        </button>
      </template>
    </div>

    <div class="ribbon-content" :class="{ 'ctx-active': activeTab === 'layer' && selectedLayer }">
      <!-- Main Tab -->
      <div v-if="activeTab === 'main'" class="ribbon-panel">
        <div v-if="allowUpload" class="ribbon-group">
          <div class="ribbon-group-buttons">
            <button class="ribbon-btn" @click="fileInput.click()">
              <span class="btn-icon" v-html="ICON_ADD_LAYER"></span>
              <span class="btn-label">Add Layer</span>
            </button>
          </div>
          <span class="group-label">Import</span>
        </div>
        <div class="ribbon-group">
          <div class="ribbon-group-buttons">
            <button
              class="ribbon-btn"
              @click="$emit('share-scene')"
              title="Share or load a saved map scene"
            >
              <span class="btn-icon" v-html="ICON_SHARE"></span>
              <span class="btn-label">Share</span>
            </button>
          </div>
          <span class="group-label">Collaborate</span>
        </div>
        <div class="ribbon-group">
          <div class="ribbon-group-buttons">
            <button
              class="ribbon-btn"
              @click="saveMapImage"
              title="Save the current map view as a PNG image"
            >
              <span class="btn-icon" v-html="ICON_SAVE_IMAGE"></span>
              <span class="btn-label">Save Image</span>
            </button>
          </div>
          <span class="group-label">Export</span>
        </div>
      </div>

      <!-- View Tab -->
      <div v-if="activeTab === 'view'" class="ribbon-panel">
        <div v-if="allowViewer" class="ribbon-group">
          <div class="ribbon-group-buttons">
            <button
              class="ribbon-btn"
              @click="open3DViewer"
              title="Open the 3D viewer in a new tab"
            >
              <span class="btn-icon" v-html="ICON_3D"></span>
              <span class="btn-label">3D Scene</span>
            </button>
          </div>
          <span class="group-label">Viewer</span>
        </div>
        <div class="ribbon-group">
          <div class="ribbon-group-buttons">
            <button class="ribbon-btn" @click="fitAllLayers" title="Zoom to fit all loaded layers">
              <span class="btn-icon" v-html="ICON_FIT"></span>
              <span class="btn-label">Fit All</span>
            </button>
            <button class="ribbon-btn" @click="zoomIn" title="Zoom in">
              <span class="btn-icon" v-html="ICON_ZOOM_IN"></span>
              <span class="btn-label">Zoom In</span>
            </button>
            <button class="ribbon-btn" @click="zoomOut" title="Zoom out">
              <span class="btn-icon" v-html="ICON_ZOOM_OUT"></span>
              <span class="btn-label">Zoom Out</span>
            </button>
            <button class="ribbon-btn" @click="goToModalOpen = true" title="Go to a specific coordinate">
              <span class="btn-icon" v-html="ICON_GOTO"></span>
              <span class="btn-label">Go To</span>
            </button>
          </div>
          <span class="group-label">Navigate</span>
        </div>
        <div class="ribbon-group">
          <div class="ribbon-group-buttons">
            <button
              class="ribbon-btn"
              :class="{ active: isBookmarksOpen }"
              @click="$emit('toggle-bookmarks')"
              title="Open map bookmarks panel"
            >
              <span class="btn-icon" v-html="ICON_BOOKMARK_ADD"></span>
              <span class="btn-label">Bookmarks</span>
            </button>
          </div>
          <span class="group-label">Bookmarks</span>
        </div>
      </div>

      <!-- Tools Tab -->
      <div v-if="activeTab === 'tools'" class="ribbon-panel">
        <div class="ribbon-group">
          <div class="ribbon-group-buttons">
            <button
              class="ribbon-btn"
              :class="{ active: isMeasuringDistance }"
              @click="$emit('measure-distance')"
              title="Measure distance on the map"
            >
              <span class="btn-icon" v-html="ICON_DISTANCE"></span>
              <span class="btn-label">Distance</span>
            </button>
            <button
              class="ribbon-btn"
              :class="{ active: isMeasuringArea }"
              @click="$emit('measure-area')"
              title="Measure area on the map"
            >
              <span class="btn-icon" v-html="ICON_AREA"></span>
              <span class="btn-label">Area</span>
            </button>
          </div>
          <span class="group-label">Measure</span>
        </div>
        <div class="ribbon-group">
          <div class="ribbon-group-buttons">
            <button
              class="ribbon-btn"
              :class="{ active: isElevationOpen }"
              @click="$emit('elevation-profile')"
              title="Sample elevation along a drawn line"
            >
              <span class="btn-icon" v-html="ICON_ELEVATION"></span>
              <span class="btn-label">Elevation</span>
            </button>
            <button
              class="ribbon-btn"
              :class="{ active: isVolumeOpen }"
              @click="$emit('volume-calc')"
              title="Calculate cut/fill volume from a DEM"
            >
              <span class="btn-icon" v-html="ICON_VOLUME"></span>
              <span class="btn-label">Volume</span>
            </button>
          </div>
          <span class="group-label">Analyse</span>
        </div>
        <div class="ribbon-group">
          <div class="ribbon-group-buttons">
            <button
              class="ribbon-btn"
              :class="{ active: isPinsOpen }"
              @click="$emit('toggle-pins')"
              title="Manage map pins"
            >
              <span class="btn-icon" v-html="ICON_PIN"></span>
              <span class="btn-label">Pins{{ pinCount ? ` (${pinCount})` : '' }}</span>
            </button>
          </div>
          <span class="group-label">Annotate</span>
        </div>
        <div class="ribbon-group">
          <div class="ribbon-group-buttons">
            <button
              class="ribbon-btn"
              @click="$emit('extended-search')"
              title="Search through all attributes of a layer"
            >
              <span class="btn-icon" v-html="ICON_SEARCH_ADVANCED"></span>
              <span class="btn-label">Ext. Search</span>
            </button>
          </div>
          <span class="group-label">Search</span>
        </div>
      </div>
      <!-- Contextual Layer Tab -->
      <div v-if="activeTab === 'layer' && selectedLayer" class="ribbon-panel">
        <!-- Info (leftmost, own group) -->
        <div class="ribbon-group">
          <div class="ribbon-group-buttons">
            <button class="ribbon-btn" @click="showLayerInfo" title="View layer metadata">
              <span class="btn-icon" v-html="ICON_INFO"></span>
              <span class="btn-label">Info</span>
            </button>
          </div>
          <span class="group-label">Layer</span>
        </div>

        <template v-if="isLayerReady">
        <!-- Navigate -->
        <div class="ribbon-group">
          <div class="ribbon-group-buttons">
            <button class="ribbon-btn" @click="zoomToSelected" title="Zoom to selected layer">
              <span class="btn-icon" v-html="ICON_FIT"></span>
              <span class="btn-label">Zoom To</span>
            </button>
          </div>
          <span class="group-label">Navigate</span>
        </div>

        <!-- Opacity -->
        <div class="ribbon-group">
          <div class="ribbon-group-buttons">
            <div class="ctx-opacity-control">
              <span class="ctx-opacity-value">{{ Math.round(layerOpacity * 100) }}%</span>
              <input
                type="range"
                class="ctx-opacity-slider"
                min="0" max="1" step="0.01"
                :value="layerOpacity"
                @input="changeLayerOpacity($event.target.value)"
                title="Layer opacity"
              />
            </div>
          </div>
          <span class="group-label">Opacity</span>
        </div>

        <!-- Colormap – single-band raster layers only -->
        <div v-if="selectedLayer.type === 'geotiff' && selectedLayer.metadata?.bands === 1" class="ribbon-group">
          <div class="ribbon-group-buttons">
            <div class="ctx-colormap-control" ref="colormapControlRef">
              <button
                class="ctx-cm-trigger"
                :class="{ open: colormapDropdownOpen }"
                @click.stop="colormapDropdownOpen = !colormapDropdownOpen"
                title="Select colormap"
              >
                <span class="ctx-cm-preview" :style="{ background: getColormapGradient(selectedLayer) }"></span>
                <span class="ctx-cm-name">{{ getColormapLabel(selectedLayer) }}</span>
                <span class="ctx-cm-chevron" v-html="ICON_CHEVRON_DOWN"></span>
              </button>
              <button
                class="ctx-cm-invert-btn"
                :class="{ active: selectedLayer.colormapInverted }"
                @click="toggleColormapInvert"
                title="Invert colormap"
                v-html="ICON_INVERT"
              ></button>
              <div v-if="colormapDropdownOpen" class="ctx-cm-dropdown">
                <button
                  v-for="cm in COLORMAPS"
                  :key="cm.id"
                  class="ctx-cm-option"
                  :class="{ active: (selectedLayer.colormap ?? 'grayscale') === cm.id }"
                  @click="selectColormap(cm.id)"
                >
                  <span class="ctx-cm-option-name">{{ cm.label }}</span>
                  <span class="ctx-cm-option-bar" :style="{ background: cm.gradient }"></span>
                </button>
              </div>
            </div>
          </div>
          <span class="group-label">Colormap</span>
        </div>

        <!-- Style – vector layers only -->
        <div v-if="selectedLayer.type !== 'geotiff'" class="ribbon-group">
          <div class="ribbon-group-buttons">
            <div class="ctx-color-picker">
              <div class="ctx-color-grid">
                <button
                  v-for="c in COLOR_PRESETS"
                  :key="c"
                  class="ctx-color-dot"
                  :style="{ background: c }"
                  :class="{ active: selectedLayer.color === c }"
                  :title="c"
                  @click="changeLayerColor(c)"
                ></button>
              </div>
              <label class="ctx-color-custom-btn" title="Custom color">
                <span class="ctx-palette-icon" v-html="ICON_COLOR_PALETTE"></span>
                <span class="ctx-color-custom-label">Custom</span>
                <input
                  type="color"
                  :value="selectedLayer.color ?? '#000000'"
                  @change="changeLayerColor($event.target.value)"
                  @click.stop
                />
              </label>
            </div>
          </div>
          <span class="group-label">Color</span>
        </div>

        <!-- Export -->
        <div v-if="selectedLayer.layerInstance" class="ribbon-group">
          <div class="ribbon-group-buttons">
            <button
              class="ribbon-btn"
              @click="downloadLayer"
              :disabled="!allowDownload"
              :title="selectedLayer.type === 'geotiff' ? 'Download TIF file' : 'Download as GeoJSON'"
            >
              <span class="btn-icon" v-html="ICON_DOWNLOAD"></span>
              <span class="btn-label">Download</span>
            </button>
          </div>
          <span class="group-label">Export</span>
        </div>

        <!-- Remove – user-added layers only -->
        <div v-if="selectedLayer.isUserAdded" class="ribbon-group">
          <div class="ribbon-group-buttons">
            <button class="ribbon-btn ribbon-btn--danger" @click="removeSelected" title="Remove this layer">
              <span class="btn-icon" v-html="ICON_TRASH_CTX"></span>
              <span class="btn-label">Remove</span>
            </button>
          </div>
          <span class="group-label">Layer</span>
        </div>
        </template>
      </div>
    </div>

    <!-- Go To coordinate modal -->
    <Teleport to="body">
      <div v-if="goToModalOpen" class="goto-overlay" @click.self="goToModalOpen = false">
        <div class="goto-modal">
          <div class="goto-header">
            <span class="goto-title">Go To Coordinate</span>
            <button class="goto-close" @click="goToModalOpen = false" v-html="ICON_CLOSE_SM"></button>
          </div>
          <div class="goto-body">
            <label class="goto-label">
              X <span class="goto-hint">({{ crsName ?? 'map units' }})</span>
              <input
                class="goto-input"
                type="number"
                v-model="goToX"
                placeholder="e.g. 500000"
                @keyup.enter="executeGoTo"
                autofocus
              />
            </label>
            <label class="goto-label">
              Y <span class="goto-hint">({{ crsName ?? 'map units' }})</span>
              <input
                class="goto-input"
                type="number"
                v-model="goToY"
                placeholder="e.g. 200000"
                @keyup.enter="executeGoTo"
              />
            </label>
            <div v-if="goToWarning" class="goto-warning">⚠ {{ goToWarning }}</div>
          </div>
          <div class="goto-footer">
            <button
              class="goto-btn-secondary"
              @click="fillCurrentPosition"
              :disabled="goToLocating"
              title="Use your device's GPS location"
            >
              <span class="goto-curr-icon" v-html="ICON_CURRENT_POS"></span>
              {{ goToLocating ? 'Locating…' : 'My Location' }}
            </button>
            <button class="goto-btn-primary" @click="executeGoTo">Go</button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Hidden file input -->
    <input
      ref="fileInput"
      type="file"
      accept=".geojson,.json,.tif,.tiff,.geotiff,.csv"
      multiple
      style="display: none"
      @change="handleFileInput"
    />

    <!-- Layer Info Modal (used by contextual ribbon) -->
    <LayerInfoModal
      :is-visible="infoModalVisible"
      :title="infoModalTitle"
      :rows="infoModalRows"
      @close="infoModalVisible = false"
    />

    <!-- Export error modal -->
    <ExportErrorModal
      :is-visible="exportErrorVisible"
      @close="exportErrorVisible = false"
    />
  </div>
</template>

<script setup>
import { ref, computed, watch, inject, onUnmounted } from 'vue';
import { transform as olTransformCoord, get as olGetProjection } from 'ol/proj';
import { storeToRefs } from 'pinia';
import { useSettingsStore } from '@/stores/settingsStore';
import { useMapStore } from '@/stores/map/mapStore';
import { useLayerStore } from '@/stores/map/layerStore';
import { usePinStore } from '@/stores/map/pinStore';
import { LAYER_STATUS } from '@/constants/layerConstants.js';
import { ICON_FIT, ICON_DISTANCE, ICON_AREA, ICON_ELEVATION, ICON_VOLUME, ICON_3D, ICON_SHARE, ICON_INFO, ICON_SAVE_IMAGE, ICON_BOOKMARK_ADD } from '@/constants/icons';
import { COLORMAPS } from '@/constants/colormaps.js';
import LayerInfoModal from '../modals/LayerInfoModal.vue';
import ExportErrorModal from '../modals/ExportErrorModal.vue';
import GeoJSON from 'ol/format/GeoJSON';

const props = defineProps({
  isMeasuringDistance: { type: Boolean, default: false },
  isMeasuringArea:     { type: Boolean, default: false },
  isElevationOpen:     { type: Boolean, default: false },
  isVolumeOpen:        { type: Boolean, default: false },
  isPinsOpen:          { type: Boolean, default: false },
  isBookmarksOpen:     { type: Boolean, default: false },
});

const emit = defineEmits(['add-files', 'measure-distance', 'measure-area', 'elevation-profile', 'volume-calc', 'share-scene', 'extended-search', 'toggle-pins', 'toggle-bookmarks']);

const settingsStore = useSettingsStore();
const mapStore = useMapStore();
const layerStore = useLayerStore();
const pinStore = usePinStore();
const { crsName } = storeToRefs(mapStore);
const pinCount = computed(() => pinStore.pins.length);
const layerManager = inject('layerManager');
const appConfig = inject('config');
const allowDownload = computed(() => appConfig?.value?.ui?.map_download !== false);
const allowUpload   = computed(() => appConfig?.value?.ui?.map_upload   !== false);
const allowViewer   = computed(() => appConfig?.value?.ui?.viewer_access !== false);

const activeTab = ref('main');
const fileInput = ref(null);

const tabs = [
  { id: 'main',   label: 'Main'   },
  { id: 'view',   label: 'View'   },
  { id: 'tools',  label: 'Tools'  },
];

// ---- Contextual layer tab ----
const selectedLayer = computed(() => {
  if (!layerStore.selectedLayerId) return null;
  return layerStore.layers.find(l => l._layerId === layerStore.selectedLayerId) ?? null;
});

// Layer is considered valid/loaded when fully ready and CRS-compatible
const isLayerReady = computed(() =>
  !!selectedLayer.value &&
  selectedLayer.value.status === LAYER_STATUS.READY &&
  selectedLayer.value.crsCompatible !== false
);

// Auto-switch to layer tab on selection; return to layers tab on deselect
watch(() => layerStore.selectedLayerId, (newId) => {
  if (newId) {
    activeTab.value = 'layer';
  } else if (activeTab.value === 'layer') {
    activeTab.value = 'main';
  }
});

const COLOR_PRESETS = ['#e63946', '#007bff', '#2a9d8f', '#e9c46a'];

// ---- Export error modal ----
const exportErrorVisible = ref(false);

// ---- Layer info modal ----
const infoModalVisible = ref(false);
const infoModalTitle  = ref('');
const infoModalRows   = ref([]);

const GEOM_LABELS = { point: 'Point', line: 'Line', polygon: 'Polygon', raster: 'Raster', unknown: 'Unknown' };
const TYPE_LABELS = { geojson: 'GeoJSON', geotiff: 'GeoTIFF', wms: 'WMS', wmts: 'WMTS', tile: 'Tile' };

// ---- Contextual icons ----
const ICON_CLOSE_SM      = `<svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>`;
const ICON_GOTO          = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/><path d="M12 9V5.5M12 15v3.5M9 12H5.5M15 12h3.5" stroke-width="1" opacity="0.4"/></svg>`;
const ICON_CURRENT_POS   = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/></svg>`;
const ICON_DOWNLOAD      = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`;
const ICON_TRASH_CTX     = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>`;
const ICON_COLOR_PALETTE = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="8" cy="10" r="1.2" fill="currentColor" stroke="none"/><circle cx="12" cy="8" r="1.2" fill="currentColor" stroke="none"/><circle cx="16" cy="10" r="1.2" fill="currentColor" stroke="none"/><circle cx="16" cy="14" r="1.2" fill="currentColor" stroke="none"/><circle cx="8" cy="14" r="1.2" fill="currentColor" stroke="none"/><path d="M12 18c-1.5 0-3-1-3-3a3 3 0 016 0c0 2-1.5 3-3 3z" fill="currentColor" stroke="none" opacity="0.4"/></svg>`;
const ICON_CHEVRON_DOWN = `<svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>`;
const ICON_INVERT       = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor" stroke="none"/></svg>`;

// ---- Icons ----
const ICON_ADD_LAYER = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/><circle cx="19" cy="5" r="4" fill="#28a745" stroke="none"/><path d="M17 5h4M19 3v4" stroke="white" stroke-width="1.8"/></svg>`;
const ICON_PIN       = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5"/></svg>`;
const ICON_ZOOM_IN   = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>`;
const ICON_ZOOM_OUT  = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/></svg>`;
const ICON_SEARCH_ADVANCED = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/><line x1="11" y1="8" x2="11" y2="14"/><circle cx="17" cy="6" r="3" fill="#3b82f6" stroke="none"/><path d="M16 6h2M17 5v2" stroke="white" stroke-width="1.4"/></svg>`;

// ---- Go To modal ----
const goToModalOpen = ref(false);
const goToX = ref('');
const goToY = ref('');
const goToWarning = ref('');
const goToLocating = ref(false);

const fillCurrentPosition = () => {
  goToWarning.value = '';
  if (!navigator.geolocation) {
    goToWarning.value = 'Geolocation is not supported by your browser.';
    return;
  }
  goToLocating.value = true;
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      goToLocating.value = false;
      const lon = pos.coords.longitude;
      const lat = pos.coords.latitude;
      const map = mapStore.getMap();
      const mapCrs = map?.getView().getProjection().getCode() ?? 'EPSG:3857';
      let projected;
      try {
        projected = olTransformCoord([lon, lat], 'EPSG:4326', mapCrs);
      } catch {
        goToWarning.value = `Could not convert your location to ${mapCrs}.`;
        return;
      }
      // Out-of-bounds check against the projection's declared extent (if any)
      const proj = olGetProjection(mapCrs);
      const extent = proj?.getExtent();
      if (extent) {
        const [minX, minY, maxX, maxY] = extent;
        if (projected[0] < minX || projected[0] > maxX || projected[1] < minY || projected[1] > maxY) {
          goToWarning.value = `Your location (${lat.toFixed(2)}°, ${lon.toFixed(2)}°) is outside the valid area for ${mapCrs}. Coordinates filled anyway.`;
        }
      }
      goToX.value = Math.round(projected[0]).toString();
      goToY.value = Math.round(projected[1]).toString();
    },
    (err) => {
      goToLocating.value = false;
      goToWarning.value = err.code === 1
        ? 'Location access was denied. Please allow it in your browser settings.'
        : 'Could not determine your location.';
    },
    { timeout: 10000, maximumAge: 30000 }
  );
};

const executeGoTo = () => {
  const x = parseFloat(goToX.value);
  const y = parseFloat(goToY.value);
  if (!isFinite(x) || !isFinite(y)) return;
  const map = mapStore.getMap();
  if (!map) return;
  map.getView().animate({ center: [x, y], duration: 600 });
  goToModalOpen.value = false;
  goToWarning.value = '';
};

// ---- Map navigation ----
const fitAllLayers = () => {
  const map = mapStore.getMap();
  if (!map) return;
  const overlays = layerStore.layers.filter(l => l.category === 'overlay' && l.active);
  if (overlays.length === 0) {
    map.getView().animate({ zoom: 2, duration: 600 });
    return;
  }
  import('ol/extent').then(({ createEmpty, extend, isEmpty }) => {
    const combined = createEmpty();
    for (const layer of overlays) {
      const source = layer.layerInstance?.getSource?.();
      if (!source) continue;
      const ext = typeof source.getExtent === 'function' ? source.getExtent() : null;
      if (ext && !isEmpty(ext)) extend(combined, ext);
    }
    if (!isEmpty(combined)) {
      map.getView().fit(combined, { padding: [60, 60, 60, 60], duration: 800, maxZoom: 18 });
    }
  });
};

const zoomIn = () => {
  const map = mapStore.getMap();
  if (!map) return;
  const view = map.getView();
  view.animate({ zoom: (view.getZoom() ?? 2) + 1, duration: 300 });
};

const zoomOut = () => {
  const map = mapStore.getMap();
  if (!map) return;
  const view = map.getView();
  view.animate({ zoom: (view.getZoom() ?? 2) - 1, duration: 300 });
};

// ---- Save map image ----
const saveMapImage = () => {
  const map = mapStore.getMap();
  if (!map) return;
  map.once('rendercomplete', () => {
    const size = map.getSize();
    const composite = document.createElement('canvas');
    composite.width = size[0];
    composite.height = size[1];
    const ctx = composite.getContext('2d');
    let drawnCount = 0;
    map.getTargetElement().querySelectorAll('.ol-layer canvas, canvas.ol-layer').forEach((canvas) => {
      if (canvas.width === 0) return;
      // Test for tainted canvas (cross-origin tiles without CORS headers).
      // Draw into a throwaway canvas and call toDataURL(); some browsers only
      // throw on toDataURL() rather than on drawImage() itself.
      const probe = document.createElement('canvas');
      probe.width = 1;
      probe.height = 1;
      try {
        probe.getContext('2d').drawImage(canvas, 0, 0);
        probe.toDataURL();
      } catch {
        return;
      }
      const opacity = parseFloat(canvas.parentNode.style.opacity ?? '1');
      ctx.globalAlpha = isFinite(opacity) ? opacity : 1;
      const transform = canvas.style.transform;
      const matrix = transform.match(/^matrix\((.+)\)$/)?.[1].split(',').map(Number);
      if (matrix) {
        ctx.setTransform(...matrix);
      } else {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
      }
      ctx.drawImage(canvas, 0, 0);
      drawnCount++;
    });
    ctx.globalAlpha = 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (drawnCount === 0) {
      exportErrorVisible.value = true;
      return;
    }
    try {
      const link = document.createElement('a');
      link.download = 'map.png';
      link.href = composite.toDataURL();
      link.click();
    } catch {
      exportErrorVisible.value = true;
    }
  });
  map.renderSync();
};

// ---- File input ----
const open3DViewer = () => window.open('/viewer', '_blank');

const handleFileInput = (event) => {
  const files = Array.from(event.target.files ?? []);
  if (files.length) emit('add-files', files);
  event.target.value = '';
};

// ---- Contextual layer actions ----
const zoomToSelected = () => {
  const layer = selectedLayer.value;
  if (!layer?.layerInstance) return;
  const map = mapStore.getMap();
  if (!map) return;
  const source = layer.layerInstance.getSource?.();
  if (!source) return;
  if (layer.type === 'geotiff') {
    source.getView().then((viewInfo) => {
      if (viewInfo?.extent) map.getView().fit(viewInfo.extent, { padding: [50,50,50,50], duration: 800 });
    }).catch(() => {});
  } else {
    const ext = source.getExtent?.();
    if (ext && ext[0] !== Infinity) map.getView().fit(ext, { padding: [50,50,50,50], duration: 800 });
  }
};

const showLayerInfo = () => {
  const layer = selectedLayer.value;
  if (!layer) return;
  const rows = [];
  rows.push({ key: 'Name', value: layer.name });
  rows.push({ key: 'Type', value: TYPE_LABELS[layer.type] || layer.type });
  if (layer.geometryType) rows.push({ key: 'Geometry', value: GEOM_LABELS[layer.geometryType] || layer.geometryType });
  if (layer.crsCompatible !== null) rows.push({ key: 'CRS match', value: layer.crsCompatible ? 'Yes' : 'No' });

  // Layer CRS — always shown, even when not detected
  const layerCrs = layer.metadata?.tiffProjection ?? layer.metadata?.sourceCrs ?? layer.sourceCrs ?? null;
  rows.push({ key: 'Layer CRS', value: layerCrs ?? '—' });

  if (layer.layerInstance) {
    const source = layer.layerInstance.getSource?.();
    if (source?.getFeatures) rows.push({ key: 'Features', value: source.getFeatures().length.toLocaleString() });
    // Vector source extent from OL (not used for geotiff — see below)
    if (layer.type !== 'geotiff') {
      try {
        const ext = source?.getExtent?.();
        if (ext && ext[0] !== Infinity) {
          rows.push({ key: 'Min X', value: ext[0].toFixed(2) });
          rows.push({ key: 'Min Y', value: ext[1].toFixed(2) });
          rows.push({ key: 'Max X', value: ext[2].toFixed(2) });
          rows.push({ key: 'Max Y', value: ext[3].toFixed(2) });
        }
      } catch (_) {}
    }
  }
  // GeoTIFF extent is set by the worker and doesn't require a live layerInstance
  if (layer.type === 'geotiff' && layer.metadata?.extent) {
    const [minX, minY, maxX, maxY] = layer.metadata.extent;
    rows.push({ key: 'Min X', value: minX.toFixed(4) });
    rows.push({ key: 'Min Y', value: minY.toFixed(4) });
    rows.push({ key: 'Max X', value: maxX.toFixed(4) });
    rows.push({ key: 'Max Y', value: maxY.toFixed(4) });
  }

  // URL placed last
  if (layer.url) rows.push({ key: 'URL', value: layer.url });

  infoModalTitle.value = layer.name;
  infoModalRows.value  = rows;
  infoModalVisible.value = true;
};

const downloadLayer = async () => {
  const layer = selectedLayer.value;
  if (!layer?.layerInstance) return;
  if (layer.type === 'geotiff') {
    // Fetch the file as a blob first so the download attribute works regardless
    // of whether the URL is cross-origin (blob: and data: URLs are always same-origin).
    try {
      const resp = await fetch(layer.url);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const blob = await resp.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = `${layer.name}.tif`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(blobUrl), 10_000);
    } catch (e) {
      // Fallback: open in new tab
      window.open(layer.url, '_blank');
    }
  } else {
    const source = layer.layerInstance.getSource?.();
    if (!source) return;
    const map = mapStore.getMap();
    const projection = map?.getView().getProjection();
    const fmt = new GeoJSON();
    const obj = fmt.writeFeaturesObject(source.getFeatures(), { dataProjection: 'EPSG:4326', featureProjection: projection });
    const a = document.createElement('a');
    a.href = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(obj));
    a.download = `${layer.name}.json`;
    document.body.appendChild(a); a.click(); a.remove();
  }
};

const changeLayerColor = (color) => {
  const layer = selectedLayer.value;
  if (!layer) return;
  layerStore.updateLayerColor(layer._layerId, color);
  layerManager?.value?.applyLayerColor(layer._layerId);
};

const changeLayerColormap = (colormapId) => {
  const layer = selectedLayer.value;
  if (!layer) return;
  layerStore.updateLayerColormap(layer._layerId, colormapId);
  layerManager?.value?.applyLayerColormap(layer._layerId, colormapId);
};

// ---- Colormap dropdown ----
const colormapControlRef = ref(null);
const colormapDropdownOpen = ref(false);

const getColormapLabel = (layer) => {
  const cm = COLORMAPS.find(c => c.id === (layer.colormap ?? 'grayscale'));
  return cm?.label ?? 'Gray';
};

const getColormapGradient = (layer) => {
  const cm = COLORMAPS.find(c => c.id === (layer.colormap ?? 'grayscale'));
  const grad = cm?.gradient ?? COLORMAPS[0].gradient;
  if (!layer.colormapInverted) return grad;
  // Reverse CSS gradient stops for preview
  const match = grad.match(/^linear-gradient\(to right,\s*(.*)\)$/);
  if (!match) return grad;
  const stops = match[1].split(',').map(s => s.trim()).reverse();
  return `linear-gradient(to right, ${stops.join(', ')})`;
};

const selectColormap = (id) => {
  changeLayerColormap(id);
  colormapDropdownOpen.value = false;
};

const toggleColormapInvert = () => {
  const layer = selectedLayer.value;
  if (!layer) return;
  const newInverted = !(layer.colormapInverted ?? false);
  layerStore.updateLayerColormapInverted(layer._layerId, newInverted);
  layerManager?.value?.applyLayerColormap(layer._layerId, layer.colormap ?? 'grayscale');
};

const handleDocClick = (e) => {
  if (colormapControlRef.value && !colormapControlRef.value.contains(e.target)) {
    colormapDropdownOpen.value = false;
  }
};

watch(colormapDropdownOpen, (open) => {
  if (open) setTimeout(() => document.addEventListener('click', handleDocClick), 0);
  else document.removeEventListener('click', handleDocClick);
});

onUnmounted(() => document.removeEventListener('click', handleDocClick));

// Close dropdown when layer changes
watch(selectedLayer, () => { colormapDropdownOpen.value = false; });

// ---- Opacity ----
const layerOpacity = ref(1);

watch(selectedLayer, (layer) => {
  layerOpacity.value = layer?.layerInstance?.getOpacity() ?? 1;
}, { immediate: true });

const changeLayerOpacity = (val) => {
  const layer = selectedLayer.value;
  if (!layer?.layerInstance) return;
  const num = parseFloat(val);
  layer.layerInstance.setOpacity(num);
  layerOpacity.value = num;
};

const removeSelected = () => {
  const layer = selectedLayer.value;
  if (!layer) return;
  if (!confirm(`Remove "${layer.name}"? This cannot be undone.`)) return;
  layerManager?.value?.removeLayer(layer._layerId);
  layerStore.deselectLayer();
};
</script>

<style scoped>
.ribbon-menu {
  background: #fff;
  border-bottom: 1px solid #ddd;
  z-index: 3000;
  font-family: "Segoe UI", sans-serif;
  user-select: none;
  flex-shrink: 0;
}

.theme-dark .ribbon-menu {
  background: #2a2a2a;
  border-bottom: 1px solid #444;
}

.ribbon-tabs {
  display: flex;
  background: #343a40;
  padding: 0;
  min-height: 28px;
}

.theme-dark .ribbon-tabs {
  background: #1a1a1a;
}

.tab-btn {
  padding: 4px 18px;
  border: none;
  background: none;
  cursor: pointer;
  font-family: "Segoe UI", sans-serif;
  font-size: 12px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.7);
  border-bottom: 2px solid transparent;
  transition: all 0.15s;
}

.tab-btn:hover {
  color: #fff;
  background: rgba(255, 255, 255, 0.08);
}

.tab-btn.active {
  background: #f8f9fa;
  color: #333;
  border-bottom-color: #3b82f6;
}

.theme-dark .tab-btn.active {
  background: #2a2a2a;
  color: #e0e0e0;
}

.ribbon-content {
  padding: 0 6px;
  height: 64px;
  background: #f8f9fa;
  display: flex;
  align-items: stretch;
  position: relative;
}

.theme-dark .ribbon-content {
  background: #2a2a2a;
}

.ribbon-panel {
  display: flex;
  gap: 0;
  height: 100%;
  align-items: stretch;
}

.ribbon-group {
  display: flex;
  flex-direction: column;
  padding: 0;
  height: 100%;
  border-right: 1px solid #ddd;
  position: relative;
}

.theme-dark .ribbon-group {
  border-right: 1px solid #444;
}

.ribbon-group:last-child {
  border-right: none;
}

.ribbon-group-buttons {
  display: flex;
  flex-direction: row;
  gap: 1px;
  padding: 4px 10px 0;
  flex: 1;
  align-items: flex-start;
}

.group-label {
  display: block;
  font-size: 10px;
  color: #888;
  font-weight: 400;
  text-align: center;
  padding: 0 10px 3px;
  white-space: nowrap;
}

.theme-dark .group-label {
  color: #999;
}

.ribbon-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  padding: 4px 8px;
  border: 1px solid transparent;
  background: transparent;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.15s;
  min-width: 48px;
  height: 44px;
  color: #444;
}

.theme-dark .ribbon-btn {
  color: #ccc;
}

.ribbon-btn:hover {
  background: #fff;
  border-color: #ddd;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
}

.theme-dark .ribbon-btn:hover {
  background: #3a3a3a;
  border-color: #555;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
}

.ribbon-btn.active {
  background: #e8f0fe;
  border-color: #c7ddf9;
  color: #3b82f6;
}

.theme-dark .ribbon-btn.active {
  background: rgba(74, 158, 255, 0.15);
  border-color: rgba(74, 158, 255, 0.3);
  color: #4a9eff;
}

.ribbon-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.ribbon-btn:disabled:hover {
  background: transparent;
  border-color: transparent;
  box-shadow: none;
}

.theme-dark .ribbon-btn:disabled:hover {
  background: transparent;
  border-color: transparent;
  box-shadow: none;
}

.btn-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  color: inherit;
}

.btn-icon :deep(svg) {
  width: 18px;
  height: 18px;
}

.btn-label {
  font-family: "Segoe UI", sans-serif;
  font-size: 10px;
  font-weight: 400;
  color: inherit;
  line-height: 1;
  white-space: nowrap;
}

/* ---- Contextual tab ---- */
.ctx-tab-divider {
  width: 1px;
  background: rgba(255, 255, 255, 0.18);
  margin: 4px 6px;
  flex-shrink: 0;
}

.tab-btn--context {
  display: flex;
  align-items: center;
  gap: 5px;
  color: #f59e0b !important;
  border-bottom-color: transparent;
  position: relative;
  z-index: 1;
}

.tab-btn--context:hover {
  background: rgba(245, 158, 11, 0.15) !important;
}

.tab-btn--context.active {
  background: #f8f9fa !important;
  color: #b45309 !important;
  border-bottom-color: #f59e0b !important;
}

.theme-dark .tab-btn--context.active {
  background: #2a2a2a !important;
  color: #f59e0b !important;
}

.ctx-tab-name {
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ctx-deselect {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  flex-shrink: 0;
  opacity: 0.55;
  transition: opacity 0.15s, background 0.15s;
}

.ctx-deselect:hover {
  opacity: 1;
  background: rgba(0, 0, 0, 0.15);
}

/* Contextual ribbon content accent */
.ribbon-content.ctx-active::after {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  background: #f59e0b;
  z-index: 1;
  pointer-events: none;
}

/* Color picker row in ribbon */
.ctx-color-picker {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 100%;
}

.ctx-color-grid {
  display: grid;
  grid-template-columns: repeat(2, 18px);
  gap: 4px;
  flex-shrink: 0;
}

.ctx-color-dot {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 1.5px solid transparent;
  cursor: pointer;
  padding: 0;
  flex-shrink: 0;
  transition: transform 0.12s, border-color 0.12s;
}

.ctx-color-dot:hover {
  transform: scale(1.25);
  border-color: rgba(0, 0, 0, 0.35);
}

.ctx-color-dot.active {
  border-color: #333;
  box-shadow: 0 0 0 1px #fff inset;
}

.theme-dark .ctx-color-dot.active {
  border-color: #fff;
  box-shadow: 0 0 0 1px #333 inset;
}

.ctx-color-custom-btn {
  width: 44px;
  height: 44px;
  border-radius: 6px;
  border: 1px solid transparent;
  background: transparent;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1px;
  cursor: pointer;
  position: relative;
  overflow: hidden;
  flex-shrink: 0;
  transition: background 0.15s, border-color 0.15s;
  outline: none;
}

.ctx-color-custom-btn:focus,
.ctx-color-custom-btn:focus-within {
  outline: none;
  box-shadow: none;
}

.ctx-color-custom-btn:hover {
  background: #fff;
  border-color: #ddd;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
}

.theme-dark .ctx-color-custom-btn {
  background: transparent;
}

.theme-dark .ctx-color-custom-btn:hover {
  background: #3a3a3a;
  border-color: #555;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
}

.ctx-palette-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  z-index: 1;
  color: #666;
}

.theme-dark .ctx-palette-icon {
  color: #aaa;
}

.ctx-color-custom-label {
  font-family: "Segoe UI", sans-serif;
  font-size: 9px;
  color: #666;
  line-height: 1;
  pointer-events: none;
  position: relative;
  z-index: 1;
}

.theme-dark .ctx-color-custom-label {
  color: #aaa;
}

.ctx-color-custom-btn input[type="color"] {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
  width: 100%;
  height: 100%;
  padding: 0;
  border: none;
  outline: none;
  appearance: none;
  -webkit-appearance: none;
}

/* Danger button for Remove */
.ribbon-btn--danger {
  color: #dc2626 !important;
}

/* Opacity slider in ribbon */
.ctx-opacity-control {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 4px;
  padding: 2px 2px 0;
}

.ctx-opacity-value {
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  color: #555;
  min-width: 32px;
  text-align: center;
  line-height: 1;
}

.theme-dark .ctx-opacity-value {
  color: #aaa;
}

.ctx-opacity-slider {
  -webkit-appearance: none;
  appearance: none;
  width: 88px;
  height: 4px;
  border-radius: 2px;
  background: #d1d5db;
  outline: none;
  cursor: pointer;
  flex-shrink: 0;
}

.theme-dark .ctx-opacity-slider {
  background: #555;
}

.ctx-opacity-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #3b82f6;
  cursor: pointer;
  border: 2px solid #fff;
  box-shadow: 0 1px 3px rgba(0,0,0,0.25);
}

.ctx-opacity-slider::-moz-range-thumb {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #3b82f6;
  cursor: pointer;
  border: 2px solid #fff;
  box-shadow: 0 1px 3px rgba(0,0,0,0.25);
}

/* ---- Go To modal ---- */
.goto-overlay {
  position: fixed;
  inset: 0;
  z-index: 3000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.35);
  backdrop-filter: blur(2px);
}

.goto-modal {
  background: #fff;
  border-radius: 10px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.22);
  width: 280px;
  overflow: hidden;
  font-family: "Segoe UI", sans-serif;
}

.theme-dark .goto-modal {
  background: #2a2a2a;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.55);
}

.goto-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px 10px;
  border-bottom: 1px solid #eee;
}

.theme-dark .goto-header {
  border-bottom-color: #444;
}

.goto-title {
  font-size: 13px;
  font-weight: 600;
  color: #222;
}

.theme-dark .goto-title {
  color: #e0e0e0;
}

.goto-close {
  background: none;
  border: none;
  cursor: pointer;
  padding: 2px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  color: #888;
  transition: color 0.15s;
}

.goto-close:hover {
  color: #333;
}

.theme-dark .goto-close:hover {
  color: #fff;
}

.goto-body {
  padding: 14px 14px 10px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.goto-label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  font-weight: 600;
  color: #555;
}

.theme-dark .goto-label {
  color: #aaa;
}

.goto-hint {
  font-size: 10px;
  font-weight: 400;
  color: #999;
  display: inline;
  margin-left: 4px;
}

.goto-input {
  padding: 6px 10px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 13px;
  font-family: monospace;
  color: #222;
  background: #fafafa;
  outline: none;
  transition: border-color 0.15s;
  width: 100%;
  box-sizing: border-box;
}

.goto-input:focus {
  border-color: #3b82f6;
  background: #fff;
}

.theme-dark .goto-input {
  background: #1e1e1e;
  border-color: #555;
  color: #e0e0e0;
}

.theme-dark .goto-input:focus {
  border-color: #4a9eff;
  background: #252525;
}

.goto-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px 14px;
  gap: 8px;
}

.goto-btn-secondary {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 6px 10px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  background: transparent;
  font-size: 11px;
  color: #555;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
  font-family: "Segoe UI", sans-serif;
}

.goto-btn-secondary:hover {
  background: #f3f4f6;
  border-color: #9ca3af;
}

.theme-dark .goto-btn-secondary {
  border-color: #555;
  color: #aaa;
}

.theme-dark .goto-btn-secondary:hover {
  background: #3a3a3a;
  border-color: #777;
}

.goto-curr-icon {
  display: flex;
  align-items: center;
}

.goto-warning {
  font-size: 11px;
  color: #b45309;
  background: #fef3c7;
  border: 1px solid #fcd34d;
  border-radius: 5px;
  padding: 6px 8px;
  line-height: 1.4;
}

.theme-dark .goto-warning {
  background: rgba(251, 191, 36, 0.12);
  border-color: rgba(251, 191, 36, 0.35);
  color: #fcd34d;
}

.goto-btn-secondary:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.goto-btn-primary {
  margin-left: auto;
  padding: 7px 22px;
  border: none;
  border-radius: 6px;
  background: #3b82f6;
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  font-family: "Segoe UI", sans-serif;
  cursor: pointer;
  transition: background 0.15s;
}

.goto-btn-primary:hover {
  background: #2563eb;
}

.ribbon-btn--danger:hover {
  background: #fee2e2 !important;
  border-color: #fca5a5 !important;
}

.theme-dark .ribbon-btn--danger {
  color: #f87171 !important;
}

.theme-dark .ribbon-btn--danger:hover {
  background: rgba(220, 38, 38, 0.15) !important;
  border-color: rgba(248, 113, 113, 0.3) !important;
}

/* Colormap control (dropdown trigger + invert btn) */
.ctx-colormap-control {
  display: flex;
  align-items: center;
  gap: 3px;
  height: 100%;
  position: relative;
}

.ctx-cm-trigger {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 3px 6px;
  height: 36px;
  border: 1px solid #d1d5db;
  border-radius: 5px;
  background: #fff;
  cursor: pointer;
  transition: border-color 0.15s, box-shadow 0.15s;
  min-width: 140px;
}

.ctx-cm-trigger:hover,
.ctx-cm-trigger.open {
  border-color: #3b82f6;
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.15);
}

.theme-dark .ctx-cm-trigger {
  background: #1e1e1e;
  border-color: #555;
  color: #e0e0e0;
}

.theme-dark .ctx-cm-trigger:hover,
.theme-dark .ctx-cm-trigger.open {
  border-color: #4a9eff;
  box-shadow: 0 0 0 2px rgba(74, 158, 255, 0.15);
}

.ctx-cm-preview {
  width: 44px;
  height: 14px;
  border-radius: 3px;
  flex-shrink: 0;
}

.ctx-cm-name {
  font-size: 11px;
  font-family: "Segoe UI", sans-serif;
  color: #333;
  flex: 1;
  text-align: left;
  white-space: nowrap;
}

.theme-dark .ctx-cm-name {
  color: #e0e0e0;
}

.ctx-cm-chevron {
  display: flex;
  align-items: center;
  color: #888;
  flex-shrink: 0;
}

.ctx-cm-invert-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: 1px solid #d1d5db;
  border-radius: 5px;
  background: transparent;
  cursor: pointer;
  color: #666;
  transition: background 0.15s, border-color 0.15s, color 0.15s;
  flex-shrink: 0;
}

.ctx-cm-invert-btn:hover {
  background: #fff;
  border-color: #9ca3af;
  color: #333;
}

.ctx-cm-invert-btn.active {
  background: #e8f0fe;
  border-color: #3b82f6;
  color: #3b82f6;
}

.theme-dark .ctx-cm-invert-btn {
  border-color: #555;
  color: #aaa;
}

.theme-dark .ctx-cm-invert-btn:hover {
  background: #3a3a3a;
  border-color: #777;
  color: #e0e0e0;
}

.theme-dark .ctx-cm-invert-btn.active {
  background: rgba(74, 158, 255, 0.15);
  border-color: #4a9eff;
  color: #4a9eff;
}

/* Dropdown panel */
.ctx-cm-dropdown {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  z-index: 2500;
  background: #fff;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  box-shadow: 0 6px 20px rgba(0,0,0,0.14);
  padding: 4px;
  min-width: 200px;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.theme-dark .ctx-cm-dropdown {
  background: #2a2a2a;
  border-color: #555;
  box-shadow: 0 6px 20px rgba(0,0,0,0.5);
}

.ctx-cm-option {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px;
  border: 1px solid transparent;
  border-radius: 4px;
  background: transparent;
  cursor: pointer;
  transition: background 0.12s;
  width: 100%;
}

.ctx-cm-option:hover {
  background: #f3f4f6;
}

.ctx-cm-option.active {
  background: #e8f0fe;
  border-color: #c7ddf9;
}

.theme-dark .ctx-cm-option:hover {
  background: #3a3a3a;
}

.theme-dark .ctx-cm-option.active {
  background: rgba(74, 158, 255, 0.15);
  border-color: rgba(74, 158, 255, 0.3);
}

.ctx-cm-option-name {
  font-size: 11px;
  font-family: "Segoe UI", sans-serif;
  color: #333;
  width: 50px;
  text-align: left;
  flex-shrink: 0;
}

.theme-dark .ctx-cm-option-name {
  color: #e0e0e0;
}

.ctx-cm-option-bar {
  flex: 1;
  height: 12px;
  border-radius: 3px;
}

@media (max-width: 768px) {
  .ribbon-tabs {
    overflow-x: auto;
    scrollbar-width: none;
  }
  .ribbon-tabs::-webkit-scrollbar {
    display: none;
  }
  .ribbon-content {
    overflow-x: auto;
    scrollbar-width: none;
  }
  .ribbon-content::-webkit-scrollbar {
    display: none;
  }
  .tab-btn {
    padding: 4px 12px;
    flex-shrink: 0;
  }
}
</style>
