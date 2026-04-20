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
        </button>
      </template>
    </div>

    <div class="ribbon-content" :class="{ 'ctx-active': activeTab === 'layer' && selectedLayer }">
      <!-- Insert Tab -->
      <div v-if="activeTab === 'insert'" class="ribbon-panel">
        <div class="ribbon-group">
          <div class="ribbon-group-buttons">
            <button @click="openFileDialog('model')" class="ribbon-btn" :disabled="!allowUpload">
              <span class="btn-icon" v-html="ICON_3D_MODEL"></span>
              <span class="btn-label">3D Model</span>
            </button>
            <button @click="openFileDialog('pointcloud')" class="ribbon-btn" :disabled="!allowUpload">
              <span class="btn-icon" v-html="ICON_POINT_CLOUD"></span>
              <span class="btn-label">Point Cloud</span>
            </button>
            <button @click="openFileDialog('cameras')" class="ribbon-btn" :disabled="!allowUpload">
              <span class="btn-icon" v-html="ICON_CAMERA"></span>
              <span class="btn-label">Cameras</span>
            </button>
            <button @click="openFileDialog('markers')" class="ribbon-btn" :disabled="!allowUpload">
              <span class="btn-icon" v-html="ICON_MARKER_FLAG"></span>
              <span class="btn-label">Markers</span>
            </button>
            <button @click="openFileDialog('dem')" class="ribbon-btn" :disabled="!allowUpload">
              <span class="btn-icon" v-html="ICON_DEM"></span>
              <span class="btn-label">DEM</span>
            </button>
          </div>
          <span class="group-label">Data</span>
        </div>
      </div>

      <!-- View Tab -->
      <div v-if="activeTab === 'view'" class="ribbon-panel">
        <div class="ribbon-group">
          <div class="ribbon-group-buttons">
            <button @click="handleToggleWireframe" class="ribbon-btn" :class="{ active: showWireframe }">
              <span class="btn-icon" v-html="ICON_WIREFRAME"></span>
              <span class="btn-label">Wireframe</span>
            </button>
            <button @click="handleToggleBoundingBox" class="ribbon-btn" :class="{ active: showBoundingBox }">
              <span class="btn-icon" v-html="ICON_BBOX"></span>
              <span class="btn-label">Box</span>
            </button>
            <button @click="handleToggleGrid" class="ribbon-btn" :class="{ active: showGrid }">
              <span class="btn-icon" v-html="ICON_GRID"></span>
              <span class="btn-label">Grid</span>
            </button>
            <button @click="handleToggleAxes" class="ribbon-btn" :class="{ active: showAxes }">
              <span class="btn-icon" v-html="ICON_AXES"></span>
              <span class="btn-label">Axes</span>
            </button>
            <button @click="handleToggleNormals" class="ribbon-btn" :class="{ active: showNormals }">
              <span class="btn-icon" v-html="ICON_NORMALS"></span>
              <span class="btn-label">Normals</span>
            </button>
          </div>
          <span class="group-label">Display</span>
        </div>

        <div class="ribbon-group">
          <div class="ribbon-group-buttons">
            <button @click="emit('view-top')" class="ribbon-btn">
              <span class="btn-icon" v-html="ICON_VIEW_TOP"></span>
              <span class="btn-label">Top</span>
            </button>
            <div class="btn-pair">
              <button @click="emit('view-front')" class="ribbon-btn ribbon-btn-sm">
                <span class="btn-icon" v-html="ICON_VIEW_FRONT"></span>
                <span class="btn-label">Front</span>
              </button>
              <button @click="emit('view-back')" class="ribbon-btn ribbon-btn-sm">
                <span class="btn-icon" v-html="ICON_VIEW_BACK"></span>
                <span class="btn-label">Back</span>
              </button>
            </div>
            <div class="btn-pair">
              <button @click="emit('view-right')" class="ribbon-btn ribbon-btn-sm">
                <span class="btn-icon" v-html="ICON_VIEW_RIGHT"></span>
                <span class="btn-label">Right</span>
              </button>
              <button @click="emit('view-left')" class="ribbon-btn ribbon-btn-sm">
                <span class="btn-icon" v-html="ICON_VIEW_LEFT"></span>
                <span class="btn-label">Left</span>
              </button>
            </div>
          </div>
          <span class="group-label">Camera Presets</span>
        </div>

        <div class="ribbon-group">
          <div class="ribbon-group-buttons">
            <button @click="emit('reset-camera')" class="ribbon-btn">
              <span class="btn-icon" v-html="ICON_RESET"></span>
              <span class="btn-label">Reset</span>
            </button>
            <button @click="emit('fit-to-scene')" class="ribbon-btn">
              <span class="btn-icon" v-html="ICON_FIT"></span>
              <span class="btn-label">Fit All</span>
            </button>
          </div>
          <span class="group-label">Navigate</span>
        </div>

        <!-- Bookmarks -->
        <div class="ribbon-group">
          <div class="ribbon-group-buttons">
            <button @click="emit('toggle-bookmarks')" class="ribbon-btn" :class="{ active: isBookmarksOpen }" title="Open scene bookmarks panel">
              <span class="btn-icon" v-html="ICON_BOOKMARK_ADD"></span>
              <span class="btn-label">Bookmarks</span>
            </button>
          </div>
          <span class="group-label">Bookmarks</span>
        </div>

        <div class="ribbon-group">
          <div class="ribbon-group-buttons">
            <button @click="emit('save-image')" class="ribbon-btn" title="Save the current 3D view as a PNG image">
              <span class="btn-icon" v-html="ICON_SAVE_IMAGE"></span>
              <span class="btn-label">Save Image</span>
            </button>
            <button @click="emit('share-scene')" class="ribbon-btn" title="Share the current 3D camera view">
              <span class="btn-icon" v-html="ICON_SHARE"></span>
              <span class="btn-label">Share</span>
            </button>
          </div>
          <span class="group-label">Export</span>
        </div>
      </div>

      <!-- Tools Tab -->
      <div v-if="activeTab === 'tools'" class="ribbon-panel">
        <div class="ribbon-group">
          <div class="ribbon-group-buttons">
            <button @click="emit('measure-distance')" class="ribbon-btn" :class="{ active: isMeasuringDistance }">
              <span class="btn-icon" v-html="ICON_DISTANCE"></span>
              <span class="btn-label">Distance</span>
            </button>
            <button @click="emit('measure-area')" class="ribbon-btn" :class="{ active: isMeasuringArea }">
              <span class="btn-icon" v-html="ICON_AREA"></span>
              <span class="btn-label">Area</span>
            </button>
          </div>
          <span class="group-label">Measure</span>
        </div>
        <div class="ribbon-group">
          <div class="ribbon-group-buttons">
            <button @click="emit('toggle-pick-mode')" class="ribbon-btn" :class="{ active: pickMode }" title="Click any surface to read its XYZ coordinates">
              <span class="btn-icon" v-html="ICON_PICK_XYZ"></span>
              <span class="btn-label">Pick XYZ</span>
            </button>
          </div>
          <span class="group-label">Inspect</span>
        </div>
      </div>

      <!-- Contextual Layer Tab -->
      <div v-if="activeTab === 'layer' && selectedLayer" class="ribbon-panel">
        <!-- Info (leftmost, own group) -->
        <div class="ribbon-group">
          <div class="ribbon-group-buttons">
            <button class="ribbon-btn" @click="emit('ribbon-layer-info', selectedLayer)" title="View layer info">
              <span class="btn-icon" v-html="ICON_INFO"></span>
              <span class="btn-label">Info</span>
            </button>
          </div>
          <span class="group-label">Layer</span>
        </div>
        <!-- Navigate -->
        <div class="ribbon-group">
          <div class="ribbon-group-buttons">
            <button class="ribbon-btn" @click="emit('ribbon-layer-zoom', selectedLayer)" title="Zoom to selected layer">
              <span class="btn-icon" v-html="ICON_FIT"></span>
              <span class="btn-label">Zoom To</span>
            </button>
          </div>
          <span class="group-label">Navigate</span>
        </div>
        <!-- Display -->
        <div class="ribbon-group">
          <div class="ribbon-group-buttons">
            <button
              class="ribbon-btn"
              :class="{ active: selectedLayer.visible }"
              @click="toggleSelectedVisibility"
              :title="selectedLayer.visible ? 'Hide layer' : 'Show layer'"
            >
              <span class="btn-icon" v-html="selectedLayer.visible ? ICON_EYE : ICON_EYE_OFF"></span>
              <span class="btn-label">{{ selectedLayer.visible ? 'Visible' : 'Hidden' }}</span>
            </button>
          </div>
          <span class="group-label">Display</span>
        </div>
        <!-- Materials – model layers awaiting MTL/textures -->
        <div v-if="selectedLayer.type === 'model' && hasPendingMtl" class="ribbon-group">
          <div class="ribbon-group-buttons">
            <button
              class="ribbon-btn"
              @click="emit('pick-materials', selectedLayer)"
              title="Pick MTL and texture files for this model"
            >
              <span class="btn-icon" v-html="ICON_MTL"></span>
              <span class="btn-label">Materials</span>
            </button>
          </div>
          <span class="group-label">Appearance</span>
        </div>
        <!-- Color Mode – pointcloud layers only -->
        <div v-if="selectedLayer.type === 'pointcloud'" class="ribbon-group">
          <div class="ribbon-group-buttons">
            <div class="ctx-color-mode">
              <select :value="localColorMode" class="ctx-select" title="Point cloud color mode" @change="onColorModeChange">
                <option value="rgb">RGB</option>
                <option value="elevation">Elevation</option>
                <option value="intensity">Intensity</option>
                <option value="classification">Classification</option>
              </select>
            </div>
          </div>
          <span class="group-label">Color Mode</span>
        </div>

        <!-- Point Size – pointcloud layers only -->
        <div v-if="selectedLayer.type === 'pointcloud'" class="ribbon-group">
          <div class="ribbon-group-buttons">
            <div class="ctx-point-size">
              <div class="ctx-range-row">
                <input
                  type="range"
                  min="0.5"
                  max="10"
                  step="0.5"
                  :value="localPointSize"
                  @input="onPointSizeInput"
                  class="ctx-range"
                  :style="{ background: sliderTrackStyle }"
                  title="Adjust point size"
                />
                <span class="ctx-range-value">{{ localPointSize }}</span>
              </div>
            </div>
          </div>
          <span class="group-label">Point Size</span>
        </div>
        <!-- Vertical Exaggeration – DEM layers only -->
        <div v-if="selectedLayer.type === 'dem'" class="ribbon-group">
          <div class="ribbon-group-buttons">
            <div class="ctx-point-size">
              <div class="ctx-range-row">
                <input
                  type="range"
                  min="0.1"
                  max="10"
                  step="0.1"
                  :value="localVertExag"
                  @input="onVerticalExaggerationInput"
                  class="ctx-range"
                  :style="{ background: vertExagTrackStyle }"
                  title="Vertical exaggeration"
                />
                <span class="ctx-range-value">{{ localVertExag }}×</span>
              </div>
            </div>
          </div>
          <span class="group-label">Vert. Exag.</span>
        </div>
        <!-- Remove -->
        <div class="ribbon-group">
          <div class="ribbon-group-buttons">
            <button class="ribbon-btn ribbon-btn--danger" @click="emit('ribbon-layer-remove', selectedLayer)" title="Remove this layer">
              <span class="btn-icon" v-html="ICON_TRASH_CTX"></span>
              <span class="btn-label">Remove</span>
            </button>
          </div>
          <span class="group-label">Layer</span>
        </div>
      </div>
    </div>

    <!-- Hidden file inputs -->
    <input 
      ref="modelInput" 
      type="file" 
      accept=".obj,.ply,.stl" 
      @change="handleModelFile" 
      style="display: none"
    />
    <input 
      ref="pointcloudInput" 
      type="file" 
      accept=".copc.laz,.laz,.las,.ply" 
      @change="handlePointCloudFile" 
      style="display: none"
    />
    <input 
      ref="camerasInput" 
      type="file" 
      accept=".txt" 
      @change="handleCamerasFile" 
      style="display: none"
    />
    <input
      ref="markersInput"
      type="file"
      accept=".xml"
      @change="handleMarkersFile"
      style="display: none"
    />
    <input
      ref="demInput"
      type="file"
      accept=".tif,.tiff"
      @change="handleDEMFile"
      style="display: none"
    />
  </div>
</template>

<script setup>
import { ref, watch, computed, inject } from 'vue';
import { useViewer3DStore } from '@/stores/viewer3D/viewer3dStore';
import { storeToRefs } from 'pinia';
import {
  ICON_3D_MODEL,
  ICON_POINT_CLOUD,
  ICON_CAMERA,
  ICON_MARKER_FLAG,
  ICON_DEM,
  ICON_GRID,
  ICON_AXES,
  ICON_RESET,
  ICON_FIT,
  ICON_WIREFRAME,
  ICON_BBOX,
  ICON_NORMALS,
  ICON_DISTANCE,
  ICON_AREA,
  ICON_VIEW_TOP,
  ICON_VIEW_FRONT,
  ICON_VIEW_BACK,
  ICON_VIEW_RIGHT,
  ICON_VIEW_LEFT,
  ICON_EYE,
  ICON_EYE_OFF,
  ICON_INFO,
  ICON_PICK_XYZ,
  ICON_BOOKMARK_ADD,
  ICON_SAVE_IMAGE,
  ICON_SHARE,
} from '@/constants/icons.js';

const props = defineProps({
  isMeasuringDistance: {
    type: Boolean,
    default: false
  },
  isMeasuringArea: {
    type: Boolean,
    default: false
  },
  selectedLayer: {
    type: Object,
    default: null
  },
  hasPendingMtl: {
    type: Boolean,
    default: false
  },
  isBookmarksOpen: {
    type: Boolean,
    default: false
  },
});

const emit = defineEmits([
  'load-model',
  'load-pointcloud',
  'load-cameras',
  'load-markers',
  'load-dem',
  'unsupported-file',
  'toggle-wireframe',
  'toggle-bounding-box',
  'toggle-grid',
  'toggle-axes',
  'toggle-normals',
  'reset-camera',
  'fit-to-scene',
  'view-top',
  'view-front',
  'view-back',
  'view-right',
  'view-left',
  'measure-distance',
  'measure-area',
  'ribbon-layer-zoom',
  'ribbon-layer-info',
  'ribbon-layer-remove',
  'ribbon-layer-visibility',
  'ribbon-layer-pointsize',
  'vertical-exaggeration',
  'pick-materials',
  'toggle-bookmarks',
  'toggle-pick-mode',
  'ribbon-color-mode',
  'save-image',
  'share-scene',
]);

const viewer3DStore = useViewer3DStore();
const { showGrid, showAxes, showWireframe, showBoundingBox, showNormals, pickMode } = storeToRefs(viewer3DStore);
const { toggleWireframe, toggleBoundingBox, toggleGrid, toggleAxes, toggleNormals } = viewer3DStore;

const appConfig = inject('config');
const allowUpload = computed(() => appConfig?.value?.ui?.viewer_upload !== false);

const activeTab = ref('insert');
const modelInput = ref(null);
const pointcloudInput = ref(null);
const camerasInput = ref(null);
const markersInput = ref(null);
const demInput = ref(null);

const tabs = [
  { id: 'insert', label: 'Insert' },
  { id: 'view', label: 'View' },
  { id: 'tools', label: 'Tools' }
];

// Auto-switch to layer tab when a layer is selected
watch(() => props.selectedLayer, (newLayer) => {
  if (newLayer) {
    activeTab.value = 'layer';
  } else if (activeTab.value === 'layer') {
    activeTab.value = 'insert';
  }
});

// Track point size for pointcloud layers
const localPointSize = ref(2);
watch(() => props.selectedLayer, (layer) => {
  if (layer?.type === 'pointcloud' && layer.object) {
    let size = 2;
    layer.object.traverse?.((child) => {
      if (child.isPoints && child.material) size = child.material.size ?? 2;
    });
    localPointSize.value = parseFloat(size.toFixed(1));
  }
}, { immediate: true });

const onPointSizeInput = (e) => {
  const size = parseFloat(e.target.value);
  localPointSize.value = size;
  emit('ribbon-layer-pointsize', { layer: props.selectedLayer, size });
};

const sliderTrackStyle = computed(() => {
  const min = 0.5, max = 10;
  const pct = ((localPointSize.value - min) / (max - min)) * 100;
  return `linear-gradient(to right, #f59e0b ${pct}%, #d1d5db ${pct}%)`;
});

// Track vertical exaggeration for DEM layers
const localVertExag = ref(1);
watch(() => props.selectedLayer, (layer) => {
  if (layer?.type === 'dem') {
    localVertExag.value = layer.object?.userData?.verticalExaggeration ?? 1;
  }
}, { immediate: true });

const onVerticalExaggerationInput = (e) => {
  const factor = parseFloat(parseFloat(e.target.value).toFixed(1));
  localVertExag.value = factor;
  emit('vertical-exaggeration', { layer: props.selectedLayer, factor });
};

const vertExagTrackStyle = computed(() => {
  const min = 0.1, max = 10;
  const pct = ((localVertExag.value - min) / (max - min)) * 100;
  return `linear-gradient(to right, #3b82f6 ${pct}%, #d1d5db ${pct}%)`;
});

const toggleSelectedVisibility = () => {
  if (!props.selectedLayer) return;
  const visible = !props.selectedLayer.visible;
  emit('ribbon-layer-visibility', { layer: props.selectedLayer, visible });
};

// Color mode for point cloud layers
const localColorMode = ref('rgb');
watch(() => props.selectedLayer, (layer) => {
  if (layer?.type === 'pointcloud') {
    localColorMode.value = layer.object?.userData?.colorMode ?? 'rgb';
  }
}, { immediate: true });

const onColorModeChange = (e) => {
  const mode = e.target.value;
  localColorMode.value = mode;
  emit('ribbon-color-mode', { layer: props.selectedLayer, mode });
};

// Contextual icons
const ICON_TRASH_CTX = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>`;
const ICON_MTL = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>`;

const openFileDialog = (type) => {
  switch(type) {
    case 'model':       modelInput.value?.click();    break;
    case 'pointcloud':  pointcloudInput.value?.click(); break;
    case 'cameras':     camerasInput.value?.click();  break;
    case 'markers':     markersInput.value?.click();  break;
    case 'dem':         demInput.value?.click();       break;
  }
};

const handleToggleWireframe = () => {
  toggleWireframe();
  emit('toggle-wireframe', showWireframe.value);
};

const handleToggleBoundingBox = () => {
  toggleBoundingBox();
  emit('toggle-bounding-box', showBoundingBox.value);
};

const handleToggleGrid = () => {
  toggleGrid();
  emit('toggle-grid', showGrid.value);
};

const handleToggleAxes = () => {
  toggleAxes();
  emit('toggle-axes', showAxes.value);
};

const handleToggleNormals = () => {
  toggleNormals();
  emit('toggle-normals', showNormals.value);
};

const SUPPORTED = {
  model:      ['.obj', '.ply', '.stl'],
  pointcloud: ['.copc.laz', '.laz', '.las', '.ply'],
  cameras:    ['.txt'],
  markers:    ['.xml'],
  dem:        ['.tif', '.tiff'],
};

const checkExtension = (file, type) => {
  const lower = file.name.toLowerCase();
  return SUPPORTED[type].some((ext) => lower.endsWith(ext));
};

const emitOrReject = (file, type, loadEvent, event) => {
  if (checkExtension(file, type)) {
    emit(loadEvent, file);
  } else {
    const ext = file.name.includes('.') ? file.name.split('.').pop() : 'unknown';
    emit('unsupported-file', { ext, expected: SUPPORTED[type].join(', ') });
  }
  event.target.value = '';
};

const handleModelFile = (event) => {
  const file = event.target.files[0];
  if (file) emitOrReject(file, 'model', 'load-model', event);
};

const handlePointCloudFile = (event) => {
  const file = event.target.files[0];
  if (file) emitOrReject(file, 'pointcloud', 'load-pointcloud', event);
};

const handleCamerasFile = (event) => {
  const file = event.target.files[0];
  if (file) emitOrReject(file, 'cameras', 'load-cameras', event);
};

const handleMarkersFile = (event) => {
  const file = event.target.files[0];
  if (file) emitOrReject(file, 'markers', 'load-markers', event);
};

const handleDEMFile = (event) => {
  const file = event.target.files[0];
  if (file) emitOrReject(file, 'dem', 'load-dem', event);
};
</script>

<style scoped>
.ribbon-menu {
  position: relative;
  background: #fff;
  border-bottom: 1px solid #ddd;
  z-index: 900;
  font-family: "Segoe UI", sans-serif;
  user-select: none;
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

.ribbon-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.ribbon-btn:disabled:hover {
  background: transparent;
  border-color: transparent;
  box-shadow: none;
}

.btn-pair {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.ribbon-btn-sm {
  min-width: 40px;
  height: 21px;
  padding: 2px 5px;
  gap: 0;
  flex-direction: row;
  justify-content: flex-start;
}

.ribbon-btn-sm .btn-icon {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
}

.ribbon-btn-sm .btn-icon :deep(svg) {
  width: 12px;
  height: 12px;
}

.ribbon-btn-sm .btn-label {
  font-size: 9px;
  margin-left: 3px;
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

/* Contextual ribbon content accent */
.ribbon-content.ctx-active {
  box-shadow: inset 0 3px 0 #f59e0b;
}

/* Danger button */
.ribbon-btn--danger {
  color: #dc2626 !important;
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

/* Point size control in contextual ribbon */
.ctx-point-size {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 10px;
  height: 100%;
}

.ctx-range-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.ctx-range {
  -webkit-appearance: none;
  appearance: none;
  width: 90px;
  height: 4px;
  border-radius: 2px;
  cursor: pointer;
  outline: none;
  border: none;
  transition: background 0.1s;
}

.ctx-range::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #f59e0b;
  border: 2px solid #fff;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.25);
  cursor: pointer;
  transition: transform 0.12s, box-shadow 0.12s;
}

.ctx-range::-webkit-slider-thumb:hover {
  transform: scale(1.25);
  box-shadow: 0 0 0 4px rgba(245, 158, 11, 0.2);
}

.ctx-range::-moz-range-thumb {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #f59e0b;
  border: 2px solid #fff;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.25);
  cursor: pointer;
}

.ctx-range-value {
  min-width: 28px;
  font-size: 11px;
  font-weight: 700;
  color: #444;
  font-family: "Segoe UI", monospace;
  text-align: center;
  background: rgba(245, 158, 11, 0.1);
  border: 1px solid rgba(245, 158, 11, 0.3);
  border-radius: 4px;
  padding: 2px 4px;
  line-height: 1.4;
}

.theme-dark .ctx-range-value {
  color: #eee;
  background: rgba(245, 158, 11, 0.15);
  border-color: rgba(245, 158, 11, 0.4);
}

/* Color mode select */
.ctx-color-mode {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 8px;
  height: 100%;
}

.ctx-select {
  font-size: 11px;
  padding: 3px 6px;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  background: white;
  color: #333;
  cursor: pointer;
  outline: none;
}

.ctx-select:focus {
  border-color: #3b82f6;
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
}

.theme-dark .ctx-select {
  background: #3a3a3a;
  border-color: #555;
  color: #e0e0e0;
}
</style>
