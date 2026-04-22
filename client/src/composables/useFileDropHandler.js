import { ref } from 'vue';
import { parseCsv, detectGeomColumns, csvToGeoJson } from '../utils/csvParser';
import { tryRegisterProjection } from '../utils/crs';

const LARGE_FILE_THRESHOLD_MB = 50;
const MAX_FILE_SIZE_MB = 500;

export function useFileDropHandler(mapStore, layerManagerRef) {
  const isDragging = ref(false);
  const notification = ref(null);
  let notificationTimer = null;

  // CSV Column Picker modal state — returned so the template can bind to them.
  const csvModalOpen = ref(false);
  const csvModalFileName = ref('');
  const csvModalColumns = ref([]);
  const csvModalSampleRows = ref([]);
  const csvModalPreX = ref('');
  const csvModalPreY = ref('');
  let _csvModalResolve = null;

  const showNotification = (message, type = 'info') => {
    clearTimeout(notificationTimer);
    notification.value = { message, type };
    notificationTimer = setTimeout(() => { notification.value = null; }, 4000);
  };

  const _openCsvModal = (fileName, columns, sampleRows, preX, preY) =>
    new Promise((resolve) => {
      _csvModalResolve = resolve;
      csvModalFileName.value = fileName;
      csvModalColumns.value = columns;
      csvModalSampleRows.value = sampleRows;
      csvModalPreX.value = preX || '';
      csvModalPreY.value = preY || '';
      csvModalOpen.value = true;
    });

  const handleCsvConfirm = (result) => {
    csvModalOpen.value = false;
    if (_csvModalResolve) { _csvModalResolve(result); _csvModalResolve = null; }
  };

  const handleCsvCancel = () => {
    csvModalOpen.value = false;
    if (_csvModalResolve) { _csvModalResolve(null); _csvModalResolve = null; }
  };

  const handleDragOver = (event) => {
    if (!event.dataTransfer?.types?.includes('Files')) return;
    isDragging.value = true;
  };

  const handleDragLeave = (event) => {
    if (!event.currentTarget.contains(event.relatedTarget)) {
      isDragging.value = false;
    }
  };

  const handleDrop = (event) => {
    isDragging.value = false;
    const files = event.dataTransfer?.files;
    if (!files || files.length === 0) return;
    for (const file of files) processDroppedFile(file);
  };

  const handleRibbonFiles = (files) => {
    for (const file of files) processDroppedFile(file);
  };

  /**
   * Spawn a short-lived Web Worker that uses geotiff.js fromBlob() to validate
   * the file and extract its extent, projection, etc. — all off the main thread.
   */
  const parseGeoTIFFInWorker = (file, layerName) => new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL('../workers/geotiffWorker.js', import.meta.url),
      { type: 'module' },
    );
    const timeout = setTimeout(() => {
      worker.terminate();
      reject(new Error('File parsing timed out'));
    }, 60_000);
    worker.onmessage = (e) => {
      const { type, metadata, error, message } = e.data;
      if (type === 'PROGRESS') {
        showNotification(`${layerName}: ${message}`, 'info');
      } else if (type === 'COMPLETE') {
        clearTimeout(timeout);
        worker.terminate();
        resolve(metadata);
      } else if (type === 'ERROR') {
        clearTimeout(timeout);
        worker.terminate();
        reject(new Error(error));
      }
    };
    worker.onerror = (err) => {
      clearTimeout(timeout);
      worker.terminate();
      reject(new Error(err.message || 'Failed to parse GeoTIFF'));
    };
    worker.postMessage({ file, layerId: layerName });
  });

  const processDroppedFile = async (file) => {
    const nameLower = file.name.toLowerCase();

    if (nameLower.endsWith('.tif') || nameLower.endsWith('.tiff')) {
      if (!layerManagerRef?.value) {
        showNotification('Map is not yet initialized. Try again in a moment.', 'error');
        return;
      }
      const layerName = file.name.replace(/\.[^.]+$/, '');
      const sizeMB = file.size / (1024 * 1024);

      if (sizeMB > MAX_FILE_SIZE_MB) {
        showNotification(
          `File is too large (${sizeMB.toFixed(0)} MB). Use the preprocessing pipeline for files over ${MAX_FILE_SIZE_MB} MB.`,
          'error',
        );
        return;
      }

      showNotification(
        sizeMB > LARGE_FILE_THRESHOLD_MB
          ? `Loading large file (${sizeMB.toFixed(0)} MB)…`
          : `Loading ${layerName}…`,
        'info',
      );
      await new Promise((r) => requestAnimationFrame(r));

      try {
        const metadata = await parseGeoTIFFInWorker(file, layerName);

        if (!metadata.hasOverviews && sizeMB > LARGE_FILE_THRESHOLD_MB) {
          showNotification(
            `${layerName}: large file without overviews – rendering may be slow. Consider converting to Cloud Optimized GeoTIFF.`,
            'warning',
          );
          await new Promise((r) => setTimeout(r, 150));
        }

        if (metadata.projection) {
          const registered = await tryRegisterProjection(metadata.projection);
          if (!registered) {
            showNotification(
              `${layerName}: CRS "${metadata.projection}" is not recognised — the file may not display correctly. Consider re-projecting it with GDAL/QGIS first.`,
              'warning',
            );
          }
        }

        const blobUrl = URL.createObjectURL(file);
        await layerManagerRef.value.processLayer(
          {
            type: 'geotiff', url: blobUrl, file, name: layerName, visible: true,
            isUserAdded: true,
            bandCount: metadata.bands,
            dataMin: metadata.dataMin,
            dataMax: metadata.dataMax,
            extent: metadata.extent,
            tiffProjection: metadata.projection,
            noDataValue: metadata.noDataValue,
          },
          'overlay',
        );

        showNotification(`Added layer: ${layerName}`, 'success');

        if (metadata.extent) {
          const olMap = mapStore.getMap();
          if (olMap) {
            const fitOptions = { duration: 800, padding: [50, 50, 50, 50] };
            if (metadata.projection) fitOptions.projection = metadata.projection;
            olMap.getView().fit(metadata.extent, fitOptions);
          }
        }
      } catch (e) {
        showNotification(`Failed to load ${layerName}: ${e.message}`, 'error');
      }

    } else if (nameLower.endsWith('.geojson') || nameLower.endsWith('.json')) {
      if (!layerManagerRef?.value) {
        showNotification('Map is not yet initialized. Try again in a moment.', 'error');
        return;
      }
      const layerName = file.name.replace(/\.[^.]+$/, '');
      showNotification(`Loading ${layerName}…`, 'info');
      await new Promise((r) => requestAnimationFrame(r));
      try {
        const blobUrl = URL.createObjectURL(file);
        await layerManagerRef.value.processLayer(
          { type: 'geojson', url: blobUrl, name: layerName, visible: true, isUserAdded: true },
          'overlay',
        );
        showNotification(`Added layer: ${layerName}`, 'success');
      } catch (e) {
        showNotification(`Failed to load ${layerName}: ${e.message}`, 'error');
      }

    } else if (nameLower.endsWith('.csv')) {
      if (!layerManagerRef?.value) {
        showNotification('Map is not yet initialized. Try again in a moment.', 'error');
        return;
      }
      const layerName = file.name.replace(/\.[^.]+$/, '');
      try {
        const text = await file.text();
        const { headers, rows } = parseCsv(text);
        if (headers.length === 0) {
          showNotification(`${layerName}: could not parse CSV — no headers found.`, 'error');
          return;
        }

        const detected = detectGeomColumns(headers);
        const sampleRows = rows.slice(0, 5);
        let xCol, yCol, crs;

        if (detected.confident) {
          xCol = detected.xCol;
          yCol = detected.yCol;
          crs = 'EPSG:4326';
          showNotification(`${layerName}: auto-detected X="${xCol}", Y="${yCol}"`, 'info');
          await new Promise((r) => requestAnimationFrame(r));
        } else {
          const result = await _openCsvModal(file.name, headers, sampleRows, detected.xCol, detected.yCol);
          if (!result) return;
          xCol = result.xCol;
          yCol = result.yCol;
          crs = result.crs;
        }

        const geojson = csvToGeoJson(rows, xCol, yCol, crs);
        const skipped = rows.length - geojson.features.length;

        if (geojson.features.length === 0) {
          showNotification(
            `${layerName}: no valid coordinates found in columns "${xCol}" / "${yCol}".`,
            'error',
          );
          return;
        }

        showNotification(`Loading ${layerName}…`, 'info');
        await new Promise((r) => requestAnimationFrame(r));

        const blob = new Blob([JSON.stringify(geojson)], { type: 'application/json' });
        const blobUrl = URL.createObjectURL(blob);
        await layerManagerRef.value.processLayer(
          { type: 'geojson', url: blobUrl, name: layerName, visible: true, isUserAdded: true },
          'overlay',
        );

        showNotification(
          skipped > 0
            ? `Added layer: ${layerName} (${skipped} row${skipped !== 1 ? 's' : ''} skipped — invalid coords)`
            : `Added layer: ${layerName}`,
          skipped > 0 ? 'warning' : 'success',
        );
      } catch (e) {
        showNotification(`Failed to load ${layerName}: ${e.message}`, 'error');
      }

    } else {
      const ext = file.name.includes('.')
        ? file.name.split('.').pop().toUpperCase()
        : 'unknown';
      showNotification(`Unsupported file format: .${ext.toLowerCase()}`, 'error');
    }
  };

  return {
    isDragging,
    notification,
    csvModalOpen,
    csvModalFileName,
    csvModalColumns,
    csvModalSampleRows,
    csvModalPreX,
    csvModalPreY,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handleRibbonFiles,
    handleCsvConfirm,
    handleCsvCancel,
    showNotification,
  };
}
