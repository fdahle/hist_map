<template>
  <div class="viewer-3d-view">
    <!-- Ribbon menu at top -->
    <RibbonMenu 
      :is-measuring-distance="isMeasurementModalVisible && activeMeasurementType === 'distance'"
      :is-measuring-area="isMeasurementModalVisible && activeMeasurementType === 'area'"
      :selected-layer="selectedLayer3D"
      :has-pending-mtl="pendingMtlTarget !== null && pendingMtlTarget?.id === selectedLayer3D?.id"
      @load-model="handleLoadModel"
      @load-pointcloud="handleLoadPointCloud"
      @load-cameras="handleLoadCameras"
      @load-markers="handleLoadMarkers"
      @load-dem="handleLoadDEM"
      @unsupported-file="({ ext, expected }) => showError(`Unsupported file format: .${ext} — expected ${expected}`)"
      @reset-camera="onResetCamera"
      @fit-to-scene="onFitToScene"
      @view-top="onViewTop"
      @view-front="onViewFront"
      @view-back="onViewBack"
      @view-right="onViewRight"
      @view-left="onViewLeft"
      @measure-distance="onMeasureDistance"
      @measure-area="onMeasureArea"
      @ribbon-layer-zoom="onRibbonLayerZoom"
      @ribbon-layer-info="onRibbonLayerInfo"
      @ribbon-layer-remove="onRibbonLayerRemove"
      @ribbon-layer-visibility="onRibbonLayerVisibility"
      @ribbon-layer-pointsize="onRibbonLayerPointSize"
      @vertical-exaggeration="onVerticalExaggeration"
      @pick-materials="triggerMtlFilePicker"
      @toggle-bookmarks="onToggleBookmarks"
      @share-scene="isShareSceneOpen = true"
      @toggle-pick-mode="onTogglePickMode"
      @ribbon-color-mode="onRibbonColorMode"
      @save-image="canvasRef?.saveImage()"
      :is-bookmarks-open="isBookmarksOpen"
    />

    <!-- Body: Layer panel + Canvas -->
    <div
      class="viewer-body"
      @dragenter.prevent="onDragEnter"
      @dragover.prevent="onDragOver"
      @dragleave="onDragLeave"
      @drop.prevent="onDrop"
    >
      <!-- Layer Manager fixed at left -->
      <LayerManager
        ref="layerManagerRef"
        @toggle-layer-visibility="onToggleLayerVisibility"
        @remove-layer="onRemoveLayer"
        @zoom-to-layer="onZoomToLayer"
        @select-layer="onSelect3DLayer"
        @open-settings="isSettingsOpen = true"
      />

      <!-- Main 3D canvas -->
      <div class="canvas-area">
        <Viewer3DCanvas 
          ref="canvasRef"
          :model-urls="modelUrls"
          :pointcloud-urls="pointcloudUrls"
          :coordinates="coordinates"
          :model-name="storedName"
          @scene-ready="onSceneReady"
          @model-loaded="onModelLoaded"
          @loading-error="onLoadingError"
          @loading-progress="onLoadingProgress"
          @parsing-started="onParsingStarted"
          @parsing-progress="onParsingProgress"
          @building-geometry="onBuildingGeometry"
          @unsupported-file="({ ext, message }) => showError(message ?? `Unsupported file format: .${ext}`)"
          @suggest-materials="onSuggestMaterials"
        />

        <!-- Loading indicator -->
        <div v-if="isLoading" class="loading-overlay">
          <div class="loading-content">
            <div class="spinner"></div>
            <p class="loading-title">{{ loadingTitle }}</p>
            <div class="progress-bar-container">
              <div 
                class="progress-bar" 
                :class="{ parsing: isParsing }"
                :style="{ width: loadingProgress + '%' }"
              ></div>
            </div>
            <p class="loading-status">{{ loadingStatus }}</p>
            <button class="stop-btn" :class="{ stopping: isStopping }" @click="handleStopLoading" :disabled="isStopping">
              <span v-if="isStopping" class="stop-spinner"></span>
              <span v-else>&#9632;</span>
              {{ isStopping ? 'Stopping…' : 'Stop' }}
            </button>
          </div>
        </div>

        <!-- Error message -->
        <div v-if="errorMessage" class="error-toast">
          <span>{{ errorMessage }}</span>
          <button @click="errorMessage = null">&#10005;</button>
        </div>

        <!-- MTL hint -->
        <div v-if="mtlHintMessage" class="hint-toast">
          <span>{{ mtlHintMessage }}</span>
          <button class="hint-action-btn" @click="triggerMtlFilePicker">Pick MTL &amp; textures…</button>
          <button @click="mtlHintMessage = null">&#10005;</button>
        </div>
        <input ref="mtlFileInputRef" type="file" multiple accept=".mtl,.jpg,.jpeg,.png,.bmp,.gif,.webp" style="display:none" @change="onMaterialFilePicked" />
        <BugReportButton />

        <!-- Mobile: floating button to open layers panel -->
        <button class="mobile-layers-fab" @click="layerManagerRef?.toggle()" title="Toggle layers panel">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>
            <line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
          </svg>
          <span>Layers</span>
        </button>
      </div>

      <!-- Drag-and-drop overlay covering the full scene area -->
      <Transition name="drag-fade">
        <div v-if="isDragOver" class="drop-overlay">
          <div class="drop-overlay-content">
            <div class="drop-icon">
              <svg viewBox="0 0 24 24" width="52" height="52" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2"/>
                <path d="M3 9h18M3 15h18M9 3v18M15 3v18"/>
                <path d="M12 8v8M8 12l4-4 4 4" stroke-width="1.3"/>
              </svg>
            </div>
            <div class="drop-text">Drop files to load</div>
          </div>
        </div>
      </Transition>
    </div>

    <!-- Measurement Modal -->
    <MeasurementModal
      :is-visible="isMeasurementModalVisible"
      :measurement-type="activeMeasurementType"
      :measurements="measurements"
      :points-count="measurementPointsCount"
      :current-value="currentMeasurementValue"
      @close="closeMeasurementModal"
      @reset="resetMeasurements"
      @remove-measurement="removeMeasurement"
      @save-current="saveCurrentMeasurement"
      @undo-point="undoLastPoint"
      @cancel-measurement="cancelCurrentMeasurement"
    />

    <!-- XYZ Coordinate Picker Modal -->
    <CoordPickerModal
      :is-visible="isCoordPickerOpen"
      @close="onCloseCoordPicker"
    />

    <!-- Scene Bookmarks Modal -->
    <BookmarksModal
      :is-visible="isBookmarksOpen"
      @close="isBookmarksOpen = false"
      @apply-bookmark="onApplyBookmark"
    />

    <!-- Share 3D View Modal -->
    <Share3DModal
      :is-open="isShareSceneOpen"
      @close="isShareSceneOpen = false"
      @apply-view="onApplySharedView"
    />

    <!-- Settings Modal -->
    <SettingsModal
      :is-open="isSettingsOpen"
      mode="3d"
      @close="isSettingsOpen = false"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { storeToRefs } from 'pinia';
import { getApiUrl } from '@/utils/config';
import { useViewer3DStore } from '@/stores/viewer3D/viewer3dStore';
import { logger } from '@/utils/logger';
import Viewer3DCanvas from '@/components/viewer3D/Canvas.vue';
import RibbonMenu from '@/components/viewer3D/RibbonMenu.vue';
import LayerManager from '@/components/viewer3D/LayerManager.vue';
import MeasurementModal from '@/components/modals/MeasurementModal.vue';
import CoordPickerModal from '@/components/modals/CoordPickerModal.vue';
import BookmarksModal from '@/components/modals/BookmarksModal.vue';
import Share3DModal from '@/components/modals/Share3DModal.vue';
import SettingsModal from '@/components/modals/SettingsModal.vue';
import BugReportButton from '@/components/common/BugReportButton.vue';

const canvasRef = ref(null);
const layerManagerRef = ref(null);
const selectedLayer3D = ref(null);
const isCoordPickerOpen = ref(false);
const isBookmarksOpen = ref(false);
const isShareSceneOpen = ref(false);
const isSettingsOpen = ref(false);

// Drag-and-drop state
const isDragOver = ref(false);
let dragCounter = 0;

const onDragEnter = (event) => {
  dragCounter++;
  if (event.dataTransfer?.types?.includes('Files')) {
    isDragOver.value = true;
  }
};

const onDragOver = (event) => {
  if (event.dataTransfer?.types?.includes('Files')) {
    event.dataTransfer.dropEffect = 'copy';
  }
};

const onDragLeave = () => {
  dragCounter--;
  if (dragCounter <= 0) {
    dragCounter = 0;
    isDragOver.value = false;
  }
};

const onDrop = (event) => {
  dragCounter = 0;
  isDragOver.value = false;
  const files = Array.from(event.dataTransfer?.files ?? []);
  if (files.length === 0 || !canvasRef.value) return;
  canvasRef.value.processDroppedFiles(files);
};
const isLoading = ref(false);
const isStopping = ref(false);
const loadingProgress = ref(0);
const loadingStatus = ref('');
const loadingTitle = ref('Loading...');
const isParsing = computed(() => loadingStatus.value.includes('Parsing'));
const errorMessage = ref(null);
const mtlHintMessage = ref(null);
const pendingMtlTarget = ref(null);
const mtlFileInputRef = ref(null);

const viewer3DStore = useViewer3DStore();
const { cleanup, startMeasurement } = viewer3DStore;

// Measurement state
const isMeasurementModalVisible = ref(false);
const activeMeasurementType = ref('distance'); // 'distance' or 'area'
const measurements = ref([]);
const measurementPointsCount = ref(0);
const currentMeasurementValue = ref(null);

// Load viewer data from localStorage (written by AttributePanel before opening this tab)
const _stored = (() => {
  try {
    const raw = localStorage.getItem('s3d_viewer3d');
    if (raw) {
      const data = JSON.parse(raw);
      localStorage.removeItem('s3d_viewer3d');
      return data;
    }
  } catch (e) {
    logger.warn('3DView', 'Failed to read viewer data from localStorage', e);
  }
  return {};
})();

const storedName = _stored.name || 'Model';
const modelUrls = ref(_stored.models || []);
const pointcloudUrls = ref(_stored.pointclouds || []);
const coordinates = ref({ x: _stored.x || 0, y: _stored.y || 0 });

// Map of layer UUID → description fetched from /layers/:id/meta
const layerDescriptions = ref({});

function extractLayerUuid(url) {
  const match = url?.match(/\/layers\/([0-9a-f-]{36})\//i);
  return match?.[1] ?? null;
}

onMounted(async () => {
  const allUrls = [...modelUrls.value, ...pointcloudUrls.value];
  const uuids = [...new Set(allUrls.map(extractLayerUuid).filter(Boolean))];
  await Promise.all(uuids.map(async (uuid) => {
    try {
      const res = await fetch(getApiUrl(`/layers/${uuid}/meta`));
      if (res.ok) {
        const data = await res.json();
        if (data.description) layerDescriptions.value[uuid] = data.description;
      }
    } catch { /* non-fatal */ }
  }));
});

// Scene events
const onSceneReady = () => {
  logger.info('3DView', '3D scene initialized and ready');
  if (modelUrls.value.length > 0) {
    isLoading.value = true;
    loadingTitle.value = 'Loading 3D Model...';
  }
};

const onLoadingProgress = ({ url, index, loaded, total, progress, status }) => {
  if (!isLoading.value) {
    isLoading.value = true;
    const lower = url.toLowerCase();
    if (lower.endsWith('.obj')) loadingTitle.value = 'Loading 3D Model...';
    else if (lower.endsWith('.ply') || lower.endsWith('.las') || lower.endsWith('.laz')) loadingTitle.value = 'Loading Point Cloud...';
    else if (lower.endsWith('.txt') || lower.endsWith('.csv')) loadingTitle.value = 'Loading Cameras...';
    else loadingTitle.value = 'Loading...';
  }
  loadingProgress.value = progress;
  const loadedMB = (loaded / (1024 * 1024)).toFixed(1);
  const totalMB = (total / (1024 * 1024)).toFixed(1);
  
  // For URL-based loads the url is a full path containing the layer UUID;
  // use storedName in that case so messages show the human-readable name.
  const displayName = url.includes('/') ? storedName : url;

  if (status === 'downloading') {
    loadingStatus.value = `Downloading model ${index + 1}/${modelUrls.value.length}: ${loadedMB}MB / ${totalMB}MB (${progress}%)`;
  } else if (status === 'decoding') {
    loadingStatus.value = `Decoding model data (${totalMB}MB)...`;
  } else if (status === 'reading') {
    loadingStatus.value = `Reading ${displayName}: ${loadedMB}MB / ${totalMB}MB (${progress}%)`;
  } else if (status === 'decompressing') {
    loadingStatus.value = `Decompressing ${displayName}…`;
    loadingProgress.value = 0;
  } else if (status === 'parsing') {
    loadingStatus.value = progress > 0 && progress < 100
      ? `Processing ${displayName}: ${progress}%`
      : `Parsing ${displayName}...`;
  }
};

const onParsingStarted = ({ index, size }) => {
  if (!isLoading.value) {
    isLoading.value = true;
    loadingTitle.value = 'Loading...';
  }
  const sizeMB = (size / (1024 * 1024)).toFixed(1);
  if (modelUrls.value.length > 0) {
    loadingStatus.value = `Parsing model ${index + 1}/${modelUrls.value.length} (${sizeMB}MB)...`;
  } else {
    loadingStatus.value = `Parsing (${sizeMB}MB)...`;
  }
  loadingProgress.value = 0;
};

const onParsingProgress = ({ index, progress, processed, total }) => {
  loadingProgress.value = progress;
  const processedK = (processed / 1000).toFixed(0);
  const totalK = (total / 1000).toFixed(0);
  if (modelUrls.value.length > 0) {
    loadingStatus.value = `Parsing model ${index + 1}/${modelUrls.value.length}: ${processedK}k / ${totalK}k lines (${progress}%)`;
  } else {
    loadingStatus.value = `Parsing: ${processedK}k / ${totalK}k lines (${progress}%)`;
  }
};

const onBuildingGeometry = ({ index, stage, vertices, faces, triangles }) => {
  loadingProgress.value = 100;
  
  if (stage === 'geometry') {
    loadingStatus.value = `Building geometry: ${vertices?.toLocaleString()} vertices, ${faces?.toLocaleString()} faces...`;
  } else if (stage === 'triangulation') {
    loadingStatus.value = `Triangulating ${faces?.toLocaleString()} faces...`;
  } else if (stage === 'buffers') {
    loadingStatus.value = `Creating GPU buffers: ${triangles?.toLocaleString()} triangles...`;
  } else if (stage === 'normals') {
    loadingStatus.value = `Computing vertex normals...`;
  } else if (stage === 'finalizing') {
    loadingStatus.value = `Finalizing model...`;
  }
};

const onModelLoaded = ({ url, index, object, isFileDrop }) => {
  logger.info('3DView', `Model loaded: ${url}${modelUrls.value.length > 0 ? ` (${index + 1}/${modelUrls.value.length})` : ''}`);
  logger.debug('3DView', 'Object:', object, 'LayerManager ref:', layerManagerRef.value);
  
  // Add to layer manager
  if (layerManagerRef.value && object) {
    const urlFileName = url.split('/').pop() || `Model ${index + 1}`;
    // Use the stored feature name for the first model/pointcloud loaded from the map,
    // fall back to the filename for subsequent files or drag-and-drop.
    const isFirstOfType = index === 0;
    let layerName = isFirstOfType && !isFileDrop ? storedName : urlFileName;
    const layerType = object.userData?.type || 
                      (object.isPoints ? 'pointcloud' : 'model');
    
    // Add camera count to layer name if it's a camera group
    if (layerType === 'camera' && object.userData?.cameraCount) {
      layerName = `${layerName} (${object.userData.cameraCount} cameras)`;
    }
    
    logger.debug('3DView', `Adding to layer manager: ${layerName} (type: ${layerType})`);
    
    const layerUuid = extractLayerUuid(url);
    layerManagerRef.value.addLayer({
      id: object.uuid,
      name: layerName,
      type: layerType,
      visible: true,
      object: object,
      description: layerUuid ? (layerDescriptions.value[layerUuid] ?? null) : null,
    });
  } else {
    logger.warn('3DView', 'Could not add to layer manager:', { layerManagerRef: layerManagerRef.value, object });
  }
  
  // For file drops, always hide the loading indicator after a brief pause
  if (isFileDrop) {
    setTimeout(() => {
      isLoading.value = false;
      loadingProgress.value = 0;
      loadingStatus.value = '';
      loadingTitle.value = 'Loading...';
    }, 100);
  } else if (modelUrls.value.length > 0 && index === modelUrls.value.length - 1) {
    // URL-based loading: hide when all configured models are loaded
    isLoading.value = false;
    loadingProgress.value = 0;
    loadingStatus.value = '';
    loadingTitle.value = 'Loading...';
  } else if (modelUrls.value.length === 0) {
    // Fallback for any case without URL models
    setTimeout(() => {
      isLoading.value = false;
      loadingProgress.value = 0;
      loadingStatus.value = '';
      loadingTitle.value = 'Loading...';
    }, 100);
  }
};

const handleLoadMarkers = (file) => {
  if (canvasRef.value?.loadMarkersFile) {
    canvasRef.value.loadMarkersFile(file);
  }
};

const handleLoadDEM = (file) => {
  if (canvasRef.value?.loadDEMFile) {
    isLoading.value = true;
    loadingTitle.value = 'Loading DEM...';
    loadingStatus.value = `Loading DEM: ${file.name}...`;
    loadingProgress.value = 0;
    canvasRef.value.loadDEMFile(file);
  }
};

const onLoadingError = ({ url, error }) => {
  logger.error('3DView', 'Loading error:', error);
  errorMessage.value = `Failed to load: ${error}`;
  isLoading.value = false;
  loadingProgress.value = 0;
  loadingStatus.value = '';
  loadingTitle.value = 'Loading...';
  
  setTimeout(() => {
    errorMessage.value = null;
  }, 5000);
};

// View toggle events (handled directly by RibbonMenu via the Pinia store)

const onResetCamera = () => {
  if (canvasRef.value && canvasRef.value.resetToInitialCamera) {
    canvasRef.value.resetToInitialCamera();
  }
};

// Camera preset views
const onViewTop = () => {
  if (canvasRef.value && canvasRef.value.setCameraPreset) {
    canvasRef.value.setCameraPreset('top');
  }
};

const onViewFront = () => {
  if (canvasRef.value && canvasRef.value.setCameraPreset) {
    canvasRef.value.setCameraPreset('front');
  }
};

const onViewBack = () => {
  if (canvasRef.value && canvasRef.value.setCameraPreset) {
    canvasRef.value.setCameraPreset('back');
  }
};

const onViewRight = () => {
  if (canvasRef.value && canvasRef.value.setCameraPreset) {
    canvasRef.value.setCameraPreset('right');
  }
};

const onViewLeft = () => {
  if (canvasRef.value && canvasRef.value.setCameraPreset) {
    canvasRef.value.setCameraPreset('left');
  }
};

// Measurement events
const onMeasureDistance = () => {
  // Toggle measurement mode
  if (isMeasurementModalVisible.value && activeMeasurementType.value === 'distance') {
    // If already in distance mode, close it
    closeMeasurementModal();
  } else {
    // Switch to distance mode (clear previous measurements when switching)
    if (isMeasurementModalVisible.value && activeMeasurementType.value !== 'distance') {
      measurements.value = [];
      // Clear visual measurements in canvas when switching modes
      if (canvasRef.value && canvasRef.value.clearMeasurements) {
        canvasRef.value.clearMeasurements();
      }
    }
    activeMeasurementType.value = 'distance';
    isMeasurementModalVisible.value = true;
    measurementPointsCount.value = 0;
    currentMeasurementValue.value = null;
    
    startMeasurement('distance');
    if (canvasRef.value && canvasRef.value.enableMeasurementMode) {
      canvasRef.value.enableMeasurementMode('distance', handleMeasurementUpdate);
    }
  }
};

const onMeasureArea = () => {
  // Toggle measurement mode
  if (isMeasurementModalVisible.value && activeMeasurementType.value === 'area') {
    // If already in area mode, close it
    closeMeasurementModal();
  } else {
    // Switch to area mode (clear previous measurements when switching)
    if (isMeasurementModalVisible.value && activeMeasurementType.value !== 'area') {
      measurements.value = [];
      // Clear visual measurements in canvas when switching modes
      if (canvasRef.value && canvasRef.value.clearMeasurements) {
        canvasRef.value.clearMeasurements();
      }
    }
    activeMeasurementType.value = 'area';
    isMeasurementModalVisible.value = true;
    measurementPointsCount.value = 0;
    currentMeasurementValue.value = null;
    
    startMeasurement('area');
    if (canvasRef.value && canvasRef.value.enableMeasurementMode) {
      canvasRef.value.enableMeasurementMode('area', handleMeasurementUpdate);
    }
  }
};

const handleMeasurementUpdate = (data) => {
  // Update measurement data from canvas
  measurementPointsCount.value = data.pointsCount || 0;
  currentMeasurementValue.value = data.value || null;
  
  // If measurement is complete, add to list
  if (data.complete && data.value) {
    measurements.value.push({
      type: activeMeasurementType.value,
      value: data.value,
      timestamp: new Date().toISOString()
    });
    // Reset for next measurement
    measurementPointsCount.value = 0;
    currentMeasurementValue.value = null;
  }
};

const closeMeasurementModal = () => {
  isMeasurementModalVisible.value = false;
  measurementPointsCount.value = 0;
  currentMeasurementValue.value = null;
  
  // Clear all measurements when toggling off
  measurements.value = [];
  
  // Disable measurement mode in canvas and clear visual markers
  if (canvasRef.value && canvasRef.value.disableMeasurementMode) {
    canvasRef.value.disableMeasurementMode();
  }
  if (canvasRef.value && canvasRef.value.clearMeasurements) {
    canvasRef.value.clearMeasurements();
  }
};

const resetMeasurements = () => {
  measurements.value = [];
  measurementPointsCount.value = 0;
  currentMeasurementValue.value = null;
  
  // Clear visual measurements in canvas
  if (canvasRef.value && canvasRef.value.clearMeasurements) {
    canvasRef.value.clearMeasurements();
  }
};

const removeMeasurement = (index) => {
  // Remove from data
  measurements.value.splice(index, 1);
  // Remove visual objects from scene
  if (canvasRef.value && canvasRef.value.removeSavedMeasurement) {
    canvasRef.value.removeSavedMeasurement(index);
  }
};

const saveCurrentMeasurement = () => {
  if (canvasRef.value && canvasRef.value.saveCurrentMeasurement) {
    canvasRef.value.saveCurrentMeasurement();
  }
};

const undoLastPoint = () => {
  if (canvasRef.value && canvasRef.value.undoLastPoint) {
    canvasRef.value.undoLastPoint();
  }
};

const cancelCurrentMeasurement = () => {
  if (canvasRef.value && canvasRef.value.cancelCurrentMeasurement) {
    canvasRef.value.cancelCurrentMeasurement();
  }
};

// File loading from ribbon menu
const handleLoadModel = (file) => {
  if (canvasRef.value) {
    isLoading.value = true;
    loadingTitle.value = 'Loading 3D Model...';
    loadingStatus.value = `Loading model: ${file.name}...`;
    loadingProgress.value = 0;
    canvasRef.value.loadUserObjFile(file);
  }
};

const handleLoadPointCloud = (file) => {
  if (canvasRef.value && canvasRef.value.loadPointCloudFile) {
    isLoading.value = true;
    loadingTitle.value = 'Loading Point Cloud...';
    loadingStatus.value = `Loading point cloud: ${file.name}...`;
    loadingProgress.value = 0;
    canvasRef.value.loadPointCloudFile(file);
  } else {
    showError('Point cloud loading not yet implemented.');
  }
};

const handleLoadCameras = (file) => {
  if (canvasRef.value && canvasRef.value.loadCamerasFile) {
    isLoading.value = true;
    loadingTitle.value = 'Loading Cameras...';
    loadingStatus.value = `Loading cameras: ${file.name}...`;
    loadingProgress.value = 0;
    canvasRef.value.loadCamerasFile(file);
  } else {
    showError('Camera loading not yet implemented.');
  }
};

const onFitToScene = () => {
  if (canvasRef.value && canvasRef.value.fitCameraToScene) {
    canvasRef.value.fitCameraToScene();
  }
};

const onToggleLayerVisibility = ({ layerId, visible }) => {
  if (canvasRef.value && canvasRef.value.toggleLayerVisibility) {
    canvasRef.value.toggleLayerVisibility(layerId, visible);
  }
};

const onRemoveLayer = (layerId) => {
  if (canvasRef.value && canvasRef.value.removeLayer) {
    canvasRef.value.removeLayer(layerId);
  }
};

const onZoomToLayer = (layer) => {
  if (canvasRef.value && canvasRef.value.zoomToLayer && layer) {
    canvasRef.value.zoomToLayer(layer.id);
  }
};

const onSelect3DLayer = (layer) => {
  selectedLayer3D.value = layer ?? null;
};

const onRibbonLayerZoom = (layer) => {
  if (canvasRef.value?.zoomToLayer && layer) canvasRef.value.zoomToLayer(layer.id);
};

const onRibbonLayerInfo = (layer) => {
  layerManagerRef.value?.openInfoForLayer(layer);
};

const onRibbonLayerRemove = (layer) => {
  if (!layer) return;
  // removeLayerById includes a confirm dialog; on confirm it emits 'remove-layer'
  // which onRemoveLayer handles (removes from Three.js scene).
  layerManagerRef.value?.removeLayerById(layer.id);
};

const onRibbonLayerVisibility = ({ layer, visible }) => {
  if (!layer) return;
  layer.visible = visible;
  if (canvasRef.value?.toggleLayerVisibility) canvasRef.value.toggleLayerVisibility(layer.id, visible);
};

const onRibbonLayerPointSize = ({ layer, size }) => {
  if (!layer) return;
  if (layer.object?.userData?.type === 'copc') {
    canvasRef.value?.setCOPCPointSize(layer.id, size);
    if (layer.object) layer.object.userData.pointSize = size;
    return;
  }
  layerManagerRef.value?.setPointSizeById(layer.id, size);
};

const onApplyBookmark = (bm) => {
  canvasRef.value?.applyBookmark(bm);
};

const onApplySharedView = (payload) => {
  canvasRef.value?.applyBookmark({
    position: payload.position,
    target: payload.target,
  });
};

const onTogglePickMode = () => {
  viewer3DStore.togglePickMode();
  isCoordPickerOpen.value = viewer3DStore.pickMode;
};

const onCloseCoordPicker = () => {
  isCoordPickerOpen.value = false;
  if (viewer3DStore.pickMode) viewer3DStore.togglePickMode();
};

const onToggleBookmarks = () => {
  isBookmarksOpen.value = !isBookmarksOpen.value;
};

const onRibbonColorMode = ({ layer, mode }) => {
  if (!layer) return;
  if (layer.object) layer.object.userData.colorMode = mode;
  canvasRef.value?.applyColorMode(layer.id, mode);
};

const onVerticalExaggeration = ({ layer, factor }) => {
  if (!layer) return;
  canvasRef.value?.applyVerticalExaggeration(layer.id, factor);
};

const showError = (msg) => {
  errorMessage.value = msg;
  setTimeout(() => { errorMessage.value = null; }, 3000);
};

const onSuggestMaterials = ({ stem, objectId }) => {
  pendingMtlTarget.value = { id: objectId };
  mtlHintMessage.value = `"${stem}" loaded without textures.`;
};

const triggerMtlFilePicker = () => {
  mtlFileInputRef.value?.click();
};

const onMaterialFilePicked = (event) => {
  const files = Array.from(event.target.files ?? []);
  event.target.value = '';
  if (!files.length || !pendingMtlTarget.value) return;

  const lower = f => f.name.toLowerCase();
  const mtlFile = files.find(f => lower(f).endsWith('.mtl')) ?? null;
  const imageFiles = files.filter(f => /\.(jpg|jpeg|png|bmp|gif|webp)$/.test(lower(f)));

  if (!mtlFile) {
    showError('No .mtl file found in selection — please include the .mtl file.');
    return; // keep pendingMtlTarget and pendingObjData intact
  }

  // Remove old layer entry (the unshaded one)
  layerManagerRef.value?.removeLayerById(pendingMtlTarget.value.id);

  pendingMtlTarget.value = null;
  mtlHintMessage.value = null;

  canvasRef.value?.reloadWithMaterials(mtlFile, imageFiles);
};

const handleStopLoading = () => {
  if (isStopping.value) return;
  isStopping.value = true;
  if (canvasRef.value?.cancelLoading) {
    canvasRef.value.cancelLoading();
  }
  // Give the canvas one event-loop tick to process the cancellation,
  // then hide the overlay. isStopping resets when isLoading drops.
  setTimeout(() => {
    isLoading.value = false;
    isStopping.value = false;
    loadingProgress.value = 0;
    loadingStatus.value = '';
    loadingTitle.value = 'Loading...';
  }, 300);
};
</script>

<style scoped>
.viewer-3d-view {
  width: 100vw;
  height: 100vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: #1a1a1a;
  font-family: "Segoe UI", sans-serif;
}

.theme-light .viewer-3d-view {
  background: #f5f5f5;
}

.viewer-body {
  flex: 1;
  display: flex;
  overflow: hidden;
  position: relative;
}

.canvas-area {
  flex: 1;
  position: relative;
  overflow: hidden;
}

.mobile-layers-fab {
  display: none;
}

@media (max-width: 767px) {
  .mobile-layers-fab {
    display: flex;
    align-items: center;
    gap: 6px;
    position: absolute;
    bottom: 16px;
    left: 16px;
    z-index: 900;
    padding: 10px 16px;
    background: #343a40;
    color: #fff;
    border: none;
    border-radius: 24px;
    font-size: 13px;
    font-family: "Segoe UI", sans-serif;
    font-weight: 500;
    cursor: pointer;
    box-shadow: 0 3px 12px rgba(0, 0, 0, 0.35);
    transition: background 0.15s, box-shadow 0.15s;
  }

  .theme-light .mobile-layers-fab {
    background: #4a5568;
  }

  .mobile-layers-fab:hover {
    background: #4a5568;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.45);
  }
}

.drop-overlay {
  position: absolute;
  inset: 0;
  background: rgba(30, 100, 200, 0.18);
  border: 3px dashed #3388ff;
  border-radius: 4px;
  z-index: 5000;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}

.drop-overlay-content {
  text-align: center;
  color: #1a4fa0;
  background: rgba(255, 255, 255, 0.92);
  border-radius: 12px;
  padding: 32px 48px;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.18);
}

.theme-dark .drop-overlay-content {
  color: #90c8ff;
  background: rgba(30, 40, 60, 0.92);
}

.drop-icon {
  font-size: 48px;
  margin-bottom: 12px;
}

.drop-text {
  font-size: 20px;
  font-weight: 600;
}

.drag-fade-enter-active,
.drag-fade-leave-active {
  transition: opacity 0.15s ease;
}

.drag-fade-enter-from,
.drag-fade-leave-to {
  opacity: 0;
}

.loading-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
  backdrop-filter: blur(5px);
}

.theme-light .loading-overlay {
  background: rgba(255, 255, 255, 0.8);
}

.loading-content {
  text-align: center;
  color: white;
  min-width: 400px;
  max-width: 500px;
  padding: 30px;
  background: rgba(0, 0, 0, 0.8);
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
}

.theme-light .loading-content {
  color: #1a1a1a;
  background: rgba(255, 255, 255, 0.95);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
}

.spinner {
  width: 40px;
  height: 40px;
  margin: 0 auto 16px;
  border: 3px solid rgba(255, 255, 255, 0.2);
  border-top-color: #3b82f6;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

.theme-light .spinner {
  border: 3px solid rgba(0, 0, 0, 0.1);
  border-top-color: #3b82f6;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.loading-title {
  margin: 0 0 16px 0;
  font-size: 16px;
  font-weight: 600;
  font-family: "Segoe UI", sans-serif;
}

.progress-bar-container {
  width: 100%;
  height: 6px;
  background: rgba(255, 255, 255, 0.15);
  border-radius: 3px;
  overflow: hidden;
  margin-bottom: 10px;
}

.theme-light .progress-bar-container {
  background: rgba(0, 0, 0, 0.1);
}

.progress-bar {
  height: 100%;
  background: #3b82f6;
  border-radius: 3px;
  transition: width 0.3s ease;
}

.progress-bar.parsing {
  animation: pulse 1.5s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.loading-status {
  margin: 0;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.7);
  font-family: "Segoe UI", sans-serif;
}

.theme-light .loading-status {
  color: rgba(0, 0, 0, 0.6);
}

.stop-btn {
  margin-top: 16px;
  padding: 7px 20px;
  background: rgba(220, 53, 69, 0.85);
  color: white;
  border: 1px solid rgba(220, 53, 69, 0.6);
  border-radius: 6px;
  font-size: 13px;
  font-family: "Segoe UI", sans-serif;
  cursor: pointer;
  transition: background 0.2s, transform 0.1s, opacity 0.2s;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 90px;
  justify-content: center;
}

.stop-btn:hover:not(:disabled) {
  background: #dc3545;
  transform: scale(1.03);
}

.stop-btn:active:not(:disabled) {
  transform: scale(0.97);
}

.stop-btn.stopping,
.stop-btn:disabled {
  cursor: default;
  opacity: 0.7;
}

.stop-spinner {
  width: 11px;
  height: 11px;
  border: 2px solid rgba(255,255,255,0.35);
  border-top-color: white;
  border-radius: 50%;
  animation: stop-spin 0.7s linear infinite;
  flex-shrink: 0;
}

@keyframes stop-spin {
  to { transform: rotate(360deg); }
}

.theme-light .stop-btn {
  background: rgba(220, 53, 69, 0.9);
}

.error-toast,
.hint-toast {
  position: absolute;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  color: white;
  padding: 10px 16px;
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  display: flex;
  align-items: center;
  gap: 12px;
  z-index: 2000;
  font-size: 13px;
  font-family: "Segoe UI", sans-serif;
  animation: slideUp 0.3s ease;
  white-space: nowrap;
}

.error-toast {
  background: #dc3545;
}

.hint-toast {
  background: #0d6efd;
  bottom: 60px;
}

@keyframes slideUp {
  from {
    transform: translate(-50%, 60px);
    opacity: 0;
  }
  to {
    transform: translate(-50%, 0);
    opacity: 1;
  }
}

.error-toast button,
.hint-toast button {
  background: none;
  border: none;
  color: white;
  font-size: 14px;
  cursor: pointer;
  padding: 0;
  width: 18px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0.8;
  transition: opacity 0.2s;
}

.error-toast button:hover,
.hint-toast button:hover {
  opacity: 1;
}

.hint-action-btn {
  width: auto !important;
  padding: 2px 8px !important;
  border: 1px solid rgba(255,255,255,0.6) !important;
  border-radius: 4px;
  font-size: 12px !important;
}
</style>
