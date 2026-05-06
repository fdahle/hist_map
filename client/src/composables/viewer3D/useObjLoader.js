import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js';
import { storeToRefs } from 'pinia';
import { useViewer3DStore } from '@/stores/viewer3D/viewer3dStore';
import { appConfig } from '@/utils/config.js';

/**
 * @param {Object} ctx
 * @param {Function} ctx.emit
 * @param {import('vue').Ref<boolean>} ctx.loadingCancelled
 * @param {Set} ctx.activeReaders
 * @param {Function} ctx.setActiveStreamReader
 * @param {Function} ctx.clearActiveStreamReader
 * @param {import('vue').Ref<number>} ctx.fileLoadedCount
 * @param {import('vue').Ref<Object|null>} ctx.pendingObjData
 * @param {Function} ctx.adjustCameraToModel
 * @param {Function} ctx.updateNormalsHelpers
 * @param {Function} ctx.removeLayer
 */
export function useObjLoader({
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
}) {
  const viewer3DStore = useViewer3DStore();
  const { scene, camera, controls, showWireframe, showNormals, addModel } = {
    ...storeToRefs(viewer3DStore),
    addModel: viewer3DStore.addModel,
  };

  const parseObjWithProgress = async (text, modelIndex) => {
    const lines = text.split('\n');
    const totalLines = lines.length;
    const chunkSize = 10000;

    const vertices = [];
    const normals = [];
    const uvs = [];
    const faces = [];

    for (let i = 0; i < totalLines; i += chunkSize) {
      if (loadingCancelled.value) throw new Error('cancelled');
      const end = Math.min(i + chunkSize, totalLines);
      const chunk = lines.slice(i, end);

      for (const line of chunk) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;

        const parts = trimmed.split(/\s+/);
        const type = parts[0];

        if (type === 'v') {
          vertices.push(parseFloat(parts[1]), parseFloat(parts[2]), parseFloat(parts[3]));
        } else if (type === 'vn') {
          normals.push(parseFloat(parts[1]), parseFloat(parts[2]), parseFloat(parts[3]));
        } else if (type === 'vt') {
          uvs.push(parseFloat(parts[1]), parseFloat(parts[2]));
        } else if (type === 'f') {
          faces.push(parts.slice(1));
        }
      }

      const progress = Math.round((end / totalLines) * 100);
      emit('parsing-progress', { index: modelIndex, progress, processed: end, total: totalLines });

      await new Promise(resolve => setTimeout(resolve, 0));
    }

    emit('building-geometry', { index: modelIndex, stage: 'geometry', vertices: vertices.length / 3, faces: faces.length });
    await new Promise(resolve => setTimeout(resolve, 0));

    const geometry = new THREE.BufferGeometry();
    const positions = [];
    const finalNormals = [];
    const finalUvs = [];

    emit('building-geometry', { index: modelIndex, stage: 'triangulation', faces: faces.length });
    await new Promise(resolve => setTimeout(resolve, 0));

    for (const faceParts of faces) {
      const indices = faceParts.map(part => {
        const [v, vt, vn] = part.split('/').map(s => parseInt(s) - 1);
        return { v, vt, vn };
      });

      const triangles = indices.length === 3 ? [indices] :
        indices.length === 4 ? [[indices[0], indices[1], indices[2]], [indices[0], indices[2], indices[3]]] : [];

      for (const tri of triangles) {
        for (const { v, vt, vn } of tri) {
          positions.push(vertices[v * 3], vertices[v * 3 + 1], vertices[v * 3 + 2]);
          if (vn >= 0 && normals.length > 0) {
            finalNormals.push(normals[vn * 3], normals[vn * 3 + 1], normals[vn * 3 + 2]);
          }
          if (vt >= 0 && uvs.length > 0) {
            finalUvs.push(uvs[vt * 2], uvs[vt * 2 + 1]);
          }
        }
      }
    }

    emit('building-geometry', { index: modelIndex, stage: 'buffers', triangles: positions.length / 9 });
    await new Promise(resolve => setTimeout(resolve, 0));

    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    if (finalNormals.length > 0) {
      geometry.setAttribute('normal', new THREE.Float32BufferAttribute(finalNormals, 3));
    } else {
      emit('building-geometry', { index: modelIndex, stage: 'normals' });
      await new Promise(resolve => setTimeout(resolve, 0));
      geometry.computeVertexNormals();
    }
    if (finalUvs.length > 0) {
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute(finalUvs, 2));
    }

    emit('building-geometry', { index: modelIndex, stage: 'finalizing' });
    await new Promise(resolve => setTimeout(resolve, 0));

    const mesh = new THREE.Mesh(geometry);
    const group = new THREE.Group();
    group.add(mesh);
    return group;
  };

  const loadObjFromText = async (text, modelIndex = 0) => {
    if (!scene.value || !camera.value || !controls.value) return;

    try {
      const object = await parseObjWithProgress(text, modelIndex);

      const box = new THREE.Box3().setFromObject(object);
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());

      console.log(`Original model size: ${size.x.toFixed(2)} x ${size.y.toFixed(2)} x ${size.z.toFixed(2)}`);
      console.log(`Original center: ${center.x.toFixed(2)}, ${center.y.toFixed(2)}, ${center.z.toFixed(2)}`);

      object.traverse((child) => {
        if (child.isMesh) {
          child.material = new THREE.MeshPhongMaterial({ color: 0x888888, side: THREE.DoubleSide });
        }
      });

      object.rotation.x = -Math.PI / 2;

      scene.value.add(object);
      addModel(object);

      if (showWireframe.value) {
        object.traverse((child) => {
          if (child.isMesh) child.material.wireframe = true;
        });
      }

      adjustCameraToModel();

      if (showNormals.value) updateNormalsHelpers(true);

      console.log(`OBJ ${modelIndex + 1} loaded successfully`);
      return object;
    } catch (error) {
      console.error('Error parsing OBJ:', error);
      emit('loading-error', { error: error.message });
    }
  };

  const loadObjWithMaterialsFromUrl = async (objText, mtlText, baseUrl, modelIndex = 0) => {
    if (!scene.value || !camera.value || !controls.value) return null;
    try {
      const manager = new THREE.LoadingManager();
      manager.setURLModifier((url) => {
        if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('blob:') || url.startsWith('data:')) return url;
        const basename = url.split(/[/\\]/).pop();
        return baseUrl + basename;
      });

      const mtlLoader = new MTLLoader(manager);
      const materials = mtlLoader.parse(mtlText, baseUrl);
      materials.preload();

      const objLoader = new OBJLoader(manager);
      objLoader.setMaterials(materials);
      const object = objLoader.parse(objText);

      object.userData.type = 'model';

      object.traverse((child) => {
        if (child.isMesh) {
          const mats = Array.isArray(child.material) ? child.material : [child.material];
          mats.forEach(m => { m.side = THREE.DoubleSide; });
        }
      });

      object.rotation.x = -Math.PI / 2;

      scene.value.add(object);
      addModel(object);

      if (showWireframe.value) {
        object.traverse((child) => {
          if (child.isMesh) {
            const mats = Array.isArray(child.material) ? child.material : [child.material];
            mats.forEach(m => { m.wireframe = true; });
          }
        });
      }

      adjustCameraToModel();

      if (showNormals.value) updateNormalsHelpers(true);

      console.log(`OBJ ${modelIndex + 1} loaded with server materials`);
      return object;
    } catch (error) {
      console.error('Error loading OBJ with materials from URL, falling back to plain load:', error);
      return loadObjFromText(objText, modelIndex);
    }
  };

  const loadObjWithMaterials = async (objText, mtlFile, imageFiles, modelIndex = 0) => {
    if (!scene.value || !camera.value || !controls.value) return null;

    try {
      const textureUrls = {};
      for (const imgFile of imageFiles) {
        textureUrls[imgFile.name.toLowerCase()] = URL.createObjectURL(imgFile);
      }

      const manager = new THREE.LoadingManager();
      manager.setURLModifier((url) => {
        const basename = url.split(/[/\\]/).pop().toLowerCase();
        return textureUrls[basename] ?? url;
      });

      const mtlText = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = (e) => resolve(e.target.result);
        r.onerror = () => reject(new Error('Failed to read MTL file'));
        r.readAsText(mtlFile);
      });
      const mtlLoader = new MTLLoader(manager);
      const materials = mtlLoader.parse(mtlText, '');
      materials.preload();

      const objLoader = new OBJLoader(manager);
      objLoader.setMaterials(materials);
      const object = objLoader.parse(objText);

      object.traverse((child) => {
        if (child.isMesh) {
          const mats = Array.isArray(child.material) ? child.material : [child.material];
          mats.forEach(m => { m.side = THREE.DoubleSide; });
        }
      });

      const box = new THREE.Box3().setFromObject(object);
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      console.log(`Original model size: ${size.x.toFixed(2)} x ${size.y.toFixed(2)} x ${size.z.toFixed(2)}`);
      console.log(`Original center: ${center.x.toFixed(2)}, ${center.y.toFixed(2)}, ${center.z.toFixed(2)}`);

      object.rotation.x = -Math.PI / 2;

      scene.value.add(object);
      addModel(object);

      if (showWireframe.value) {
        object.traverse((child) => {
          if (child.isMesh) {
            const mats = Array.isArray(child.material) ? child.material : [child.material];
            mats.forEach(m => { m.wireframe = true; });
          }
        });
      }

      adjustCameraToModel();

      if (showNormals.value) updateNormalsHelpers(true);

      console.log(`OBJ ${modelIndex + 1} loaded with materials successfully`);

      for (const url of Object.values(textureUrls)) {
        URL.revokeObjectURL(url);
      }

      return object;
    } catch (error) {
      console.error('Error loading OBJ with materials:', error);
      emit('loading-error', { error: error.message });
      return null;
    }
  };

  const reloadWithMaterials = async (mtlFile, imageFiles) => {
    if (!pendingObjData.value) return;
    const { text, file, modelIndex, objectId } = pendingObjData.value;
    pendingObjData.value = null;
    removeLayer(objectId);
    const object = await loadObjWithMaterials(text, mtlFile, imageFiles, modelIndex);
    if (object && !loadingCancelled.value) {
      object.name = file.name.replace(/\.[^.]+$/, '');
      object.userData.type = 'model';
      if (imageFiles.length === 0) {
        pendingObjData.value = { text, file, modelIndex, objectId: object.uuid };
        emit('suggest-materials', { stem: object.name, objectId: object.uuid });
      }
      emit('model-loaded', { url: file.name, index: modelIndex, object, isFileDrop: true });
    }
  };

  const loadModelFromUrl = async (url, modelIndex = 0) => {
    loadingCancelled.value = false;
    try {
      const fullUrl = url.startsWith('http') ? url : `${appConfig.apiUrl}/${url}`;
      console.log(`Loading model ${modelIndex + 1}:`, fullUrl);

      const response = await fetch(fullUrl);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

      const contentLength = response.headers.get('content-length');
      const total = parseInt(contentLength, 10);
      let loaded = 0;

      const reader = response.body.getReader();
      setActiveStreamReader(reader);
      const chunks = [];

      while (true) {
        if (loadingCancelled.value) {
          reader.cancel();
          clearActiveStreamReader();
          return;
        }
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        loaded += value.length;
        if (total) {
          emit('loading-progress', {
            url, index: modelIndex, loaded, total,
            progress: Math.round((loaded / total) * 100), status: 'downloading',
          });
        }
      }

      const chunksAll = new Uint8Array(loaded);
      let position = 0;
      for (const chunk of chunks) { chunksAll.set(chunk, position); position += chunk.length; }

      emit('loading-progress', { url, index: modelIndex, loaded: total, total, progress: 100, status: 'decoding' });

      clearActiveStreamReader();
      if (loadingCancelled.value) return;

      const text = new TextDecoder('utf-8').decode(chunksAll);

      emit('parsing-started', { url, index: modelIndex, size: total });

      await new Promise(resolve => setTimeout(resolve, 100));

      if (loadingCancelled.value) return;

      let mtlText = null;
      if (/\.obj$/i.test(url)) {
        const mtlUrl = url.replace(/\.obj$/i, '.mtl');
        const fullMtlUrl = mtlUrl.startsWith('http') ? mtlUrl : `${appConfig.apiUrl}/${mtlUrl}`;
        try {
          const mtlRes = await fetch(fullMtlUrl);
          if (mtlRes.ok) mtlText = await mtlRes.text();
        } catch (_) { /* MTL not available */ }
      }

      let object;
      if (mtlText) {
        const fullObjUrl = url.startsWith('http') ? url : `${appConfig.apiUrl}/${url}`;
        const baseUrl = fullObjUrl.substring(0, fullObjUrl.lastIndexOf('/') + 1);
        object = await loadObjWithMaterialsFromUrl(text, mtlText, baseUrl, modelIndex);
      } else {
        object = await loadObjFromText(text, modelIndex);
      }

      if (!loadingCancelled.value && object) {
        emit('model-loaded', { url, index: modelIndex, object });
      }
    } catch (error) {
      if (loadingCancelled.value) return;
      console.error('Error loading model from URL:', error);
      emit('loading-error', { url, error: error.message });
    }
  };

  const loadUserObjFile = async (file, mtlFile = null, imageFiles = []) => {
    loadingCancelled.value = false;
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

    reader.onload = async (e) => {
      activeReaders.delete(reader);
      if (loadingCancelled.value) return;
      emit('parsing-started', { url: file.name, index: currentIndex, size: fileSize });

      const object = mtlFile
        ? await loadObjWithMaterials(e.target.result, mtlFile, imageFiles, currentIndex)
        : await loadObjFromText(e.target.result, currentIndex);

      if (object && !loadingCancelled.value) {
        object.name = file.name.replace(/\.[^.]+$/, '');
        object.userData.type = 'model';
        if (!mtlFile) {
          pendingObjData.value = { text: e.target.result, file, modelIndex: currentIndex, objectId: object.uuid };
          emit('suggest-materials', { stem: object.name, objectId: object.uuid });
        } else {
          pendingObjData.value = null;
        }
        fileLoadedCount.value++;
        emit('model-loaded', { url: file.name, index: currentIndex, object, isFileDrop: true });
      }
    };

    reader.onabort = () => { activeReaders.delete(reader); };
    reader.onerror = () => {
      activeReaders.delete(reader);
      emit('loading-error', { url: file.name, error: 'Failed to read file' });
    };

    reader.readAsText(file);
  };

  return {
    parseObjWithProgress,
    loadObjFromText,
    loadObjWithMaterials,
    loadObjWithMaterialsFromUrl,
    reloadWithMaterials,
    loadModelFromUrl,
    loadUserObjFile,
  };
}
