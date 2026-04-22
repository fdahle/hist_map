import { markRaw } from "vue";
import { tryRegisterProjection } from "../utils/crs";
import { createGeoTIFFLayerConfig } from "../utils/layerFactory";
import { LAYER_STATUS } from "../constants/layerConstants";

export function useGeoTIFFLoader(map, layerStore) {
  const scanGeoTIFFUrl = (url, layerId) => new Promise((resolve) => {
    const worker = new Worker(
      new URL('../workers/geotiffWorker.js', import.meta.url),
      { type: 'module' },
    );
    const timeout = setTimeout(() => { worker.terminate(); resolve(null); }, 30_000);
    worker.onmessage = (e) => {
      const { type, metadata, progress } = e.data;
      if (type === 'PROGRESS') {
        layerStore.setLayerProgress(layerId, progress ?? 0);
      } else if (type === 'COMPLETE') {
        clearTimeout(timeout);
        worker.terminate();
        resolve(metadata);
      } else if (type === 'ERROR') {
        clearTimeout(timeout);
        worker.terminate();
        resolve(null);
      }
    };
    worker.onerror = () => { clearTimeout(timeout); worker.terminate(); resolve(null); };
    worker.postMessage({ url, layerId });
  });

  const scanAndApplyGeoTIFF = async (layerId, layerConf, category, zIndex) => {
    const resolvedConf = { ...layerConf };

    try {
      const scanned = await scanGeoTIFFUrl(resolvedConf.url, layerId);
      if (scanned) {
        if (scanned.bands      != null) resolvedConf.bandCount    = scanned.bands;
        if (scanned.dataMin    != null) resolvedConf.dataMin      = scanned.dataMin;
        if (scanned.dataMax    != null) resolvedConf.dataMax      = scanned.dataMax;
        if (scanned.noDataValue!= null) resolvedConf.noDataValue  = scanned.noDataValue;
        if (scanned.extent     != null) resolvedConf.extent       = scanned.extent;
        if (scanned.projection != null && !resolvedConf.tiffProjection)
          resolvedConf.tiffProjection = scanned.projection;

        if (resolvedConf.tiffProjection) {
          const registered = await tryRegisterProjection(
            resolvedConf.tiffProjection,
            resolvedConf.tiffProj4,
          );
          if (!registered) {
            console.warn(`[GeoTIFF] Could not register CRS ${resolvedConf.tiffProjection} — layer may not reproject correctly`);
          }
        }

        if (window.__APP_DEBUG__ || import.meta.env.DEV) {
          console.debug(`=== LAYER DEBUG — ${resolvedConf.name} (GeoTIFF, URL) ===`);
          console.debug('  bands:', scanned.bands, '| min:', scanned.dataMin, '| max:', scanned.dataMax);
          console.debug('  projection:', scanned.projection, '| nodata:', scanned.noDataValue);
          console.debug('  extent:', scanned.extent, '| tiled:', scanned.isTiled);
        }

        if (scanned.isTiled === false) {
          try {
            layerStore.setLayerProgress(layerId, 85, 'Downloading raster…');
            const resp = await fetch(resolvedConf.url);
            if (resp.ok) {
              resolvedConf.file = await resp.blob();
              resolvedConf.url  = undefined;
            }
          } catch (_blobErr) {
            console.warn(`[GeoTIFF] Could not pre-download non-COG file for ${resolvedConf.name}, falling back to range requests`);
          }
        }
      }
    } catch (_) {
      // Non-fatal — proceed with whatever metadata is available.
    }

    const layerConfig = createGeoTIFFLayerConfig(resolvedConf, map, zIndex, layerId);
    const resolvedMetadata = {
      bands:          resolvedConf.bandCount       ?? null,
      dataMin:        resolvedConf.dataMin         ?? null,
      dataMax:        resolvedConf.dataMax         ?? null,
      noDataValue:    resolvedConf.noDataValue     ?? null,
      extent:         resolvedConf.extent          ?? null,
      tiffProjection: resolvedConf.tiffProjection  ?? null,
      file:           null,
    };

    const storeEntry = layerStore.getLayerById(layerId);
    if (storeEntry) {
      storeEntry.layerInstance = markRaw(layerConfig.layerInstance);
      storeEntry.metadata = resolvedMetadata;
    }

    map.addLayer(layerConfig.layerInstance);
    layerStore.setLayerStatus(layerId, LAYER_STATUS.READY);
    layerStore.updateLayerZIndexes();

    const src = layerConfig.layerInstance.getSource?.();
    if (src) {
      src.once('error', () => {
        const proj = resolvedConf.tiffProjection ?? 'unknown CRS';
        layerStore.setLayerError(
          layerId,
          `Could not display GeoTIFF — the file's CRS (${proj}) cannot be reprojected to the map's projection. Re-project the file with GDAL/QGIS first.`,
        );
      });
    }
  };

  return { scanAndApplyGeoTIFF };
}
