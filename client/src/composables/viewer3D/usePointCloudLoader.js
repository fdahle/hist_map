import * as THREE from 'three';
import { PLYLoader } from 'three/examples/jsm/loaders/PLYLoader.js';
import PointCloud from '@giro3d/giro3d/entities/PointCloud.js';
import COPCSource from '@giro3d/giro3d/sources/COPCSource.js';
import { setLazPerfPath } from '@giro3d/giro3d/sources/las/config.js';
import ColorMap from '@giro3d/giro3d/core/ColorMap.js';
import ColorMapMode from '@giro3d/giro3d/core/ColorMapMode.js';
import { storeToRefs } from 'pinia';
import { useViewer3DStore } from '@/stores/viewer3D/viewer3dStore';
import { appConfig } from '@/utils/config.js';
import { pointCloudElevationColor } from '@/utils/elevationColor.js';

// Pre-build a 256-step jet colormap as THREE.Color array (shared, not disposed per call)
const JET_COLORS = Array.from({ length: 256 }, (_, i) => {
  const { r, g, b } = pointCloudElevationColor(i / 255);
  return new THREE.Color(r, g, b);
});

const CLASSIFICATION_LUT = [
  [0.50, 0.50, 0.50], // 0  Never classified
  [0.60, 0.60, 0.60], // 1  Unassigned
  [0.54, 0.27, 0.07], // 2  Ground
  [0.56, 0.93, 0.56], // 3  Low Vegetation
  [0.13, 0.55, 0.13], // 4  Medium Vegetation
  [0.00, 0.39, 0.00], // 5  High Vegetation
  [0.50, 0.50, 0.50], // 6  Building
  [1.00, 0.00, 0.00], // 7  Low Point / Noise
  [0.67, 0.67, 0.67], // 8  Reserved
  [0.12, 0.56, 1.00], // 9  Water
  [1.00, 0.84, 0.00], // 10 Rail
  [0.82, 0.71, 0.55], // 11 Road Surface
  [0.67, 0.67, 0.67], // 12 Reserved
  [1.00, 0.55, 0.00], // 13 Wire Guard
  [1.00, 0.55, 0.00], // 14 Wire Conductor
  [0.50, 0.00, 0.50], // 15 Transmission Tower
  [1.00, 0.55, 0.00], // 16 Wire Connector
  [0.82, 0.71, 0.55], // 17 Bridge Deck
  [1.00, 0.00, 0.00], // 18 High Noise
];

/**
 * @param {Object} ctx
 * @param {Function} ctx.emit
 * @param {import('vue').Ref<boolean>} ctx.loadingCancelled
 * @param {Set} ctx.activeReaders
 * @param {Function} ctx.setActiveStreamReader
 * @param {Function} ctx.clearActiveStreamReader
 * @param {import('vue').Ref<Object|null>} ctx.activeWorker
 * @param {import('vue').Ref<Function|null>} ctx.activeWorkerCancel
 * @param {import('vue').Ref<number>} ctx.fileLoadedCount
 * @param {Function} ctx.adjustCameraToModel
 * @param {Function} ctx.findCOPCEntity
 */
export function usePointCloudLoader({
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
}) {
  const viewer3DStore = useViewer3DStore();
  const { scene, giro3dInstance } = storeToRefs(viewer3DStore);

  let lazPerfConfigured = false;

  const makeCOPCProxy = (entity, name) => ({
    uuid: entity.id,
    name,
    userData: {
      type: 'copc',
      giro3dEntity: entity,
      colorMode: 'rgb',
      pointSize: 2,
    },
    traverse: () => {},
    isPoints: false,
    isMesh: false,
    material: null,
    visible: true,
  });

  const loadCOPCFromUrl = async (url, name, index = 0) => {
    if (!giro3dInstance.value) {
      emit('loading-error', { url: name, error: 'Viewer not ready' });
      return;
    }
    if (!lazPerfConfigured) {
      setLazPerfPath('/wasm/');
      lazPerfConfigured = true;
    }

    const fullUrl = url.startsWith('http') ? url : `${appConfig.apiUrl}/${url}`;
    emit('loading-progress', { url: name, index, loaded: 0, total: 0, progress: 0, status: 'reading' });

    const source = new COPCSource({ url: fullUrl });
    const entity = new PointCloud({ id: `copc_${name}_${index}`, source });
    entity.pointSize = 2;

    try {
      await giro3dInstance.value.add(entity);
    } catch (e) {
      emit('loading-error', { url: name, error: e.message || 'Failed to load COPC' });
      return;
    }

    entity.setColoringMode('attribute');
    entity.setActiveAttribute('Color');
    giro3dInstance.value.notifyChange();

    adjustCameraToModel();

    fileLoadedCount.value += 1;
    const proxy = makeCOPCProxy(entity, name);
    emit('model-loaded', { url: name, index, object: proxy, isFileDrop: false });
  };

  const loadCOPCFile = async (file) => {
    const blobUrl = URL.createObjectURL(file);
    try {
      await loadCOPCFromUrl(blobUrl, file.name, fileLoadedCount.value);
    } finally {
      URL.revokeObjectURL(blobUrl);
    }
  };

  const loadLASFile = async (file) => {
    const currentIndex = fileLoadedCount.value;
    const fileSize = file.size;

    emit('loading-progress', {
      url: file.name, index: currentIndex,
      loaded: 0, total: fileSize, progress: 0, status: 'reading',
    });

    let arrayBuffer;
    try {
      arrayBuffer = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        activeReaders.add(reader);
        reader.onprogress = (e) => {
          if (e.lengthComputable) {
            emit('loading-progress', {
              url: file.name, index: currentIndex,
              loaded: e.loaded, total: e.total,
              progress: Math.round((e.loaded / e.total) * 100), status: 'reading',
            });
          }
        };
        reader.onload  = (e) => { activeReaders.delete(reader); resolve(e.target.result); };
        reader.onabort = ()  => { activeReaders.delete(reader); reject(new Error('cancelled')); };
        reader.onerror = ()  => { activeReaders.delete(reader); reject(new Error('Failed to read file')); };
        reader.readAsArrayBuffer(file);
      });
    } catch (e) {
      if (e.message !== 'cancelled') {
        emit('loading-error', { url: file.name, error: e.message || 'Failed to read file' });
      }
      return;
    }

    if (loadingCancelled.value) return;

    emit('loading-progress', {
      url: file.name, index: currentIndex,
      loaded: 0, total: fileSize, progress: 0, status: 'decompressing',
    });

    const worker = new Worker(
      new URL('../../workers/pointcloudWorker.js', import.meta.url),
      { type: 'module' }
    );
    activeWorker.value = worker;

    let cancelResolve;
    const cancelPromise = new Promise((r) => { cancelResolve = r; });
    activeWorkerCancel.value = cancelResolve;

    worker.postMessage({ arrayBuffer, fileName: file.name, maxPoints: 5_000_000 }, [arrayBuffer]);

    await Promise.race([
      new Promise((resolve) => {
        worker.onmessage = ({ data }) => {
          if (data.type === 'progress') {
            emit('loading-progress', {
              url: file.name, index: currentIndex,
              loaded: data.loaded ?? 0, total: data.total ?? fileSize,
              progress: data.progress ?? 0, status: data.status,
            });
          } else if (data.type === 'result') {
            if (!loadingCancelled.value) {
              const positions = new Float32Array(data.posBuffer);
              const rgbCopy   = data.colBuffer.slice(0);
              const colors    = new Float32Array(data.colBuffer);
              const geometry  = new THREE.BufferGeometry();
              geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
              geometry.setAttribute('color',    new THREE.BufferAttribute(colors,    3));

              const material = new THREE.PointsMaterial({ size: 2, vertexColors: true, sizeAttenuation: false });
              const pointCloud = new THREE.Points(geometry, material);
              pointCloud.userData.type                 = 'pointcloud';
              pointCloud.userData.totalPoints          = data.totalPoints;
              pointCloud.userData.sampledPoints        = data.sampledPoints;
              pointCloud.userData.rgbBuffer            = rgbCopy;
              pointCloud.userData.intensityBuffer      = data.intBuffer ?? null;
              pointCloud.userData.classificationBuffer = data.clsBuffer ?? null;

              scene.value.add(pointCloud);
              adjustCameraToModel();

              if (data.step > 1) {
                console.warn(`LAS/LAZ: ${data.totalPoints.toLocaleString()} pts → sampled to ${data.sampledPoints.toLocaleString()} (1 in ${data.step})`);
              } else {
                console.log(`LAS/LAZ point cloud loaded: ${data.totalPoints.toLocaleString()} points`);
              }
              fileLoadedCount.value++;
              emit('model-loaded', { url: file.name, index: currentIndex, object: pointCloud, isFileDrop: true });
            }
            resolve();
          } else if (data.type === 'error') {
            if (!loadingCancelled.value) {
              console.error('LAS/LAZ loading error:', data.message);
              emit('loading-error', { url: file.name, error: data.message });
            }
            resolve();
          }
        };
        worker.onerror = (e) => {
          if (!loadingCancelled.value) emit('loading-error', { url: file.name, error: e.message });
          resolve();
        };
      }),
      cancelPromise,
    ]);

    worker.terminate();
    if (activeWorker.value === worker)       activeWorker.value       = null;
    if (activeWorkerCancel.value === cancelResolve) activeWorkerCancel.value = null;
  };

  const loadPLYFile = (file) => {
    const reader = new FileReader();
    activeReaders.add(reader);
    const currentIndex = fileLoadedCount.value;
    const fileSize = file.size;

    reader.onprogress = (e) => {
      if (e.lengthComputable) {
        emit('loading-progress', {
          url: file.name, index: currentIndex,
          loaded: e.loaded, total: e.total,
          progress: Math.round((e.loaded / e.total) * 100), status: 'reading',
        });
      }
    };

    reader.onabort = () => { activeReaders.delete(reader); };

    reader.onload = (e) => {
      activeReaders.delete(reader);
      if (loadingCancelled.value) return;
      emit('loading-progress', {
        url: file.name, index: currentIndex,
        loaded: fileSize, total: fileSize, progress: 100, status: 'parsing',
      });

      setTimeout(async () => {
        if (loadingCancelled.value) return;
        const loader = new PLYLoader();
        try {
          const rawGeometry = loader.parse(e.target.result);
          const totalCount = rawGeometry.attributes.position.count;

          const MAX_DISPLAY_POINTS = 5_000_000;
          let geometry = rawGeometry;
          let sampledCount = totalCount;
          if (totalCount > MAX_DISPLAY_POINTS) {
            const step = Math.ceil(totalCount / MAX_DISPLAY_POINTS);
            sampledCount = Math.ceil(totalCount / step);
            const srcPos = rawGeometry.attributes.position.array;
            const srcCol = rawGeometry.attributes.color?.array ?? null;
            const dstPos = new Float32Array(sampledCount * 3);
            const dstCol = new Float32Array(sampledCount * 3);
            let j = 0;
            for (let i = 0; i < totalCount; i++) {
              if (i % step !== 0) continue;
              dstPos[j * 3]     = srcPos[i * 3];
              dstPos[j * 3 + 1] = srcPos[i * 3 + 1];
              dstPos[j * 3 + 2] = srcPos[i * 3 + 2];
              if (srcCol) {
                dstCol[j * 3]     = srcCol[i * 3];
                dstCol[j * 3 + 1] = srcCol[i * 3 + 1];
                dstCol[j * 3 + 2] = srcCol[i * 3 + 2];
              } else {
                dstCol[j * 3] = dstCol[j * 3 + 1] = dstCol[j * 3 + 2] = 0.7;
              }
              j++;
            }
            geometry = new THREE.BufferGeometry();
            geometry.setAttribute('position', new THREE.BufferAttribute(dstPos, 3));
            geometry.setAttribute('color',    new THREE.BufferAttribute(dstCol, 3));
            console.warn(`PLY: ${totalCount.toLocaleString()} pts → sampled to ${j.toLocaleString()} (1 in ${step})`);
          }

          const material = new THREE.PointsMaterial({ size: 2, vertexColors: true, sizeAttenuation: false });

          if (!geometry.attributes.color) {
            const colors = new Float32Array(geometry.attributes.position.count * 3).fill(0.7);
            geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
          }

          const pointCloud = new THREE.Points(geometry, material);
          pointCloud.userData.type          = 'pointcloud';
          pointCloud.userData.totalPoints   = totalCount;
          pointCloud.userData.sampledPoints = sampledCount;

          await new Promise(resolve => setTimeout(resolve, 0));
          if (loadingCancelled.value) return;
          scene.value.add(pointCloud);

          adjustCameraToModel();

          console.log(`Point cloud loaded: ${sampledCount.toLocaleString()} points`);
          fileLoadedCount.value++;
          emit('model-loaded', { url: file.name, index: currentIndex, object: pointCloud, isFileDrop: true });
        } catch (error) {
          console.error('PLY loading error:', error);
          emit('loading-error', { url: file.name, error: error.message });
        }
      }, 50);
    };

    reader.onerror = () => {
      activeReaders.delete(reader);
      emit('loading-error', { url: file.name, error: 'Failed to read file' });
    };

    reader.readAsArrayBuffer(file);
  };

  const _loadPointCloudFileInner = async (file) => {
    const lower = file.name.toLowerCase();
    if (lower.endsWith('.ply')) {
      loadPLYFile(file);
    } else if (lower.endsWith('.copc.laz')) {
      loadCOPCFile(file);
    } else if (lower.endsWith('.laz') || lower.endsWith('.las')) {
      loadLASFile(file);
    } else {
      emit('loading-error', {
        url: file.name,
        error: `Unsupported point cloud format: ${lower.split('.').pop()}`,
      });
    }
  };

  const loadPointCloudFile = (file) => {
    loadingCancelled.value = false;
    _loadPointCloudFileInner(file);
  };

  const loadPointCloudFromUrl = async (url, pcIndex = 0) => {
    if (url.toLowerCase().endsWith('.copc.laz')) {
      const name = url.split('/').pop() || 'pointcloud';
      return loadCOPCFromUrl(url, name, pcIndex);
    }

    loadingCancelled.value = false;
    const fileName = url.split('/').pop() || 'pointcloud';

    emit('loading-progress', { url, index: pcIndex, loaded: 0, total: 0, progress: 0, status: 'reading' });

    let arrayBuffer;
    try {
      const fullUrl = url.startsWith('http') ? url : `${appConfig.apiUrl}/${url}`;
      const response = await fetch(fullUrl);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

      const contentLength = response.headers.get('content-length');
      const total = parseInt(contentLength, 10) || 0;
      let loaded = 0;

      const reader = response.body.getReader();
      setActiveStreamReader(reader);
      const chunks = [];

      while (true) {
        if (loadingCancelled.value) { reader.cancel(); clearActiveStreamReader(); return; }
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        loaded += value.length;
        if (total) {
          emit('loading-progress', { url, index: pcIndex, loaded, total, progress: Math.round((loaded / total) * 100), status: 'reading' });
        }
      }
      clearActiveStreamReader();
      if (loadingCancelled.value) return;

      const combined = new Uint8Array(loaded);
      let pos = 0;
      for (const chunk of chunks) { combined.set(chunk, pos); pos += chunk.length; }
      arrayBuffer = combined.buffer;
    } catch (e) {
      if (!loadingCancelled.value) emit('loading-error', { url, error: e.message || 'Failed to fetch file' });
      return;
    }

    if (loadingCancelled.value) return;

    emit('loading-progress', { url, index: pcIndex, loaded: 0, total: arrayBuffer.byteLength, progress: 0, status: 'decompressing' });

    const worker = new Worker(
      new URL('../../workers/pointcloudWorker.js', import.meta.url),
      { type: 'module' }
    );
    activeWorker.value = worker;

    let cancelResolve;
    const cancelPromise = new Promise((r) => { cancelResolve = r; });
    activeWorkerCancel.value = cancelResolve;

    worker.postMessage({ arrayBuffer, fileName, maxPoints: 5_000_000 }, [arrayBuffer]);

    await Promise.race([
      new Promise((resolve) => {
        worker.onmessage = ({ data }) => {
          if (data.type === 'progress') {
            emit('loading-progress', {
              url, index: pcIndex,
              loaded: data.loaded ?? 0, total: data.total ?? 0,
              progress: data.progress ?? 0, status: data.status,
            });
          } else if (data.type === 'result') {
            if (!loadingCancelled.value) {
              const positions = new Float32Array(data.posBuffer);
              const rgbCopy   = data.colBuffer.slice(0);
              const colors    = new Float32Array(data.colBuffer);
              const geometry  = new THREE.BufferGeometry();
              geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
              geometry.setAttribute('color',    new THREE.BufferAttribute(colors,    3));

              const material = new THREE.PointsMaterial({ size: 2, vertexColors: true, sizeAttenuation: false });
              const pointCloud = new THREE.Points(geometry, material);
              pointCloud.userData.type                 = 'pointcloud';
              pointCloud.userData.totalPoints          = data.totalPoints;
              pointCloud.userData.sampledPoints        = data.sampledPoints;
              pointCloud.userData.rgbBuffer            = rgbCopy;
              pointCloud.userData.intensityBuffer      = data.intBuffer ?? null;
              pointCloud.userData.classificationBuffer = data.clsBuffer ?? null;

              scene.value.add(pointCloud);
              adjustCameraToModel();

              emit('model-loaded', { url, index: pcIndex, object: pointCloud, isFileDrop: false });
            }
            resolve();
          } else if (data.type === 'error') {
            if (!loadingCancelled.value) emit('loading-error', { url, error: data.message });
            resolve();
          }
        };
        worker.onerror = (e) => {
          if (!loadingCancelled.value) emit('loading-error', { url, error: e.message });
          resolve();
        };
      }),
      cancelPromise,
    ]);

    worker.terminate();
    if (activeWorker.value === worker)       activeWorker.value       = null;
    if (activeWorkerCancel.value === cancelResolve) activeWorkerCancel.value = null;
  };

  const applyColorMode = (layerId, mode) => {
    const copcEntity = findCOPCEntity(layerId);
    if (copcEntity) {
      if (mode === 'elevation') {
        // Use Giro3D's ColorMap API with a jet LUT mapped to the entity's Z bounds.
        const bbox = copcEntity.getBoundingBox();
        const minZ = bbox ? bbox.min.z : 0;
        const maxZ = bbox ? bbox.max.z : 1;
        const colorMap = new ColorMap({
          colors: JET_COLORS,
          min: minZ,
          max: maxZ,
          mode: ColorMapMode.Elevation,
        });
        copcEntity.setAttributeColorMap('Z', colorMap);
        copcEntity.setColoringMode('attribute');
        copcEntity.setActiveAttribute('Z');
      } else {
        // Clear any previous elevation colormap so it doesn't interfere
        copcEntity.setAttributeColorMap('Z', null);
        const attrMap = { rgb: 'Color', intensity: 'Intensity', classification: 'Classification' };
        copcEntity.setColoringMode('attribute');
        copcEntity.setActiveAttribute(attrMap[mode] ?? 'Color');
      }
      copcEntity.userData = copcEntity.userData || {};
      copcEntity.userData.colorMode = mode;
      giro3dInstance.value?.notifyChange();
      return;
    }

    if (!scene.value) return;

    let target = null;
    scene.value.traverse((obj) => { if (obj.uuid === layerId) target = obj; });
    if (!target) return;

    target.traverse((obj) => {
      if (!obj.isPoints) return;
      const geo = obj.geometry;
      const colorAttr = geo.attributes.color;
      if (!colorAttr) return;

      const colors = colorAttr.array;
      const n = colorAttr.count;
      const { rgbBuffer, intensityBuffer, classificationBuffer } = obj.userData;

      if (mode === 'rgb') {
        if (rgbBuffer) {
          const src = new Float32Array(rgbBuffer);
          for (let i = 0; i < n * 3; i++) colors[i] = src[i];
        }
      } else if (mode === 'elevation') {
        // Use Z coordinate (index +2) in this Z-up scene for true elevation coloring.
        // Apply jet colormap (blue=low → red=high) for clear visual contrast.
        const posArr = geo.attributes.position.array;
        let minZ = Infinity, maxZ = -Infinity;
        for (let i = 0; i < n; i++) {
          const z = posArr[i * 3 + 2];
          if (z < minZ) minZ = z;
          if (z > maxZ) maxZ = z;
        }
        const range = maxZ - minZ || 1;
        for (let i = 0; i < n; i++) {
          const t = Math.max(0, Math.min(1, (posArr[i * 3 + 2] - minZ) / range));
          const { r, g, b } = pointCloudElevationColor(t);
          colors[i * 3] = r; colors[i * 3 + 1] = g; colors[i * 3 + 2] = b;
        }
      } else if (mode === 'intensity') {
        if (intensityBuffer) {
          const src = new Float32Array(intensityBuffer);
          for (let i = 0; i < n; i++) {
            const v = src[i];
            colors[i * 3] = v; colors[i * 3 + 1] = v; colors[i * 3 + 2] = v;
          }
        }
      } else if (mode === 'classification') {
        if (classificationBuffer) {
          const src = new Uint8Array(classificationBuffer);
          for (let i = 0; i < n; i++) {
            const lut = CLASSIFICATION_LUT[Math.min(18, src[i])] ?? CLASSIFICATION_LUT[0];
            colors[i * 3] = lut[0]; colors[i * 3 + 1] = lut[1]; colors[i * 3 + 2] = lut[2];
          }
        }
      }

      colorAttr.needsUpdate = true;
    });
  };

  const setCOPCPointSize = (layerId, size) => {
    const entity = findCOPCEntity(layerId);
    if (!entity) return;
    entity.pointSize = size;
    giro3dInstance.value?.notifyChange();
  };

  return {
    loadCOPCFromUrl,
    loadCOPCFile,
    loadLASFile,
    loadPLYFile,
    loadPointCloudFile,
    loadPointCloudFromUrl,
    applyColorMode,
    setCOPCPointSize,
  };
}
