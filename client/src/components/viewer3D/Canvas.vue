<template>
  <div
    ref="viewerRef"
    class="viewer-canvas"
  >
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useViewer3DStore } from '@/stores/viewer3D/viewer3dStore';

import { useLoadingCancellation } from '@/composables/viewer3D/useLoadingCancellation.js';
import { useCameraControls } from '@/composables/viewer3D/useCameraControls.js';
import { useNormalsHelpers } from '@/composables/viewer3D/useNormalsHelpers.js';
import { useViewer3DLayers } from '@/composables/viewer3D/useViewer3DLayers.js';
import { useObjLoader } from '@/composables/viewer3D/useObjLoader.js';
import { usePointCloudLoader } from '@/composables/viewer3D/usePointCloudLoader.js';
import { useDEMLoader } from '@/composables/viewer3D/useDEMLoader.js';
import { useCameraVisualizer } from '@/composables/viewer3D/useCameraVisualizer.js';
import { useMarkers3D } from '@/composables/viewer3D/useMarkers3D.js';
import { useMeasurements3D } from '@/composables/viewer3D/useMeasurements3D.js';
import { useSceneInit } from '@/composables/viewer3D/useSceneInit.js';

const props = defineProps({
  modelUrls: {
    type: Array,
    default: () => []
  },
  pointcloudUrls: {
    type: Array,
    default: () => []
  },
  coordinates: {
    type: Object,
    required: true,
    validator: (value) => typeof value.x === 'number' && typeof value.y === 'number'
  },
  modelName: {
    type: String,
    default: 'Model'
  }
});

const emit = defineEmits([
  'scene-ready', 'model-loaded', 'loading-error', 'loading-progress',
  'parsing-started', 'parsing-progress', 'building-geometry',
  'unsupported-file', 'suggest-materials',
]);

const viewerRef = ref(null);
const fileLoadedCount = ref(0);
const pendingObjData = ref(null);

// --- Store (for cleanup) ---
const viewer3DStore = useViewer3DStore();
const { renderer } = storeToRefs(viewer3DStore);
const { cleanup } = viewer3DStore;

// --- Loading cancellation ---
const {
  loadingCancelled,
  activeReaders,
  activeWorker,
  activeWorkerCancel,
  cancelLoading,
  setActiveStreamReader,
  clearActiveStreamReader,
} = useLoadingCancellation();

// --- Camera controls ---
const {
  bookmarkTween,
  adjustCameraToModel,
  fitCameraToScene,
  setCameraPreset,
  resetToInitialCamera,
  zoomToLayer,
  applyBookmark,
} = useCameraControls({ emit });

// --- Normals helpers ---
const { updateNormalsHelpers } = useNormalsHelpers();

// --- Layer management ---
const { findCOPCEntity, toggleLayerVisibility, removeLayer } = useViewer3DLayers({ emit });

// --- OBJ loader ---
const {
  loadUserObjFile,
  reloadWithMaterials,
  loadModelFromUrl,
} = useObjLoader({
  emit,
  loadingCancelled,
  activeReaders,
  setActiveStreamReader,
  clearActiveStreamReader,
  fileLoadedCount,
  pendingObjData,
  adjustCameraToModel,
  updateNormalsHelpers,
  removeLayer,
});

// --- Point cloud loader ---
const {
  loadPointCloudFile,
  loadPointCloudFromUrl,
  applyColorMode,
  setCOPCPointSize,
} = usePointCloudLoader({
  emit,
  loadingCancelled,
  activeReaders,
  setActiveStreamReader,
  clearActiveStreamReader,
  activeWorker,
  activeWorkerCancel,
  fileLoadedCount,
  adjustCameraToModel,
  findCOPCEntity,
});

// --- DEM loader ---
const { loadDEMFile, applyVerticalExaggeration } = useDEMLoader({
  emit,
  loadingCancelled,
  fileLoadedCount,
  adjustCameraToModel,
});

// --- Camera visualizer ---
const { loadCamerasFile } = useCameraVisualizer({
  emit,
  loadingCancelled,
  fileLoadedCount,
  activeReaders,
});

// --- Markers ---
const { loadMarkersFile } = useMarkers3D({ emit });

// --- Measurements ---
const {
  onCanvasClick,
  onMouseDown,
  enableMeasurementMode,
  disableMeasurementMode,
  clearMeasurements,
  clearAllMeasurements,
  saveCurrentMeasurement,
  undoLastPoint,
  cancelCurrentMeasurement,
  removeSavedMeasurement,
} = useMeasurements3D({ emit, viewerRef });

// --- Scene init ---
const { initViewer, cleanup: cleanupScene } = useSceneInit({
  viewerRef,
  emit,
  onCanvasClick,
  onMouseDown,
  bookmarkTween,
});

// --- File drop router ---
const processDroppedFiles = (files) => {
  if (!files || files.length === 0) return;

  const objFiles = [];
  const mtlFiles = [];
  const imageFiles = [];

  for (const file of files) {
    const lower = file.name.toLowerCase();
    if (lower.endsWith('.obj')) {
      objFiles.push(file);
    } else if (lower.endsWith('.mtl')) {
      mtlFiles.push(file);
    } else if (/\.(jpg|jpeg|png|bmp|gif|webp)$/.test(lower)) {
      imageFiles.push(file);
    } else if (lower.endsWith('.ply') || lower.endsWith('.las') || lower.endsWith('.laz')) {
      loadPointCloudFile(file);
    } else if (lower.endsWith('.txt') || lower.endsWith('.csv')) {
      loadCamerasFile(file);
    } else if (lower.endsWith('.xml')) {
      loadMarkersFile(file);
    } else if (lower.endsWith('.tif') || lower.endsWith('.tiff')) {
      loadDEMFile(file);
    } else {
      emit('unsupported-file', { ext: lower.split('.').pop() });
    }
  }

  if (objFiles.length === 0) {
    if (mtlFiles.length > 0 || imageFiles.length > 0) {
      emit('unsupported-file', {
        ext: mtlFiles[0]?.name.split('.').pop() ?? imageFiles[0]?.name.split('.').pop(),
        message: 'Drop an .obj file together with the .mtl / texture files to load a model.',
      });
    }
    return;
  }

  for (const file of objFiles) {
    const stem = file.name.replace(/\.obj$/i, '').toLowerCase();
    const matchedMtl = mtlFiles.find(m => m.name.replace(/\.mtl$/i, '').toLowerCase() === stem) ?? mtlFiles[0] ?? null;
    loadUserObjFile(file, matchedMtl, imageFiles);
  }
};

// --- Screenshot ---
const saveImage = () => {
  if (!renderer.value) return;
  try {
    const link = document.createElement('a');
    link.download = '3d-scene.png';
    link.href = renderer.value.domElement.toDataURL('image/png');
    link.click();
  } catch {
    alert('Could not export image: scene contains cross-origin textures that block canvas export.');
  }
};

// --- Lifecycle ---
onMounted(async () => {
  if (viewerRef.value) {
    await initViewer();

    if (props.modelUrls.length > 0) {
      props.modelUrls.forEach((url, index) => loadModelFromUrl(url, index));
    }

    if (props.pointcloudUrls.length > 0) {
      props.pointcloudUrls.forEach((url, index) => loadPointCloudFromUrl(url, index));
    }
  }
});

onUnmounted(() => {
  cleanupScene();
  if (activeWorker.value) {
    activeWorker.value.terminate();
    activeWorker.value = null;
  }
  activeWorkerCancel.value?.();
  activeWorkerCancel.value = null;
  clearAllMeasurements();
  cleanup();
});

watch(() => props.modelUrls, (newUrls) => {
  if (newUrls && newUrls.length > 0) {
    newUrls.forEach((url, index) => loadModelFromUrl(url, index));
  }
}, { immediate: false });

watch(() => props.pointcloudUrls, (newUrls) => {
  if (newUrls && newUrls.length > 0) {
    newUrls.forEach((url, index) => loadPointCloudFromUrl(url, index));
  }
}, { immediate: false });

// --- Public API ---
defineExpose({
  cancelLoading,
  loadUserObjFile,
  reloadWithMaterials,
  loadMarkersFile,
  loadModelFromUrl,
  loadPointCloudFile,
  loadDEMFile,
  loadCamerasFile,
  fitCameraToScene,
  toggleLayerVisibility,
  removeLayer,
  enableMeasurementMode,
  disableMeasurementMode,
  clearMeasurements,
  saveCurrentMeasurement,
  undoLastPoint,
  cancelCurrentMeasurement,
  removeSavedMeasurement,
  setCameraPreset,
  resetToInitialCamera,
  zoomToLayer,
  applyVerticalExaggeration,
  processDroppedFiles,
  applyBookmark,
  applyColorMode,
  setCOPCPointSize,
  saveImage,
});
</script>

<style scoped>
.viewer-canvas {
  position: relative;
  width: 100%;
  height: 100%;
}
</style>
