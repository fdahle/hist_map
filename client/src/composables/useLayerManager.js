// client/src/composables/useLayerManager.js
import { watch } from 'vue';
import { useLayerStore } from '../stores/map/layerStore';
import { useSelectionStore } from '../stores/map/selectionStore';
import { generateUUID } from '../utils/helpers';
import { logger } from '../utils/logger';
import {
  createTileLayerConfig,
  createWMSLayerConfig,
  createWMTSLayerConfig,
  createGeoJSONLayerConfig,
  createGeoTIFFLayerConfig,
} from '../utils/layerFactory';
import {
  Z_INDEX,
  LAYER_CATEGORY,
  LAYER_STATUS,
  GEOMETRY_TYPE,
} from '../constants/layerConstants';
import { useCrsCompatibility } from './useCrsCompatibility';
import { useGeoTIFFLoader } from './useGeoTIFFLoader';
import { useGeoJsonLoader } from './useGeoJsonLoader';
import { useLayerStyling } from './useLayerStyling';
import { useMapSelection } from './useMapSelection';

export function useLayerManager(map) {
  const layerStore = useLayerStore();
  const selectionStore = useSelectionStore();

  // Shared state passed into sub-composables that need mutual access
  const activeWorkers = new Map();
  const searchIndex = new Map();

  const { checkCrsCompatibility } = useCrsCompatibility(map, layerStore);
  const { scanAndApplyGeoTIFF } = useGeoTIFFLoader(map, layerStore);
  const { loadGeoJsonLayer } = useGeoJsonLoader(map, layerStore, activeWorkers, searchIndex);
  const { setupSelection, setSelectionActive, getSelectInteraction, cleanupSelection } = useMapSelection(map, layerStore, selectionStore);
  const { applyLayerColor, applyLayerColormap, applyLayerColorBy, applySubCategories } = useLayerStyling(layerStore, getSelectInteraction);

  // ---------------------------------------------------------------------------
  // Register the cancel handler so the store can terminate workers.
  // ---------------------------------------------------------------------------
  layerStore.registerCancelHandler((layerId) => {
    const worker = activeWorkers.get(layerId);
    if (worker) { worker.terminate(); activeWorkers.delete(layerId); }
    const storeLayer = layerStore.layers.find((l) => l._layerId === layerId);
    if (storeLayer?.layerInstance) { map.removeLayer(storeLayer.layerInstance); storeLayer.layerInstance = null; }
    searchIndex.delete(layerId);
  });

  // Trigger GeoJSON downloads when a layer becomes active and is still IDLE.
  watch(
    () => layerStore.layers.map((l) => ({
      id: l._layerId,
      active: l.active,
      status: l.status,
      type: l.type,
    })),
    (layerStates) => {
      layerStates.forEach((state) => {
        if (state.active && state.status === LAYER_STATUS.IDLE && state.type === 'geojson') {
          const layer = layerStore.layers.find((l) => l._layerId === state.id);
          if (layer) loadGeoJsonLayer(layer);
        }
      });
    },
  );

  const processLayer = async (layerConf, category) => {
    const layerId = layerConf._layerId || generateUUID();
    const zIndex = category === LAYER_CATEGORY.BACKGROUND
      ? Z_INDEX.BACKGROUND
      : category === LAYER_CATEGORY.BASE
        ? Z_INDEX.BASE
        : Z_INDEX.OVERLAY;

    let layerConfig;

    switch (layerConf.type) {
      case "tile":
        layerConfig = createTileLayerConfig(layerConf, map, zIndex, layerId);
        break;
      case "wms":
        layerConfig = createWMSLayerConfig(layerConf, map, zIndex, layerId);
        break;
      case "wmts":
        layerConfig = createWMTSLayerConfig(layerConf, map, zIndex, layerId);
        break;
      case "geotiff": {
        // Server-hosted GeoTIFFs need an async worker scan to extract data
        // range, nodata and CRS before the OL layer can be created correctly.
        if (layerConf.url && !layerConf.file) {
          layerStore.addLayer({
            layerId,
            name:          layerConf.name,
            layerInstance: null,
            type:          'geotiff',
            geometryType:  GEOMETRY_TYPE.RASTER,
            category,
            visible:       layerConf.visible,
            isUserAdded:   layerConf.isUserAdded ?? false,
            attribution:   layerConf.attribution ?? null,
            url:           layerConf.url,
            metadata: {
              bands: null, dataMin: null, dataMax: null, noDataValue: null,
              extent: null, tiffProjection: layerConf.tiffProjection ?? null, file: null,
            },
          });
          layerStore.setLayerStatus(layerId, LAYER_STATUS.LOADING_DETAILS);
          scanAndApplyGeoTIFF(layerId, layerConf, category, zIndex);
          return;
        }
        // Drag-dropped or pre-scanned blobs are created synchronously.
        layerConfig = createGeoTIFFLayerConfig(layerConf, map, zIndex, layerId);
        layerConfig.metadata = {
          bands:          layerConf.bandCount      ?? null,
          dataMin:        layerConf.dataMin        ?? null,
          dataMax:        layerConf.dataMax        ?? null,
          noDataValue:    layerConf.noDataValue    ?? null,
          extent:         layerConf.extent         ?? null,
          tiffProjection: layerConf.tiffProjection ?? null,
          file:           layerConf.file           ?? null,
        };
        break;
      }
      case "geojson":
        layerConfig = createGeoJSONLayerConfig(layerConf, layerId);
        break;
      default:
        logger.error('LayerManager', `Unknown layer type: ${layerConf.type}`);
        return;
    }

    layerStore.addLayer({
      ...layerConfig,
      category,
      isUserAdded: layerConf.isUserAdded ?? false,
      attribution: layerConf.attribution ?? null,
      order: layerConf.order ?? 0,
    });

    if (layerConfig.layerInstance) {
      map.addLayer(layerConfig.layerInstance);
      layerStore.setLayerStatus(layerId, LAYER_STATUS.READY);
      layerStore.updateLayerZIndexes();

      if (layerConf.type === 'geotiff') {
        if (window.__APP_DEBUG__ || import.meta.env.DEV) {
          console.debug(`=== LAYER DEBUG — ${layerConf.name} (GeoTIFF, blob) ===`);
          console.debug('  bands:', layerConf.bandCount, '| min:', layerConf.dataMin, '| max:', layerConf.dataMax);
          console.debug('  projection:', layerConf.tiffProjection, '| nodata:', layerConf.noDataValue);
        }
        const src = layerConfig.layerInstance.getSource?.();
        if (src) {
          src.once('error', () => {
            const proj = layerConf.tiffProjection ?? 'unknown CRS';
            layerStore.setLayerError(
              layerId,
              `Could not display GeoTIFF — the file's CRS (${proj}) cannot be reprojected to the map's projection. Re-project the file with GDAL/QGIS first.`,
            );
          });
        }
      }
    }

    if (category === LAYER_CATEGORY.BASE) {
      checkCrsCompatibility(layerConf, layerId);
    }

    return layerConfig;
  };

  const removeLayer = (layerId) => {
    const layer = layerStore.getLayerById(layerId);
    if (!layer) return;
    if (layer.layerInstance) map.removeLayer(layer.layerInstance);
    if (layer.url?.startsWith('blob:')) URL.revokeObjectURL(layer.url);
    searchIndex.delete(layerId);
    const worker = activeWorkers.get(layerId);
    if (worker) { worker.terminate(); activeWorkers.delete(layerId); }
    layerStore.removeLayer(layerId);
  };

  const cleanup = () => {
    activeWorkers.forEach((w) => w.terminate());
    activeWorkers.clear();
    searchIndex.clear();
    cleanupSelection();
    layerStore.layers.forEach((l) => {
      if (l.layerInstance) map.removeLayer(l.layerInstance);
      if (l.url?.startsWith('blob:')) URL.revokeObjectURL(l.url);
    });
    layerStore.reset();
  };

  return {
    processLayer,
    removeLayer,
    cleanup,
    applyLayerColor,
    applyLayerColormap,
    applyLayerColorBy,
    applySubCategories,
    searchIndex,
    setupSelection,
    setSelectionActive,
  };
}
