import * as THREE from 'three';
import { fromBlob } from 'geotiff';
import { storeToRefs } from 'pinia';
import { useViewer3DStore } from '@/stores/viewer3D/viewer3dStore';
import { demElevationColor } from '@/utils/elevationColor.js';

/**
 * @param {Object} ctx
 * @param {Function} ctx.emit
 * @param {import('vue').Ref<boolean>} ctx.loadingCancelled
 * @param {import('vue').Ref<number>} ctx.fileLoadedCount
 * @param {Function} ctx.adjustCameraToModel
 */
export function useDEMLoader({ emit, loadingCancelled, fileLoadedCount, adjustCameraToModel }) {
  const viewer3DStore = useViewer3DStore();
  const { scene } = storeToRefs(viewer3DStore);
  const { addModel } = viewer3DStore;

  const loadDEMFile = async (file) => {
    loadingCancelled.value = false;
    const currentIndex = fileLoadedCount.value;
    const fileSize = file.size;

    emit('loading-progress', {
      url: file.name, index: currentIndex,
      loaded: 0, total: fileSize, progress: 0, status: 'reading',
    });

    try {
      const tiff = await fromBlob(file);
      const image = await tiff.getImage();

      const width = image.getWidth();
      const height = image.getHeight();
      const samplesPerPixel = image.getSamplesPerPixel();

      if (samplesPerPixel !== 1) {
        emit('loading-error', {
          url: file.name,
          error: `Expected a single-band DEM — this file has ${samplesPerPixel} bands.`,
        });
        return;
      }

      const bbox = image.getBoundingBox();
      const geoKeys = image.getGeoKeys();
      const isGeographic = geoKeys?.GTModelTypeGeoKey === 2;
      let planeWidth, planeHeight;
      if (bbox && bbox.length === 4 && isFinite(bbox[0]) && isFinite(bbox[3])) {
        if (isGeographic) {
          const midLat = (bbox[1] + bbox[3]) / 2;
          planeWidth  = Math.abs(bbox[2] - bbox[0]) * 111320 * Math.cos(midLat * Math.PI / 180);
          planeHeight = Math.abs(bbox[3] - bbox[1]) * 110540;
        } else {
          planeWidth  = Math.abs(bbox[2] - bbox[0]);
          planeHeight = Math.abs(bbox[3] - bbox[1]);
        }
      } else {
        planeWidth  = width;
        planeHeight = height;
      }

      if (loadingCancelled.value) return;

      emit('loading-progress', {
        url: file.name, index: currentIndex,
        loaded: fileSize, total: fileSize, progress: 40, status: 'parsing',
      });

      const MAX_GRID = 512;
      const scaleFactor = Math.min(1, MAX_GRID / Math.max(width, height));
      const gridW = Math.max(2, Math.round(width * scaleFactor));
      const gridH = Math.max(2, Math.round(height * scaleFactor));

      const [elevations] = await image.readRasters({ width: gridW, height: gridH, resampleMethod: 'nearest' });

      if (loadingCancelled.value) return;

      emit('loading-progress', {
        url: file.name, index: currentIndex,
        loaded: fileSize, total: fileSize, progress: 70, status: 'parsing',
      });

      const nodataRaw = image.getGDALNoData();
      const nodata = nodataRaw !== null && nodataRaw !== undefined ? parseFloat(nodataRaw) : null;
      const isNodata = (v) =>
        nodata !== null && Math.abs(v - nodata) <= Math.max(0.5, Math.abs(nodata) * 1e-6);

      let minElev = Infinity, maxElev = -Infinity;
      for (let i = 0; i < elevations.length; i++) {
        const v = elevations[i];
        if (!isFinite(v) || isNodata(v)) continue;
        if (v < minElev) minElev = v;
        if (v > maxElev) maxElev = v;
      }

      if (!isFinite(minElev)) {
        emit('loading-error', { url: file.name, error: 'DEM contains no valid elevation values.' });
        return;
      }

      emit('loading-progress', {
        url: file.name, index: currentIndex,
        loaded: fileSize, total: fileSize, progress: 85, status: 'building',
      });

      const elevRange = maxElev - minElev || 1;

      const geometry = new THREE.PlaneGeometry(planeWidth, planeHeight, gridW - 1, gridH - 1);
      const positions = geometry.attributes.position;

      for (let row = 0; row < gridH; row++) {
        for (let col = 0; col < gridW; col++) {
          const vIdx = row * gridW + col;
          const elev = elevations[vIdx];
          positions.setZ(vIdx, isFinite(elev) && !isNodata(elev) ? elev : minElev);
        }
      }
      positions.needsUpdate = true;

      const colorsArr = new Float32Array(positions.count * 3);
      for (let i = 0; i < positions.count; i++) {
        const t = Math.max(0, Math.min(1, (positions.getZ(i) - minElev) / elevRange));
        const { r, g, b } = demElevationColor(t);
        colorsArr[i * 3]     = r;
        colorsArr[i * 3 + 1] = g;
        colorsArr[i * 3 + 2] = b;
      }
      geometry.setAttribute('color', new THREE.Float32BufferAttribute(colorsArr, 3));
      geometry.computeVertexNormals();

      const material = new THREE.MeshPhongMaterial({
        vertexColors: true, side: THREE.DoubleSide, shininess: 20,
      });

      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = file.name.replace(/\.[^.]+$/, '');
      mesh.userData.type = 'dem';
      mesh.userData.minElev = minElev;
      mesh.userData.maxElev = maxElev;
      mesh.userData.nodata = nodata;
      mesh.userData.verticalExaggeration = 1;
      mesh.userData.bbox = bbox ?? null;
      mesh.userData.planeWidth = planeWidth;
      mesh.userData.planeHeight = planeHeight;
      mesh.userData.rawElevations = elevations;
      mesh.userData.gridW = gridW;
      mesh.userData.gridH = gridH;

      if (loadingCancelled.value) return;

      scene.value.add(mesh);
      addModel(mesh);
      adjustCameraToModel();
      fileLoadedCount.value++;
      emit('model-loaded', { url: file.name, index: currentIndex, object: mesh, isFileDrop: true });

      console.log(
        `DEM loaded: ${gridW}×${gridH} grid (source ${width}×${height}), ` +
        `real-world size ${planeWidth.toFixed(1)}×${planeHeight.toFixed(1)} m, ` +
        `elevation ${minElev.toFixed(1)}–${maxElev.toFixed(1)} m` +
        (bbox ? `, bbox [${bbox.map(v => v.toFixed(2)).join(', ')}]` : ' (no georef)')
      );
    } catch (error) {
      if (error.message !== 'cancelled') {
        console.error('DEM loading error:', error);
        emit('loading-error', { url: file.name, error: error.message });
      }
    }
  };

  const applyVerticalExaggeration = (layerId, factor) => {
    if (!scene.value) return;
    let mesh = null;
    scene.value.traverse((obj) => {
      if (obj.isMesh && obj.userData.type === 'dem' && obj.uuid === layerId) mesh = obj;
    });
    if (!mesh) return;

    const { rawElevations, gridW, gridH, minElev, maxElev, nodata } = mesh.userData;
    if (!rawElevations) return;

    mesh.userData.verticalExaggeration = factor;

    const isNodata = (nodata !== null && nodata !== undefined)
      ? (v) => Math.abs(v - nodata) <= Math.max(0.5, Math.abs(nodata) * 1e-6)
      : () => false;

    const positions = mesh.geometry.attributes.position;
    const elevRange = maxElev - minElev || 1;

    for (let row = 0; row < gridH; row++) {
      for (let col = 0; col < gridW; col++) {
        const vIdx = row * gridW + col;
        const raw = rawElevations[vIdx];
        const elev = (isFinite(raw) && !isNodata(raw)) ? raw : minElev;
        positions.setZ(vIdx, minElev + (elev - minElev) * factor);
      }
    }
    positions.needsUpdate = true;

    const colorsArr = mesh.geometry.attributes.color?.array;
    if (colorsArr) {
      for (let i = 0; i < positions.count; i++) {
        const raw = rawElevations[i];
        const elev = (isFinite(raw) && !isNodata(raw)) ? raw : minElev;
        const t = Math.max(0, Math.min(1, (elev - minElev) / elevRange));
        const { r, g, b } = demElevationColor(t);
        colorsArr[i * 3]     = r;
        colorsArr[i * 3 + 1] = g;
        colorsArr[i * 3 + 2] = b;
      }
      mesh.geometry.attributes.color.needsUpdate = true;
    }
    mesh.geometry.computeVertexNormals();
  };

  return { loadDEMFile, applyVerticalExaggeration };
}
