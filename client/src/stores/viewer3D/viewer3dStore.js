// Pinia store for 3D viewer state (replaces composables/useViewer3D.js)
// Provides devtools integration and consistency with the map stores.
import { defineStore } from 'pinia';
import { ref, shallowRef, markRaw } from 'vue';
import { loadFromStorage, saveToStorage } from '../../utils/localStorage';

export const useViewer3DStore = defineStore('viewer3d', () => {
  // Shared Three.js objects (use shallowRef to avoid deep reactivity on Three.js objects)
  const scene = shallowRef(null);
  const camera = shallowRef(null);
  const renderer = shallowRef(null);
  const controls = shallowRef(null);
  const giro3dInstance = shallowRef(null);

  // Models and scene state
  const loadedModels = ref([]);
  const initialCameraPosition = ref(null);
  const initialCameraTarget = ref(null);

  // View settings
  const showWireframe = ref(false);
  const showBoundingBox = ref(true);
  const showGrid = ref(true);
  const showAxes = ref(true);
  const showNormals = ref(false);

  // Measurement state
  const measurementMode = ref(null); // null, 'distance', 'area'
  const measurements = ref([]);
  const measurementPoints = ref([]);

  // Coordinate picker
  const pickMode = ref(false);
  const pickedCoord = ref(null);

  const togglePickMode = () => {
    pickMode.value = !pickMode.value;
    if (!pickMode.value) pickedCoord.value = null;
  };

  const setPickedCoord = (coord) => {
    pickedCoord.value = coord;
  };

  // Scene bookmarks – persisted to localStorage
  const _BOOKMARK_KEY = 'viewer3d_bookmarks';
  const bookmarks = ref(loadFromStorage(_BOOKMARK_KEY, []));

  const addBookmark = (name, position, target) => {
    bookmarks.value.push({
      name,
      position: { x: position.x, y: position.y, z: position.z },
      target:   { x: target.x,   y: target.y,   z: target.z   },
    });
    saveToStorage(_BOOKMARK_KEY, bookmarks.value);
  };

  const removeBookmark = (index) => {
    bookmarks.value.splice(index, 1);
    saveToStorage(_BOOKMARK_KEY, bookmarks.value);
  };

  // Scene management
  const setScene = (newScene) => {
    scene.value = newScene;
  };

  const setCamera = (newCamera) => {
    camera.value = newCamera;
  };

  const setRenderer = (newRenderer) => {
    renderer.value = newRenderer;
  };

  const setControls = (newControls) => {
    controls.value = newControls;
  };

  const setGiro3dInstance = (inst) => {
    giro3dInstance.value = inst;
  };

  // Model management
  const addModel = (model) => {
    loadedModels.value.push(markRaw(model));
  };

  const clearModels = () => {
    loadedModels.value.forEach(model => {
      if (scene.value) {
        scene.value.remove(model);
      }
      // Dispose GPU resources to prevent VRAM leaks on repeated model loads.
      model.traverse((child) => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          const materials = Array.isArray(child.material) ? child.material : [child.material];
          materials.forEach(mat => {
            // Dispose any textures the material references.
            for (const key of Object.keys(mat)) {
              const val = mat[key];
              if (val && typeof val.dispose === 'function' && val.isTexture) val.dispose();
            }
            mat.dispose();
          });
        }
      });
    });
    loadedModels.value = [];
  };

  // Camera management
  const storeInitialCamera = () => {
    if (camera.value && controls.value) {
      initialCameraPosition.value = camera.value.position.clone();
      initialCameraTarget.value = controls.value.target.clone();
    }
  };

  const resetCamera = () => {
    if (camera.value && controls.value && initialCameraPosition.value && initialCameraTarget.value) {
      camera.value.position.copy(initialCameraPosition.value);
      controls.value.target.copy(initialCameraTarget.value);
      controls.value.update();
    }
  };

  // View settings
  const toggleWireframe = () => {
    showWireframe.value = !showWireframe.value;
    loadedModels.value.forEach(model => {
      model.traverse((child) => {
        if (child.isMesh) {
          child.material.wireframe = showWireframe.value;
        }
      });
    });
  };

  const toggleBoundingBox = () => {
    showBoundingBox.value = !showBoundingBox.value;
    if (scene.value) {
      const boxHelper = scene.value.getObjectByName('boxHelper');
      if (boxHelper) {
        boxHelper.visible = showBoundingBox.value;
      }
    }
  };

  const toggleGrid = () => {
    showGrid.value = !showGrid.value;
    if (scene.value) {
      const grid = scene.value.getObjectByName('gridHelper');
      if (grid) grid.visible = showGrid.value;
    }
  };

  const toggleAxes = () => {
    showAxes.value = !showAxes.value;
    if (scene.value) {
      const axes = scene.value.getObjectByName('axesHelper');
      if (axes) axes.visible = showAxes.value;
    }
  };

  const toggleNormals = () => {
    showNormals.value = !showNormals.value;
    // Actual helper creation/removal is handled in Canvas.vue via a watcher on showNormals
  };

  // Measurement management
  const startMeasurement = (mode) => {
    measurementMode.value = mode;
    measurementPoints.value = [];
  };

  const addMeasurementPoint = (point) => {
    measurementPoints.value.push(point);
  };

  const completeMeasurement = (measurement) => {
    measurements.value.push(measurement);
    measurementMode.value = null;
    measurementPoints.value = [];
  };

  const cancelMeasurement = () => {
    measurementMode.value = null;
    measurementPoints.value = [];
  };

  const clearMeasurements = () => {
    measurements.value = [];
    measurementPoints.value = [];
  };

  const removeMeasurement = (index) => {
    measurements.value.splice(index, 1);
  };

  // Cleanup
  const cleanup = () => {
    loadedModels.value.forEach(model => {
      model.traverse((child) => {
        if (child.isMesh) {
          if (child.geometry) child.geometry.dispose();
          if (child.material) {
            if (Array.isArray(child.material)) {
              child.material.forEach(mat => mat.dispose());
            } else {
              child.material.dispose();
            }
          }
        }
      });
      if (scene.value) {
        scene.value.remove(model);
      }
    });
    loadedModels.value = [];
    
    clearMeasurements();

    if (giro3dInstance.value) {
      giro3dInstance.value.dispose();
      giro3dInstance.value = null;
    } else if (renderer.value) {
      renderer.value.dispose();
    }

    scene.value = null;
    camera.value = null;
    renderer.value = null;
    controls.value = null;
  };

  return {
    // Three.js objects
    scene,
    camera,
    renderer,
    controls,
    giro3dInstance,
    setScene,
    setCamera,
    setRenderer,
    setControls,
    setGiro3dInstance,

    // Models
    loadedModels,
    addModel,
    clearModels,

    // Camera
    initialCameraPosition,
    initialCameraTarget,
    storeInitialCamera,
    resetCamera,

    // View settings
    showWireframe,
    showBoundingBox,
    showGrid,
    showAxes,
    showNormals,
    toggleWireframe,
    toggleBoundingBox,
    toggleGrid,
    toggleAxes,
    toggleNormals,

    // Measurements
    measurementMode,
    measurements,
    measurementPoints,
    startMeasurement,
    addMeasurementPoint,
    completeMeasurement,
    cancelMeasurement,
    clearMeasurements,
    removeMeasurement,

    // Coordinate picker
    pickMode,
    pickedCoord,
    togglePickMode,
    setPickedCoord,

    // Bookmarks
    bookmarks,
    addBookmark,
    removeBookmark,

    // Cleanup
    cleanup,
  };
});
