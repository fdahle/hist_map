// client/src/stores/layerStore.js
import { defineStore } from "pinia";
import { markRaw, ref, computed } from "vue";
import { 
  LAYER_STATUS, 
  LAYER_CATEGORY, 
  GEOMETRY_TYPE, 
  DEFAULT_COLOR, 
  Z_INDEX,
  PROGRESS_UPDATE_DEBOUNCE 
} from "../../constants/layerConstants";
import { debounce } from "../../utils/helpers";

export const useLayerStore = defineStore("layers", () => {
  const layers = ref([]);
  const selectedLayerId = ref(null);
  
  // Index for O(1) layer lookups by ID
  const layerIndex = new Map();

  // --- ACTIONS ---

  /**
   * @param {object} opts
   * @param {string}        opts.layerId
   * @param {string}        opts.name
   * @param {object|null}   opts.layerInstance   - OL layer (null for deferred geojson)
   * @param {string}        opts.type            - "tile" | "wms" | "wmts" | "geojson"
   * @param {string}        opts.category        - "base" | "overlay"
   * @param {boolean}       opts.visible
   * @param {string}        [opts.geometryType]  - "point" | "line" | "polygon" | "unknown"
   * @param {string}        [opts.color]
   * @param {string|null}   [opts.url]
   * @param {string[]}      [opts.searchFields]
   * @param {dictionary}    [opts.metadata]
   */
  const addLayer = ({
    layerId,
    name,
    layerInstance,
    type,
    category,
    visible,
    geometryType = GEOMETRY_TYPE.UNKNOWN,
    color = DEFAULT_COLOR,
    strokeColor = null,
    fillColor = null,
    renderMode = 'vector',
    url = null,
    searchFields = [],
    metadata = {},
    isUserAdded = false,
    groupBy = null,
    pointType = null,
    attribution = null,
    sourceCrs = null,
    thumbnailUrl = null,
    downloadUrl = null,
    colorBy = null,
  }) => {
    if (layers.value.some((l) => l._layerId === layerId)) return;

    let initialStatus = LAYER_STATUS.READY;
    if (type === "geojson" && !layerInstance) {
      initialStatus = LAYER_STATUS.IDLE;
    }

    // Set z-index based on category
    const zIndex =
      category === LAYER_CATEGORY.BACKGROUND
        ? Z_INDEX.BACKGROUND
        : category === LAYER_CATEGORY.BASE
          ? Z_INDEX.BASE
          : Z_INDEX.OVERLAY;

    if (layerInstance) {
      layerInstance.setZIndex(zIndex);
    }

    const layerObj = {
      _layerId: layerId,
      name,
      type,
      category,
      active: visible,
      layerInstance: layerInstance ? markRaw(layerInstance) : null,
      geometryType,
      color,
      strokeColor,
      fillColor,
      renderMode,
      colormap: 'grayscale',
      colormapInverted: false,
      url,
      progress: 0,
      status: initialStatus,
      error: null,
      zIndex,
      searchFields,
      metadata: metadata,
      // null = not yet checked, true = compatible, false = incompatible with current map CRS
      crsCompatible: null,
      isUserAdded,
      // sub-category grouping: attribute name to split features by
      groupBy,
      pointType,
      // populated after load: { value: { color: '#hex', visible: true } }
      subCategories: {},
      // true when groupBy field was not found in any loaded feature
      groupByMissing: false,
      // non-fatal warning message shown in the layer panel (e.g. bad group_by field)
      warning: null,
      // attribution text for base tile/WMS/WMTS layers (HTML allowed)
      attribution,
      sourceCrs,
      thumbnailUrl,
      downloadUrl,
      colorBy,
    };
    layers.value.push(layerObj);
    // Index must point to the reactive proxy that Vue created, not the raw object.
    // The proxy is the last element after push.
    layerIndex.set(layerId, layers.value[layers.value.length - 1]);
  };

  const removeLayer = (layerId) => {
    if (selectedLayerId.value === layerId) selectedLayerId.value = null;
    const idx = layers.value.findIndex((l) => l._layerId === layerId);
    if (idx === -1) return;
    layers.value.splice(idx, 1);
    layerIndex.delete(layerId);
  };

  const reset = () => {
    layers.value = [];
    layerIndex.clear();
    selectedLayerId.value = null;
  };

  const selectLayer  = (layerId) => { selectedLayerId.value = layerId; };
  const deselectLayer = () => { selectedLayerId.value = null; };

  // O(1) lookup helper
  const getLayerById = (layerId) => layerIndex.get(layerId);

  const debouncedProgressUpdates = new Map();
  
  const setLayerProgress = (layerId, progress) => {
    const layer = layerIndex.get(layerId);
    if (!layer) return;

    if (progress === 100) {
      layer.progress = progress;
      return;
    }

    if (!debouncedProgressUpdates.has(layerId)) {
      debouncedProgressUpdates.set(
        layerId,
        debounce((prog) => {
          const l = layerIndex.get(layerId);
          if (l) l.progress = prog;
        }, PROGRESS_UPDATE_DEBOUNCE)
      );
    }

    debouncedProgressUpdates.get(layerId)(progress);
  };

  const setLayerStatus = (layerId, status) => {
    const layer = layerIndex.get(layerId);
    if (layer) layer.status = status;
  };

  const setCrsCompatibility = (layerId, compatible) => {
    const layer = layerIndex.get(layerId);
    if (layer) layer.crsCompatible = compatible;
  };

  const setLayerError = (layerId, errorMessage) => {
    const layer = layerIndex.get(layerId);
    if (layer) {
      layer.error = errorMessage;
      layer.status = LAYER_STATUS.ERROR;
      layer.progress = 0;
    }
  };

  const retryLayer = (layerId) => {
    const layer = layerIndex.get(layerId);
    if (layer && layer.status === LAYER_STATUS.ERROR) {
      layer.status = LAYER_STATUS.IDLE;
      layer.error = null;
      layer.progress = 0;
      layer.active = true;
    }
  };

  // Callback registered by useLayerManager so the store can reach the worker.
  // The composable sets this once; the store calls it on cancel.
  let _onCancelLayer = null;
  const registerCancelHandler = (handler) => { _onCancelLayer = handler; };

  const cancelLayerLoad = (layerId) => {
    const layer = layerIndex.get(layerId);
    if (layer && [
      LAYER_STATUS.DOWNLOADING, 
      LAYER_STATUS.PROCESSING, 
      LAYER_STATUS.LOADING_DETAILS
    ].includes(layer.status)) {
      // 1. Terminate the worker (via the composable's handler)
      if (_onCancelLayer) _onCancelLayer(layerId);
      // 2. Reset state
      layer.status = LAYER_STATUS.IDLE;
      layer.progress = 0;
      layer.active = false;
    }
  };

  // UPDATED: Toggle Logic - ONLY changes visibility, doesn't add/remove from map
  const toggleLayer = async (layerId) => {
    const layer = layerIndex.get(layerId);

    if (
      !layer ||
      layer.status === LAYER_STATUS.ERROR ||
      layer.status === LAYER_STATUS.DOWNLOADING ||
      layer.status === LAYER_STATUS.PROCESSING ||
      layer.status === LAYER_STATUS.LOADING_DETAILS
    )
      return;

    // BASE LAYER LOGIC
    if (layer.category === LAYER_CATEGORY.BASE) {
      if (layer.active) return;
      
      // Disable other base layers
      layers.value.forEach((l) => {
        if (l.category === LAYER_CATEGORY.BASE && l.active) {
          l.active = false;
          if (l.layerInstance) l.layerInstance.setVisible(false);
        }
      });
      
      // Enable this one
      layer.active = true;
      if (layer.layerInstance) layer.layerInstance.setVisible(true);
    } 
    // OVERLAY LAYER LOGIC
    else {
      layer.active = !layer.active;
      
      // Update OpenLayers Visibility
      if (layer.layerInstance) {
         layer.layerInstance.setVisible(layer.active);
      }
    }
  };

  // Updates the stored color value only.
  // The composable's applyLayerColor() handles re-styling OL features.
  const updateLayerColor = (layerId, newColor) => {
    const layerObj = layerIndex.get(layerId);
    if (!layerObj) return;
    layerObj.color = newColor;
    layerObj.strokeColor = newColor;
    layerObj.fillColor = null;
  };

  // Updates the stored colormap for a raster layer.
  // The composable's applyLayerColormap() applies the new WebGL style.
  const updateLayerColormap = (layerId, colormapId) => {
    const layerObj = layerIndex.get(layerId);
    if (!layerObj) return;
    layerObj.colormap = colormapId;
  };

  const setLayerColorBy = (layerId, colorBy) => {
    const layerObj = layerIndex.get(layerId);
    if (!layerObj) return;
    layerObj.colorBy = colorBy;
  };

  const updateLayerColormapInverted = (layerId, inverted) => {
    const layerObj = layerIndex.get(layerId);
    if (!layerObj) return;
    layerObj.colormapInverted = inverted;
  };

  // --- Sub-category actions ---

  /**
   * Initialise sub-categories from the discovered unique values.
   * @param {string} layerId
   * @param {{ [value: string]: { color: string, visible: boolean } }} categories
   */
  const initSubCategories = (layerId, categories) => {
    const layer = layerIndex.get(layerId);
    if (!layer) return;
    layer.subCategories = categories;
  };

  const toggleSubCategory = (layerId, value) => {
    const layer = layerIndex.get(layerId);
    if (!layer?.subCategories[value]) return;
    layer.subCategories[value].visible = !layer.subCategories[value].visible;
  };

  const updateSubCategoryColor = (layerId, value, color) => {
    const layer = layerIndex.get(layerId);
    if (!layer?.subCategories[value]) return;
    layer.subCategories[value].color = color;
  };

  /**
   * Move a layer up in the stack (increases z-index)
   * @param {string} layerId - Layer ID to move
   */
  const moveLayerUp = (layerId) => {
    const index = layers.value.findIndex(l => l._layerId === layerId);
    if (index <= 0) return;
    const category = layers.value[index].category;
    // Find the nearest layer above that shares the same category
    let swapIndex = index - 1;
    while (swapIndex >= 0 && layers.value[swapIndex].category !== category) swapIndex--;
    if (swapIndex < 0) return;
    [layers.value[swapIndex], layers.value[index]] = [layers.value[index], layers.value[swapIndex]];
    updateLayerZIndexes();
  };

  /**
   * Move a layer down in the stack (decreases z-index)
   * @param {string} layerId - Layer ID to move
   */
  const moveLayerDown = (layerId) => {
    const index = layers.value.findIndex(l => l._layerId === layerId);
    if (index === -1 || index >= layers.value.length - 1) return;
    const category = layers.value[index].category;
    // Find the nearest layer below that shares the same category
    let swapIndex = index + 1;
    while (swapIndex < layers.value.length && layers.value[swapIndex].category !== category) swapIndex++;
    if (swapIndex >= layers.value.length) return;
    [layers.value[index], layers.value[swapIndex]] = [layers.value[swapIndex], layers.value[index]];
    updateLayerZIndexes();
  };

  /**
   * Update z-indexes based on array position
   * First item in array = bottom (lowest z-index)
   * Last item in array = top (highest z-index)
   */
  const updateLayerZIndexes = () => {
    // Count overlay layers for reverse z-index calculation
    const overlayCount = layers.value.filter(l => l.category === LAYER_CATEGORY.OVERLAY).length;
    let overlayIndex = 0;
    
    layers.value.forEach((layer) => {
      let newZIndex;
      if (layer.category === LAYER_CATEGORY.BACKGROUND) {
        newZIndex = Z_INDEX.BACKGROUND;
      } else if (layer.category === LAYER_CATEGORY.BASE) {
        newZIndex = Z_INDEX.BASE;
      } else {
        // Overlay layers: first in array (top of UI) gets highest z-index (renders on top)
        // Calculate reverse order: first layer gets (overlayCount-1)*10, last gets 0
        newZIndex = Z_INDEX.OVERLAY + ((overlayCount - overlayIndex - 1) * 10);
        overlayIndex++;
      }
      
      layer.zIndex = newZIndex;
      if (layer.layerInstance) {
        layer.layerInstance.setZIndex(newZIndex);
      }
    });
  };

  /**
   * Reorder layer to a specific position (used for drag & drop)
   * @param {string} layerId - Layer to move
   * @param {number} targetOverlayIndex - Target insertion index within overlay layers (includes the element being moved)
   */
  const reorderLayer = (layerId, targetOverlayIndex) => {
    // Get the layer to move
    const layer = layerIndex.get(layerId);
    if (!layer || layer.category !== LAYER_CATEGORY.OVERLAY) return;
    
    // Get all overlay layers
    const overlays = layers.value.filter(l => l.category === LAYER_CATEGORY.OVERLAY);
    const currentOverlayIndex = overlays.findIndex(l => l._layerId === layerId);
    
    if (currentOverlayIndex === -1) return;
    
    // Clamp target index to valid range (0 to length, since it's an insertion point)
    const clampedIndex = Math.max(0, Math.min(targetOverlayIndex, overlays.length));
    
    // Find indices in the full layers array
    const currentFullIndex = layers.value.findIndex(l => l._layerId === layerId);
    
    // Count all non-overlay layers (background + base) that precede overlays in the array.
    // Using only BASE would miss BACKGROUND layers (e.g. OSM tile background), causing
    // the insertion index to be off by the number of background layers.
    const nonOverlayCount = layers.value.filter(l => l.category !== LAYER_CATEGORY.OVERLAY).length;
    
    // Calculate the target insertion index in the full layers array
    // targetOverlayIndex is where we want to insert in the overlay-only array
    let targetFullIndex = nonOverlayCount + clampedIndex;
    
    // Remove from current position
    const [movedLayer] = layers.value.splice(currentFullIndex, 1);
    
    // Adjust insertion index if we removed an element before it
    if (currentFullIndex < targetFullIndex) {
      targetFullIndex--;
    }
    
    // Insert at new position
    layers.value.splice(targetFullIndex, 0, movedLayer);
    
    // Update all z-indexes
    updateLayerZIndexes();
  };

  // --- GETTERS ---
  const baseLayers = computed(() =>
    layers.value.filter((l) => l.category === LAYER_CATEGORY.BASE),
  );
  const overlayLayers = computed(() =>
    layers.value.filter((l) => l.category === LAYER_CATEGORY.OVERLAY),
  );

  return {
    layers,
    selectedLayerId,
    selectLayer,
    deselectLayer,
    baseLayers,
    overlayLayers,
    addLayer,
    removeLayer,
    reset,
    getLayerById,
    toggleLayer,
    setLayerProgress,
    setLayerStatus,
    setLayerError,
    setCrsCompatibility,
    updateLayerColor,
    updateLayerColormap,
    updateLayerColormapInverted,
    setLayerColorBy,
    retryLayer,
    cancelLayerLoad,
    registerCancelHandler,
    moveLayerUp,
    moveLayerDown,
    reorderLayer,
    updateLayerZIndexes,
    initSubCategories,
    toggleSubCategory,
    updateSubCategoryColor,
  };
});