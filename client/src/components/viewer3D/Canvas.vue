<template>
  <div
    ref="viewerRef"
    class="viewer-canvas"
  >
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js';
import { PLYLoader } from 'three/examples/jsm/loaders/PLYLoader.js';
import { VertexNormalsHelper } from 'three/examples/jsm/helpers/VertexNormalsHelper.js';
import { useViewer3DStore } from '@/stores/viewer3D/viewer3dStore';
import { useSettingsStore } from '@/stores/settingsStore.js';
import { storeToRefs } from 'pinia';
import { appConfig } from '@/utils/config.js';

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

const emit = defineEmits(['scene-ready', 'model-loaded', 'loading-error', 'loading-progress', 'parsing-started', 'parsing-progress', 'building-geometry', 'unsupported-file', 'suggest-materials']);

const viewerRef = ref(null);
const fileLoadedCount = ref(0); // Track number of models loaded from files
const pendingObjData = ref(null); // Stores last OBJ-only load so materials can be applied later

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
    // Material / texture files without an OBJ — give helpful feedback
    if (mtlFiles.length > 0 || imageFiles.length > 0) {
      emit('unsupported-file', {
        ext: mtlFiles[0]?.name.split('.').pop() ?? imageFiles[0]?.name.split('.').pop(),
        message: 'Drop an .obj file together with the .mtl / texture files to load a model.',
      });
    }
    return;
  }

  for (const file of objFiles) {
    // Match MTL by stem name, fall back to first available
    const stem = file.name.replace(/\.obj$/i, '').toLowerCase();
    const matchedMtl = mtlFiles.find(m => m.name.replace(/\.mtl$/i, '').toLowerCase() === stem) ?? mtlFiles[0] ?? null;
    loadUserObjFile(file, matchedMtl, imageFiles);
  }
};

const settingsStore = useSettingsStore();
const { theme } = storeToRefs(settingsStore);

const viewer3DStore = useViewer3DStore();
const {
  scene,
  camera,
  renderer,
  controls,
  measurementMode,
  measurementPoints,
  showWireframe,
  showBoundingBox,
  showNormals,
  loadedModels,
  pickMode,
} = storeToRefs(viewer3DStore);
const {
  setScene,
  setCamera,
  setRenderer,
  setControls,
  addModel,
  storeInitialCamera,
  resetCamera,
  addMeasurementPoint,
  setPickedCoord,
  cleanup,
} = viewer3DStore;

let animationFrameId = null;
let bookmarkTween = null;
const raycaster = new THREE.Raycaster();

// Cancellation support
const loadingCancelled = ref(false);
const activeReaders = new Set();
let activeStreamReader = null;
const activeWorker = ref(null);        // current point-cloud Web Worker
const activeWorkerCancel = ref(null);  // resolves the race-promise to unblock loadLASFile

const cancelLoading = () => {
  loadingCancelled.value = true;
  for (const reader of activeReaders) {
    try { reader.abort(); } catch (_) {}
  }
  activeReaders.clear();
  if (activeStreamReader) {
    try { activeStreamReader.cancel(); } catch (_) {}
    activeStreamReader = null;
  }
  // Terminate the off-thread worker immediately — instant response regardless
  // of how deep into WASM decompression it is.
  if (activeWorker.value) {
    activeWorker.value.terminate();
    activeWorker.value = null;
  }
  activeWorkerCancel.value?.();
  activeWorkerCancel.value = null;
};
const mouse = new THREE.Vector2();
const measurementMarkers = [];

const initViewer = () => {
  if (!viewerRef.value) return;

  // Scene
  const newScene = new THREE.Scene();
  // Set background color based on theme
  newScene.background = new THREE.Color(theme.value === 'dark' ? 0x1a1a1a : 0x87ceeb);
  setScene(newScene);

  // Camera
  const newCamera = new THREE.PerspectiveCamera(
    75,
    viewerRef.value.clientWidth / viewerRef.value.clientHeight,
    0.1,
    1000000
  );
  newCamera.position.set(100, 100, 100);
  newCamera.lookAt(0, 0, 0);
  setCamera(newCamera);

  // Renderer
  const newRenderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  newRenderer.setSize(viewerRef.value.clientWidth, viewerRef.value.clientHeight);
  newRenderer.setPixelRatio(window.devicePixelRatio);
  viewerRef.value.appendChild(newRenderer.domElement);
  setRenderer(newRenderer);

  // Controls
  const newControls = new OrbitControls(newCamera, newRenderer.domElement);
  newControls.enableDamping = true;
  newControls.dampingFactor = 0.05;
  setControls(newControls);

  // Lighting
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
  newScene.add(ambientLight);

  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
  directionalLight.position.set(100, 100, 50);
  newScene.add(directionalLight);

  // Grid and axes
  const gridHelper = new THREE.GridHelper(200, 20, 0x888888, 0x444444);
  gridHelper.name = 'gridHelper';
  newScene.add(gridHelper);

  const axesHelper = new THREE.AxesHelper(50);
  axesHelper.name = 'axesHelper';
  newScene.add(axesHelper);

  // Animation loop
  const animate = () => {
    animationFrameId = requestAnimationFrame(animate);

    // Bookmark camera tween (cubic ease-out lerp)
    if (bookmarkTween) {
      bookmarkTween.t += 1;
      const alpha = Math.min(1, bookmarkTween.t / bookmarkTween.duration);
      const ease = 1 - Math.pow(1 - alpha, 3);
      newCamera.position.lerpVectors(bookmarkTween.startPos, bookmarkTween.endPos, ease);
      newControls.target.lerpVectors(bookmarkTween.startTarget, bookmarkTween.endTarget, ease);
      if (alpha >= 1) bookmarkTween = null;
    }

    newControls.update();
    newRenderer.render(newScene, newCamera);
  };
  animate();

  // Handle resize
  window.addEventListener('resize', handleResize);

  // Handle mouse clicks for measurements
  newRenderer.domElement.addEventListener('click', onCanvasClick);
  
  // Track mouse down position to detect drags vs clicks
  newRenderer.domElement.addEventListener('mousedown', (e) => {
    mouseDownPosition.x = e.clientX;
    mouseDownPosition.y = e.clientY;
  });

  emit('scene-ready');
};

const handleResize = () => {
  if (!viewerRef.value || !camera.value || !renderer.value) return;
  
  camera.value.aspect = viewerRef.value.clientWidth / viewerRef.value.clientHeight;
  camera.value.updateProjectionMatrix();
  renderer.value.setSize(viewerRef.value.clientWidth, viewerRef.value.clientHeight);
};

const loadModelFromUrl = async (url, modelIndex = 0) => {
  loadingCancelled.value = false;
  try {
    const fullUrl = url.startsWith('http') ? url : `${appConfig.apiUrl}/${url}`;
    console.log(`Loading model ${modelIndex + 1}/${props.modelUrls.length}:`, fullUrl);
    
    // Fetch with progress tracking
    const response = await fetch(fullUrl);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const contentLength = response.headers.get('content-length');
    const total = parseInt(contentLength, 10);
    let loaded = 0;
    
    const reader = response.body.getReader();
    activeStreamReader = reader;
    const chunks = [];
    
    while (true) {
      if (loadingCancelled.value) {
        reader.cancel();
        activeStreamReader = null;
        return;
      }
      const { done, value } = await reader.read();
      
      if (done) break;
      
      chunks.push(value);
      loaded += value.length;
      
      if (total) {
        const progress = (loaded / total) * 100;
        emit('loading-progress', { 
          url, 
          index: modelIndex, 
          loaded, 
          total, 
          progress: Math.round(progress),
          status: 'downloading'
        });
      }
    }
    
    // Combine chunks and decode
    const chunksAll = new Uint8Array(loaded);
    let position = 0;
    for (const chunk of chunks) {
      chunksAll.set(chunk, position);
      position += chunk.length;
    }
    
    emit('loading-progress', { 
      url, 
      index: modelIndex, 
      loaded: total, 
      total, 
      progress: 100,
      status: 'decoding'
    });
    
    activeStreamReader = null;
    if (loadingCancelled.value) return;

    const text = new TextDecoder('utf-8').decode(chunksAll);
    
    // Emit parsing started
    emit('parsing-started', { url, index: modelIndex, size: total });
    
    // Use setTimeout to allow UI to update before heavy parsing
    await new Promise(resolve => setTimeout(resolve, 100));
    
    if (loadingCancelled.value) return;

    // Try to fetch a co-located MTL file (same URL with .obj → .mtl)
    let mtlText = null;
    if (/\.obj$/i.test(url)) {
      const mtlUrl = url.replace(/\.obj$/i, '.mtl');
      const fullMtlUrl = mtlUrl.startsWith('http') ? mtlUrl : `${appConfig.apiUrl}/${mtlUrl}`;
      try {
        const mtlRes = await fetch(fullMtlUrl);
        if (mtlRes.ok) mtlText = await mtlRes.text();
      } catch (_) { /* MTL not available */ }
    }

    // Parse OBJ, with materials if a co-located MTL was found
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

const loadObjFromText = async (text, modelIndex = 0) => {
  if (!scene.value || !camera.value || !controls.value) return;

  try {
    // Parse OBJ with progress updates
    const object = await parseObjWithProgress(text, modelIndex);

    // Get bounding box
    const box = new THREE.Box3().setFromObject(object);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    
    console.log(`Original model size: ${size.x.toFixed(2)} x ${size.y.toFixed(2)} x ${size.z.toFixed(2)}`);
    console.log(`Original center: ${center.x.toFixed(2)}, ${center.y.toFixed(2)}, ${center.z.toFixed(2)}`);

    // Add materials
    object.traverse((child) => {
      if (child.isMesh) {
        child.material = new THREE.MeshPhongMaterial({
          color: 0x888888,
          side: THREE.DoubleSide
        });
      }
    });

    scene.value.add(object);
    addModel(object);

    // Apply current display settings to the newly loaded model
    if (showWireframe.value) {
      object.traverse((child) => {
        if (child.isMesh) child.material.wireframe = true;
      });
    }
    
    // Update scene helpers and camera to encompass all loaded content
    adjustCameraToModel();

    // If normals are currently shown, add helpers for the new model's meshes
    if (showNormals.value) {
      updateNormalsHelpers(true);
    }
    
    console.log(`OBJ ${modelIndex + 1} loaded successfully`);
    return object;
  } catch (error) {
    console.error('Error parsing OBJ:', error);
    emit('loading-error', { error: error.message });
  }
};

// Loads an OBJ (as text) with materials sourced from a server-hosted MTL file.
// Textures are resolved as basUrl + basename so they load directly from the server.
const loadObjWithMaterialsFromUrl = async (objText, mtlText, baseUrl, modelIndex = 0) => {
  if (!scene.value || !camera.value || !controls.value) return null;
  try {
    const manager = new THREE.LoadingManager();
    manager.setURLModifier((url) => {
      if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('blob:') || url.startsWith('data:')) return url;
      const basename = url.split(/[\/\\]/).pop();
      return baseUrl + basename;
    });

    const mtlLoader = new MTLLoader(manager);
    const materials = mtlLoader.parse(mtlText, baseUrl);
    materials.preload();

    const objLoader = new OBJLoader(manager);
    objLoader.setMaterials(materials);
    const object = objLoader.parse(objText);

    object.rotation.x = -Math.PI / 2;
    object.userData.type = 'model';

    object.traverse((child) => {
      if (child.isMesh) {
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        mats.forEach(m => { m.side = THREE.DoubleSide; });
      }
    });

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

    if (showNormals.value) {
      updateNormalsHelpers(true);
    }

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
    // Create blob URLs for texture images, keyed by lowercase filename
    const textureUrls = {};
    for (const imgFile of imageFiles) {
      textureUrls[imgFile.name.toLowerCase()] = URL.createObjectURL(imgFile);
    }

    // LoadingManager that resolves texture filenames to blob URLs
    const manager = new THREE.LoadingManager();
    manager.setURLModifier((url) => {
      const basename = url.split(/[\/\\]/).pop().toLowerCase();
      return textureUrls[basename] ?? url;
    });

    // Read and parse the MTL file
    const mtlText = await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = (e) => resolve(e.target.result);
      r.onerror = () => reject(new Error('Failed to read MTL file'));
      r.readAsText(mtlFile);
    });
    const mtlLoader = new MTLLoader(manager);
    const materials = mtlLoader.parse(mtlText, '');
    materials.preload();

    // Parse OBJ with the loaded materials
    const objLoader = new OBJLoader(manager);
    objLoader.setMaterials(materials);
    const object = objLoader.parse(objText);

    // Apply Z-up to Y-up rotation
    object.rotation.x = -Math.PI / 2;

    // Ensure double-sided rendering for all materials
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

    if (showNormals.value) {
      updateNormalsHelpers(true);
    }

    console.log(`OBJ ${modelIndex + 1} loaded with materials successfully`);

    // Free blob URLs
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
  // Remove the unshaded/previous object from the scene
  removeLayer(objectId);
  // Re-load with materials
  const object = await loadObjWithMaterials(text, mtlFile, imageFiles, modelIndex);
  if (object && !loadingCancelled.value) {
    object.name = file.name.replace(/\.[^.]+$/, '');
    object.userData.type = 'model';
    // MTL loaded but no textures — keep pending so the user can add images in a second pass
    if (imageFiles.length === 0) {
      pendingObjData.value = { text, file, modelIndex, objectId: object.uuid };
      emit('suggest-materials', { stem: object.name, objectId: object.uuid });
    }
    emit('model-loaded', { url: file.name, index: modelIndex, object, isFileDrop: true });
  }
};

const parseObjWithProgress = async (text, modelIndex) => {
  const lines = text.split('\n');
  const totalLines = lines.length;
  const chunkSize = 10000; // Process 10k lines at a time
  
  const vertices = [];
  const normals = [];
  const uvs = [];
  const faces = [];
  
  // Process lines in chunks
  for (let i = 0; i < totalLines; i += chunkSize) {
    if (loadingCancelled.value) throw new Error('cancelled');
    const end = Math.min(i + chunkSize, totalLines);
    const chunk = lines.slice(i, end);
    
    // Process this chunk
    for (const line of chunk) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      
      const parts = trimmed.split(/\s+/);
      const type = parts[0];
      
      if (type === 'v') {
        // Vertex
        vertices.push(
          parseFloat(parts[1]),
          parseFloat(parts[2]),
          parseFloat(parts[3])
        );
      } else if (type === 'vn') {
        // Normal
        normals.push(
          parseFloat(parts[1]),
          parseFloat(parts[2]),
          parseFloat(parts[3])
        );
      } else if (type === 'vt') {
        // UV
        uvs.push(
          parseFloat(parts[1]),
          parseFloat(parts[2])
        );
      } else if (type === 'f') {
        // Face (simplified - only handles v or v/vt/vn format)
        faces.push(parts.slice(1));
      }
    }
    
    // Report progress
    const progress = Math.round((end / totalLines) * 100);
    emit('parsing-progress', { index: modelIndex, progress, processed: end, total: totalLines });
    
    // Yield to UI
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  
  // Build Three.js geometry
  emit('building-geometry', { index: modelIndex, stage: 'geometry', vertices: vertices.length / 3, faces: faces.length });
  await new Promise(resolve => setTimeout(resolve, 0));
  
  const geometry = new THREE.BufferGeometry();
  const positions = [];
  const finalNormals = [];
  const finalUvs = [];
  
  emit('building-geometry', { index: modelIndex, stage: 'triangulation', faces: faces.length });
  await new Promise(resolve => setTimeout(resolve, 0));
  
  for (const faceParts of faces) {
    // Convert face to triangles (assuming triangles or quads)
    const indices = faceParts.map(part => {
      const [v, vt, vn] = part.split('/').map(s => parseInt(s) - 1);
      return { v, vt, vn };
    });
    
    // Triangulate if needed
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
  
  // Apply Z-up to Y-up rotation
  mesh.rotation.x = -Math.PI / 2;
  
  const group = new THREE.Group();
  group.add(mesh);
  
  return group;
};

const adjustCameraToModel = () => {
  if (!scene.value || !camera.value || !controls.value) return;

  // Compute scene-wide bounding box, skipping helper objects and measurement markers
  const exclusionNames = new Set([
    'gridHelper', 'axesHelper', 'boxHelper',
    'measurementMarker', 'currentMeasurementMarker', 'savedMeasurementMarker',
  ]);
  const modelBBox = new THREE.Box3();
  scene.value.traverse((child) => {
    if (!child.isMesh && !child.isPoints) return;
    if (exclusionNames.has(child.name)) return;
    if (child.name?.startsWith('normalsHelper_')) return;
    modelBBox.expandByObject(child);
  });

  if (modelBBox.isEmpty()) return;

  const modelSize = modelBBox.getSize(new THREE.Vector3());
  const modelCenter = modelBBox.getCenter(new THREE.Vector3());
  const maxModelDim = Math.max(modelSize.x, modelSize.y, modelSize.z);

  // Reposition and scale grid - place at bottom of scene content
  const grid = scene.value.getObjectByName('gridHelper');
  if (grid) {
    const gridSize = maxModelDim * 2;
    grid.scale.setScalar(gridSize / 200);
    grid.position.set(modelCenter.x, modelBBox.min.y, modelCenter.z);
    grid.rotation.set(0, 0, 0);
  }

  // Reposition and scale axes - place at bottom center of scene content
  const axes = scene.value.getObjectByName('axesHelper');
  if (axes) {
    axes.scale.setScalar(maxModelDim / 50);
    axes.position.set(modelCenter.x, modelBBox.min.y, modelCenter.z);
  }

  // Replace bounding box helper with one covering the full scene extent
  const existingBox = scene.value.getObjectByName('boxHelper');
  if (existingBox) {
    scene.value.remove(existingBox);
    if (existingBox.geometry) existingBox.geometry.dispose();
    if (existingBox.material) existingBox.material.dispose();
  }
  const boxHelper = new THREE.Box3Helper(modelBBox, 0x00ff00);
  boxHelper.name = 'boxHelper';
  boxHelper.visible = showBoundingBox.value;
  scene.value.add(boxHelper);

  // Position camera to see all content
  const distance = maxModelDim * 2;
  camera.value.position.set(
    modelCenter.x + distance,
    modelCenter.y + distance,
    modelCenter.z + distance
  );
  camera.value.lookAt(modelCenter);
  controls.value.target.copy(modelCenter);
  controls.value.update();

  storeInitialCamera();

  console.log(`Scene helpers updated — extent: ${modelSize.x.toFixed(2)} x ${modelSize.y.toFixed(2)} x ${modelSize.z.toFixed(2)}`);
};

const loadUserObjFile = async (file, mtlFile = null, imageFiles = []) => {
  loadingCancelled.value = false;
  const reader = new FileReader();
  activeReaders.add(reader);
  const currentIndex = fileLoadedCount.value;
  const fileSize = file.size;
  
  // Track progress
  reader.onprogress = (e) => {
    if (e.lengthComputable) {
      const progress = Math.round((e.loaded / e.total) * 100);
      const loadedMB = (e.loaded / (1024 * 1024)).toFixed(1);
      const totalMB = (e.total / (1024 * 1024)).toFixed(1);
      emit('loading-progress', {
        url: file.name,
        index: currentIndex,
        loaded: e.loaded,
        total: e.total,
        progress,
        status: 'reading'
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

// Point cloud loading
const loadPointCloudFile = (file) => {
  loadingCancelled.value = false;
  _loadPointCloudFileInner(file);
};
const _loadPointCloudFileInner = async (file) => {
  const lower = file.name.toLowerCase();

  if (lower.endsWith('.ply')) {
    loadPLYFile(file);
  } else if (lower.endsWith('.copc.laz')) {
    emit('loading-error', {
      url: file.name,
      error: 'COPC support coming soon. Requires Giro3D integration.'
    });
  } else if (lower.endsWith('.laz') || lower.endsWith('.las')) {
    loadLASFile(file);
  } else {
    emit('loading-error', {
      url: file.name,
      error: `Unsupported point cloud format: ${lower.split('.').pop()}`
    });
  }
};

const loadLASFile = async (file) => {
  const currentIndex = fileLoadedCount.value;
  const fileSize = file.size;

  emit('loading-progress', {
    url: file.name, index: currentIndex,
    loaded: 0, total: fileSize, progress: 0, status: 'reading'
  });

  // Read the file on the main thread — FileReader is IO-bound so it doesn't
  // block, and gives per-byte progress for the progress bar.
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
            progress: Math.round((e.loaded / e.total) * 100),
            status: 'reading'
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
    loaded: 0, total: fileSize, progress: 0, status: 'decompressing'
  });

  // Offload the CPU-heavy WASM decompression + point extraction to a worker
  // so the main thread is always free to respond to Stop button clicks.
  const worker = new Worker(
    new URL('../../workers/pointcloudWorker.js', import.meta.url),
    { type: 'module' }
  );
  activeWorker.value = worker;

  // cancelLoading() will terminate() the worker AND resolve this promise so
  // the async function can exit cleanly even though onmessage never fires.
  let cancelResolve;
  const cancelPromise = new Promise((r) => { cancelResolve = r; });
  activeWorkerCancel.value = cancelResolve;

  // Transfer the ArrayBuffer to the worker (zero-copy move, no serialisation)
  worker.postMessage(
    { arrayBuffer, fileName: file.name, maxPoints: 5_000_000 },
    [arrayBuffer]
  );

  await Promise.race([
    new Promise((resolve) => {
      worker.onmessage = ({ data }) => {
        if (data.type === 'progress') {
          emit('loading-progress', {
            url: file.name, index: currentIndex,
            loaded: data.loaded ?? 0,
            total:  data.total  ?? fileSize,
            progress: data.progress ?? 0,
            status: data.status,
          });
        } else if (data.type === 'result') {
          if (!loadingCancelled.value) {
            const positions = new Float32Array(data.posBuffer);
            // Keep a clean copy of the original RGB values for color-mode restore
            const rgbCopy   = data.colBuffer.slice(0);
            const colors    = new Float32Array(data.colBuffer);
            const geometry  = new THREE.BufferGeometry();
            geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
            geometry.setAttribute('color',    new THREE.BufferAttribute(colors,    3));

            const material = new THREE.PointsMaterial({
              size: 2, vertexColors: true, sizeAttenuation: false,
            });
            const pointCloud = new THREE.Points(geometry, material);
            pointCloud.rotation.x = -Math.PI / 2;
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
        if (!loadingCancelled.value) {
          emit('loading-error', { url: file.name, error: e.message });
        }
        resolve();
      };
    }),
    cancelPromise,
  ]);

  worker.terminate();
  if (activeWorker.value === worker)       activeWorker.value       = null;
  if (activeWorkerCancel.value === cancelResolve) activeWorkerCancel.value = null;
};

// ---------------------------------------------------------------------------
// DEM (single-band GeoTIFF) → 2.5D terrain mesh
// ---------------------------------------------------------------------------

const loadDEMFile = async (file) => {
  loadingCancelled.value = false;
  const currentIndex = fileLoadedCount.value;
  const fileSize = file.size;

  emit('loading-progress', {
    url: file.name, index: currentIndex,
    loaded: 0, total: fileSize, progress: 0, status: 'reading',
  });

  try {
    const { fromBlob } = await import('geotiff');
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

    // Extract georeferencing: bbox = [minX, minY, maxX, maxY] in the file's native CRS
    const bbox = image.getBoundingBox();
    const geoKeys = image.getGeoKeys();
    // GTModelTypeGeoKey: 1 = Projected, 2 = Geographic (degrees)
    const isGeographic = geoKeys?.GTModelTypeGeoKey === 2;
    let planeWidth, planeHeight;
    if (bbox && bbox.length === 4 && isFinite(bbox[0]) && isFinite(bbox[3])) {
      if (isGeographic) {
        // Convert degrees → approximate metres using mid-latitude scale
        const midLat = (bbox[1] + bbox[3]) / 2;
        planeWidth  = Math.abs(bbox[2] - bbox[0]) * 111320 * Math.cos(midLat * Math.PI / 180);
        planeHeight = Math.abs(bbox[3] - bbox[1]) * 110540;
      } else {
        // Projected CRS — units are already metres
        planeWidth  = Math.abs(bbox[2] - bbox[0]);
        planeHeight = Math.abs(bbox[3] - bbox[1]);
      }
    } else {
      // No valid geotransform — fall back to pixel dimensions
      planeWidth  = width;
      planeHeight = height;
    }

    if (loadingCancelled.value) return;

    emit('loading-progress', {
      url: file.name, index: currentIndex,
      loaded: fileSize, total: fileSize, progress: 40, status: 'parsing',
    });

    // Cap grid to 512×512 for real-time performance
    const MAX_GRID = 512;
    const scaleFactor = Math.min(1, MAX_GRID / Math.max(width, height));
    const gridW = Math.max(2, Math.round(width * scaleFactor));
    const gridH = Math.max(2, Math.round(height * scaleFactor));

    // Read (and optionally downsample) the single elevation band
    const [elevations] = await image.readRasters({
      width: gridW,
      height: gridH,
      resampleMethod: 'nearest',
    });

    if (loadingCancelled.value) return;

    emit('loading-progress', {
      url: file.name, index: currentIndex,
      loaded: fileSize, total: fileSize, progress: 70, status: 'parsing',
    });

    // Nodata handling
    const nodataRaw = image.getGDALNoData();
    const nodata = nodataRaw !== null && nodataRaw !== undefined ? parseFloat(nodataRaw) : null;
    const isNodata = (v) =>
      nodata !== null && Math.abs(v - nodata) <= Math.max(0.5, Math.abs(nodata) * 1e-6);

    // Find elevation range (skip nodata / non-finite values)
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

    // Build a PlaneGeometry in the XY plane and displace vertices along Z by elevation.
    // After mesh.rotation.x = -Math.PI/2 (Z-up → Y-up), Y becomes the elevation axis.
    // PlaneGeometry vertex layout: row-major, row 0 = top (+H/2 in Y), col 0 = left (-W/2 in X).
    // Use real-world dimensions from the GeoTIFF bounding box so that the XY scale
    // matches the elevation units (both in metres for projected CRS).
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

    // Hypsometric vertex colors (green → yellow → brown → gray → white)
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
      vertexColors: true,
      side: THREE.DoubleSide,
      shininess: 20,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.rotation.x = -Math.PI / 2; // Z-up (GIS) → Y-up (Three.js)
    mesh.name = file.name.replace(/\.[^.]+$/, '');
    mesh.userData.type = 'dem';
    mesh.userData.minElev = minElev;
    mesh.userData.maxElev = maxElev;
    mesh.userData.nodata = nodata;        // null if not present
    mesh.userData.verticalExaggeration = 1;
    mesh.userData.bbox = bbox ?? null;           // [minX, minY, maxX, maxY] in file CRS
    mesh.userData.planeWidth = planeWidth;
    mesh.userData.planeHeight = planeHeight;
    // Store raw elevations so vertical exaggeration can be applied without reloading
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

// Hypsometric tint: elevation fraction t ∈ [0,1] → {r,g,b} ∈ [0,1]
const demElevationColor = (t) => {
  const stops = [
    { t: 0.00, r: 0.13, g: 0.55, b: 0.13 }, // forest green
    { t: 0.30, r: 0.56, g: 0.73, b: 0.25 }, // yellow-green
    { t: 0.55, r: 0.80, g: 0.70, b: 0.20 }, // sandy yellow
    { t: 0.75, r: 0.65, g: 0.48, b: 0.28 }, // brown
    { t: 0.90, r: 0.78, g: 0.78, b: 0.78 }, // light gray
    { t: 1.00, r: 1.00, g: 1.00, b: 1.00 }, // white peaks
  ];
  let lo = stops[0], hi = stops[stops.length - 1];
  for (let i = 0; i < stops.length - 1; i++) {
    if (t >= stops[i].t && t <= stops[i + 1].t) { lo = stops[i]; hi = stops[i + 1]; break; }
  }
  const f = lo.t === hi.t ? 0 : (t - lo.t) / (hi.t - lo.t);
  return {
    r: lo.r + (hi.r - lo.r) * f,
    g: lo.g + (hi.g - lo.g) * f,
    b: lo.b + (hi.b - lo.b) * f,
  };
};

// Apply vertical exaggeration to a single DEM mesh identified by its Three.js uuid (= layer id).
// Uses raw elevations + stored nodata to avoid drift on repeated calls.
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

  // Recompute hypsometric colors based on original (un-exaggerated) elevation
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

const loadPLYFile = (file) => {
  const reader = new FileReader();
  activeReaders.add(reader);
  const currentIndex = fileLoadedCount.value;
  const fileSize = file.size;
  
  // Track progress
  reader.onprogress = (e) => {
    if (e.lengthComputable) {
      const progress = Math.round((e.loaded / e.total) * 100);
      emit('loading-progress', {
        url: file.name,
        index: currentIndex,
        loaded: e.loaded,
        total: e.total,
        progress,
        status: 'reading'
      });
    }
  };
  
  reader.onabort = () => { activeReaders.delete(reader); };

  reader.onload = (e) => {
    activeReaders.delete(reader);
    if (loadingCancelled.value) return;
    emit('loading-progress', {
      url: file.name,
      index: currentIndex,
      loaded: fileSize,
      total: fileSize,
      progress: 100,
      status: 'parsing'
    });
    
    // Use setTimeout to allow UI to update before synchronous parsing
    setTimeout(async () => {
      if (loadingCancelled.value) return;
      const loader = new PLYLoader();
      try {
        const rawGeometry = loader.parse(e.target.result);
        const totalCount = rawGeometry.attributes.position.count;

        // Subsample large clouds so rendering stays smooth
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

      // Create point cloud material — sizeAttenuation: false keeps points at a
      // fixed pixel size at any zoom level, preventing them from disappearing.
      const material = new THREE.PointsMaterial({
        size: 2,
        vertexColors: true,
        sizeAttenuation: false
      });

      // If no colors in PLY, add default color
      if (!geometry.attributes.color) {
        const colors = new Float32Array(geometry.attributes.position.count * 3).fill(0.7);
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      }

      const pointCloud = new THREE.Points(geometry, material);

      // Apply Z-up to Y-up rotation
      pointCloud.rotation.x = -Math.PI / 2;

      // Set type metadata
      pointCloud.userData.type          = 'pointcloud';
      pointCloud.userData.totalPoints   = totalCount;
      pointCloud.userData.sampledPoints = sampledCount;

      // Yield to the event loop so any queued Stop-button clicks can fire
      // before we commit the point cloud to the scene. Without this yield,
      // the synchronous loader.parse() blocks the thread, the click is
      // enqueued, and the cancel check passes (false) before the click fires.
      await new Promise(resolve => setTimeout(resolve, 0));
      if (loadingCancelled.value) return;
      scene.value.add(pointCloud);

      // Fit camera / update helpers for the whole scene
      adjustCameraToModel();

      console.log(`Point cloud loaded: ${sampledCount.toLocaleString()} points`);
      fileLoadedCount.value++;
      emit('model-loaded', { url: file.name, index: currentIndex, object: pointCloud, isFileDrop: true });
    } catch (error) {
      console.error('PLY loading error:', error);
      emit('loading-error', { url: file.name, error: error.message });
    }
    }, 50); // Small delay for UI update
  };
  
  reader.onerror = () => {
    activeReaders.delete(reader);
    emit('loading-error', { url: file.name, error: 'Failed to read file' });
  };
  
  reader.readAsArrayBuffer(file);
};

// Camera frustum visualization
const loadCamerasFile = async (file) => {
  loadingCancelled.value = false;
  const reader = new FileReader();
  activeReaders.add(reader);
  const fileSize = file.size;
  
  // Track progress
  reader.onprogress = (e) => {
    if (e.lengthComputable) {
      const progress = Math.round((e.loaded / e.total) * 100);
      emit('loading-progress', {
        url: file.name,
        index: 0,
        loaded: e.loaded,
        total: e.total,
        progress,
        status: 'reading'
      });
    }
  };
  
  reader.onabort = () => { activeReaders.delete(reader); };

  reader.onload = (e) => {
    activeReaders.delete(reader);
    if (loadingCancelled.value) return;
    emit('loading-progress', {
      url: file.name,
      index: 0,
      loaded: fileSize,
      total: fileSize,
      progress: 100,
      status: 'parsing'
    });
    
    // Use setTimeout to allow UI to update before synchronous parsing
    setTimeout(() => {
      if (loadingCancelled.value) return;
      try {
        const content = e.target.result;
        const cameras = parseCamerasTxt(content);
        
        console.log(`Parsed ${cameras.length} cameras from file`);
        
        // Create a group to hold all cameras
        const cameraGroup = new THREE.Group();
        cameraGroup.name = file.name;
        cameraGroup.userData.type = 'camera';
        cameraGroup.userData.cameraCount = cameras.length;
        
        cameras.forEach((cam, index) => {
          const cameraObject = addCameraFrustum(cam, index);
          if (cameraObject) {
            // Add camera group to the parent group
            cameraGroup.add(cameraObject);
          }
        });
        
        // Add group to scene
        scene.value.add(cameraGroup);
        
        console.log(`Loaded ${cameras.length} cameras into scene as group`);
        
        // Emit single layer for all cameras
        emit('model-loaded', { 
          url: file.name, 
          index: 0, 
          object: cameraGroup,
          isFileDrop: true
        });
      } catch (error) {
        console.error('Camera loading error:', error);
        emit('loading-error', { url: file.name, error: error.message });
      }
    }, 50); // Small delay for UI update
  };
  
  reader.onerror = () => {
    activeReaders.delete(reader);
    emit('loading-error', { url: file.name, error: 'Failed to read file' });
  };
  
  reader.readAsText(file);
};

const parseCamerasTxt = (content) => {
  const lines = content.split('\n').filter(line => line.trim() && !line.startsWith('#'));
  const cameras = [];
  
  // Detect delimiter - check first data line
  const firstLine = lines[0];
  const delimiter = firstLine?.includes(';') ? ';' : /\s+/;
  const isSemicolon = firstLine?.includes(';');
  
  for (const line of lines) {
    const parts = line.trim().split(delimiter).map(p => p.trim());
    
    // Handle different formats:
    // Semicolon CSV: Label;Enable;X;Y;Z;Yaw;Pitch;Roll;...
    // Space-separated: name x y z qw qx qy qz OR name x y z yaw pitch roll
    
    if (isSemicolon && parts.length >= 8) {
      // Semicolon format: Label;Enable;X;Y;Z;Yaw;Pitch;Roll
      const camera = {
        name: parts[0], // Label
        position: {
          x: parseFloat(parts[2]), // X/Easting
          y: parseFloat(parts[3]), // Y/Northing
          z: parseFloat(parts[4])  // Z/Altitude
        },
        euler: {
          yaw: parseFloat(parts[5]),   // Yaw
          pitch: parseFloat(parts[6]), // Pitch
          roll: parseFloat(parts[7])   // Roll
        }
      };
      cameras.push(camera);
    } else if (!isSemicolon && parts.length >= 7) {
      // Space-separated format
      const camera = {
        name: parts[0],
        position: {
          x: parseFloat(parts[1]),
          y: parseFloat(parts[2]),
          z: parseFloat(parts[3])
        }
      };
      
      // Check if quaternion (values typically between -1 and 1) or euler angles
      const val4 = parseFloat(parts[4]);
      if (parts.length >= 8 && Math.abs(val4) <= 1) {
        // Quaternion format
        camera.quaternion = {
          w: val4,
          x: parseFloat(parts[5]),
          y: parseFloat(parts[6]),
          z: parseFloat(parts[7])
        };
      } else {
        // Euler angles (degrees)
        camera.euler = {
          yaw: parseFloat(parts[4]),
          pitch: parseFloat(parts[5]),
          roll: parseFloat(parts[6])
        };
      }
      
      cameras.push(camera);
    }
  }
  
  return cameras;
};

const addCameraFrustum = (camData, index) => {
  if (!scene.value) return null;
  
  // Create a group to hold all camera components
  const cameraGroup = new THREE.Group();
  
  // Set position (convert Z-up to Y-up)
  const position = new THREE.Vector3(
    camData.position.x,
    camData.position.z, // Z becomes Y
    -camData.position.y  // Y becomes -Z
  );
  cameraGroup.position.copy(position);
  
  // Set rotation
  if (camData.quaternion) {
    const quat = new THREE.Quaternion(
      camData.quaternion.x,
      camData.quaternion.z,
      -camData.quaternion.y,
      camData.quaternion.w
    );
    cameraGroup.setRotationFromQuaternion(quat);
  } else if (camData.euler) {
    // Convert Yaw/Pitch/Roll to Three.js Euler
    const euler = new THREE.Euler(
      THREE.MathUtils.degToRad(-camData.euler.pitch), // Pitch (X rotation, inverted)
      THREE.MathUtils.degToRad(camData.euler.yaw),     // Yaw (Y rotation)
      THREE.MathUtils.degToRad(-camData.euler.roll),   // Roll (Z rotation, inverted)
      'YXZ' // Yaw-Pitch-Roll order
    );
    cameraGroup.setRotationFromEuler(euler);
  }
  
  // 1. Camera body - small gray box
  const bodyGeometry = new THREE.BoxGeometry(0.3, 0.2, 0.4);
  const bodyMaterial = new THREE.MeshBasicMaterial({ color: 0x666666 });
  const cameraBody = new THREE.Mesh(bodyGeometry, bodyMaterial);
  cameraBody.name = `camera_body_${camData.name}`;
  cameraGroup.add(cameraBody);
  
  // 2. Camera lens - small cylinder pointing forward
  const lensGeometry = new THREE.CylinderGeometry(0.08, 0.08, 0.15, 8);
  const lensMaterial = new THREE.MeshBasicMaterial({ color: 0x333333 });
  const lens = new THREE.Mesh(lensGeometry, lensMaterial);
  lens.rotation.x = Math.PI / 2; // Point forward (local -Z)
  lens.position.set(0, 0, -0.275);
  cameraGroup.add(lens);
  
  // 3. XYZ axes helper at camera position
  const axesHelper = new THREE.AxesHelper(0.5);
  cameraGroup.add(axesHelper);
  
  // 4. Subtle frustum wireframe (smaller, less prominent)
  const frustumGeometry = new THREE.BufferGeometry();
  const frustumVertices = new Float32Array([
    // Near plane corners
    -0.15, -0.1, -0.2,
    0.15, -0.1, -0.2,
    0.15, 0.1, -0.2,
    -0.15, 0.1, -0.2,
    // Far plane corners
    -0.6, -0.4, -1.5,
    0.6, -0.4, -1.5,
    0.6, 0.4, -1.5,
    -0.6, 0.4, -1.5,
  ]);
  frustumGeometry.setAttribute('position', new THREE.BufferAttribute(frustumVertices, 3));
  
  const frustumIndices = [
    // Near plane
    0, 1, 1, 2, 2, 3, 3, 0,
    // Far plane
    4, 5, 5, 6, 6, 7, 7, 4,
    // Connecting lines
    0, 4, 1, 5, 2, 6, 3, 7
  ];
  frustumGeometry.setIndex(frustumIndices);
  
  const frustumMaterial = new THREE.LineBasicMaterial({ color: 0x888888, transparent: true, opacity: 0.3 });
  const frustumLines = new THREE.LineSegments(frustumGeometry, frustumMaterial);
  cameraGroup.add(frustumLines);
  
  cameraGroup.name = `camera_${camData.name}`;
  cameraGroup.userData = { type: 'camera_frustum', cameraName: camData.name };
  
  // 5. Label sprite above camera
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d', { willReadFrequently: true });
  canvas.width = 256;
  canvas.height = 64;
  context.fillStyle = 'white';
  context.font = 'Bold 20px Arial';
  context.fillText(camData.name, 10, 30);
  
  const texture = new THREE.CanvasTexture(canvas);
  const spriteMaterial = new THREE.SpriteMaterial({ map: texture });
  const sprite = new THREE.Sprite(spriteMaterial);
  sprite.position.set(0, 0.8, 0); // Position relative to camera group
  sprite.scale.set(2, 0.5, 1);
  sprite.name = `camera_label_${camData.name}`;
  sprite.userData = { type: 'camera_label' };
  cameraGroup.add(sprite);
  
  return cameraGroup;
};

const fitCameraToScene = () => {
  if (!scene.value || !camera.value || !controls.value) return;
  
  const box = new THREE.Box3();
  scene.value.traverse((object) => {
    if (object.isMesh || object.isPoints) {
      box.expandByObject(object);
    }
  });
  
  if (box.isEmpty()) return;
  
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);
  const distance = maxDim * 2;
  
  camera.value.position.set(
    center.x + distance,
    center.y + distance,
    center.z + distance
  );
  controls.value.target.copy(center);
  camera.value.lookAt(center);
  controls.value.update();
};

// Get scene bounding box center and size for camera presets
const getSceneBounds = () => {
  if (!scene.value) return null;
  
  const box = new THREE.Box3();
  scene.value.traverse((object) => {
    if (object.isMesh || object.isPoints) {
      box.expandByObject(object);
    }
  });
  
  if (box.isEmpty()) return null;
  
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);
  return { center, size, maxDim };
};

// Camera preset views
const setCameraPreset = (preset) => {
  if (!camera.value || !controls.value) return;
  
  const bounds = getSceneBounds();
  const center = bounds ? bounds.center : new THREE.Vector3(0, 0, 0);
  const distance = bounds ? bounds.maxDim * 1.8 : 100;
  
  switch (preset) {
    case 'top':
      camera.value.position.set(center.x, center.y + distance, center.z);
      camera.value.up.set(0, 0, -1);
      break;
    case 'front':
      camera.value.position.set(center.x, center.y, center.z + distance);
      camera.value.up.set(0, 1, 0);
      break;
    case 'right':
      camera.value.position.set(center.x + distance, center.y, center.z);
      camera.value.up.set(0, 1, 0);
      break;
    case 'left':
      camera.value.position.set(center.x - distance, center.y, center.z);
      camera.value.up.set(0, 1, 0);
      break;
    case 'back':
      camera.value.position.set(center.x, center.y, center.z - distance);
      camera.value.up.set(0, 1, 0);
      break;
  }
  
  controls.value.target.copy(center);
  camera.value.lookAt(center);
  controls.value.update();
};

const resetToInitialCamera = () => {
  resetCamera();
};

// Zoom camera to specific layer
const zoomToLayer = (layerId) => {
  if (!scene.value || !camera.value || !controls.value) return;
  
  let targetObject = null;
  scene.value.traverse((object) => {
    if (object.uuid === layerId) {
      targetObject = object;
    }
  });
  
  if (!targetObject) return;
  
  // Calculate bounding box for this object
  const box = new THREE.Box3().setFromObject(targetObject);
  
  if (box.isEmpty()) return;
  
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);
  const distance = maxDim * 2.5;
  
  // Smoothly animate camera
  camera.value.position.set(
    center.x + distance,
    center.y + distance,
    center.z + distance
  );
  controls.value.target.copy(center);
  camera.value.lookAt(center);
  controls.value.update();
  
  console.log(`Zoomed to layer: ${targetObject.name}`);
};

// Layer management
const toggleLayerVisibility = (layerId, visible) => {
  if (!scene.value) return;
  
  scene.value.traverse((object) => {
    if (object.uuid === layerId) {
      object.visible = visible;
    }
  });
};

const removeLayer = (layerId) => {
  if (!scene.value) return;
  
  let objectToRemove = null;
  
  scene.value.traverse((object) => {
    if (object.uuid === layerId) {
      objectToRemove = object;
    }
  });
  
  if (objectToRemove) {
    // Recursively dispose of all geometries and materials in the object tree
    const disposeObject = (obj) => {
      if (obj.geometry) {
        obj.geometry.dispose();
      }
      if (obj.material) {
        if (Array.isArray(obj.material)) {
          obj.material.forEach(m => {
            if (m.map) m.map.dispose();
            m.dispose();
          });
        } else {
          if (obj.material.map) obj.material.map.dispose();
          obj.material.dispose();
        }
      }
      // Recursively dispose children
      if (obj.children) {
        obj.children.forEach(child => disposeObject(child));
      }
    };
    
    disposeObject(objectToRemove);
    scene.value.remove(objectToRemove);
    
    console.log(`Removed layer: ${objectToRemove.name || 'Unnamed'}`);
  }
};

// Raycasting for measurements
const onCanvasClick = (event) => {
  // XYZ coordinate picker takes priority
  if (pickMode.value) {
    handlePickClick(event);
    return;
  }

  // Use the new measurement handler if active
  if (currentMeasurementMode) {
    handleMeasurementClick(event);
    return;
  }

  // Legacy handling (fallback)
  if (!measurementMode.value || !scene.value || !camera.value) return;

  // Calculate mouse position in normalized device coordinates
  const rect = renderer.value.domElement.getBoundingClientRect();
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  // Update raycaster
  raycaster.setFromCamera(mouse, camera.value);

  // Get all meshes in the scene
  const meshes = [];
  scene.value.traverse((object) => {
    if (object.isMesh && object.name !== 'measurementMarker') {
      meshes.push(object);
    }
  });

  // Check for intersections
  const intersects = raycaster.intersectObjects(meshes, false);
  
  if (intersects.length > 0) {
    const point = intersects[0].point;
    addMeasurementPoint(point);
    addMeasurementMarker(point);
  }
};

const handlePickClick = (event) => {
  if (!scene.value || !camera.value || !controls.value) return;
  const dx = event.clientX - mouseDownPosition.x;
  const dy = event.clientY - mouseDownPosition.y;
  if (Math.sqrt(dx * dx + dy * dy) > 5) return;

  const rect = viewerRef.value.getBoundingClientRect();
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(mouse, camera.value);

  const camDist = camera.value.position.distanceTo(controls.value.target);
  raycaster.params.Points = { threshold: Math.max(0.5, camDist * 0.005) };

  const intersects = raycaster.intersectObjects(scene.value.children, true)
    .filter(h => !h.object.name?.startsWith('normalsHelper_') &&
                 h.object.name !== 'gridHelper' &&
                 h.object.name !== 'axesHelper' &&
                 h.object.name !== 'boxHelper');

  if (intersects.length > 0) {
    const p = intersects[0].point;
    setPickedCoord({ x: p.x, y: p.y, z: p.z });
  }
};

const addMeasurementMarker = (point) => {
  if (!scene.value) return;

  // Create a sphere marker at the clicked point
  const markerGeometry = new THREE.SphereGeometry(0.5, 16, 16);
  const markerMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });
  const marker = new THREE.Mesh(markerGeometry, markerMaterial);
  marker.position.copy(point);
  marker.name = 'measurementMarker';
  scene.value.add(marker);
  measurementMarkers.push(marker);

  // Draw line between points if we have more than one
  if (measurementPoints.value.length > 1) {
    const lineGeometry = new THREE.BufferGeometry().setFromPoints([
      measurementPoints.value[measurementPoints.value.length - 2],
      measurementPoints.value[measurementPoints.value.length - 1]
    ]);
    const lineMaterial = new THREE.LineBasicMaterial({ color: 0xff0000, linewidth: 2 });
    const line = new THREE.Line(lineGeometry, lineMaterial);
    line.name = 'measurementMarker';
    scene.value.add(line);
    measurementMarkers.push(line);
  }
};

const clearMeasurementMarkers = () => {
  if (!scene.value) return;
  measurementMarkers.forEach(marker => {
    scene.value.remove(marker);
    if (marker.geometry) marker.geometry.dispose();
    if (marker.material) marker.material.dispose();
  });
  measurementMarkers.length = 0;
};

let measurementCallback = null;
let currentMeasurementMode = null;
let currentMeasurementPoints = [];
let savedMeasurementObjects = []; // Array of arrays - each inner array contains objects for one measurement
let isMouseDownForMeasurement = false;
let mouseDownPosition = { x: 0, y: 0 };
let currentClosingLine = null; // Track the current closing line for area measurements

const enableMeasurementMode = (mode, callback) => {
  clearCurrentMeasurementMarkers();
  currentMeasurementMode = mode;
  measurementCallback = callback;
  currentMeasurementPoints = [];
  console.log('Measurement mode enabled:', mode);
};

const disableMeasurementMode = () => {
  currentMeasurementMode = null;
  measurementMode.value = null;
  measurementCallback = null;
  currentMeasurementPoints = [];
  clearCurrentMeasurementMarkers();
  clearAllMeasurements();
};

const clearMeasurements = () => {
  currentMeasurementPoints = [];
  clearCurrentMeasurementMarkers();
  clearAllMeasurements();
};

const clearCurrentMeasurementMarkers = () => {
  if (!scene.value) return;
  // Only remove current measurement markers, not saved ones
  const markersToRemove = [];
  scene.value.children.forEach(child => {
    if (child.name === 'currentMeasurementMarker') {
      markersToRemove.push(child);
    }
  });
  markersToRemove.forEach(marker => {
    scene.value.remove(marker);
    if (marker.geometry) marker.geometry.dispose();
    if (marker.material) marker.material.dispose();
  });
  measurementMarkers.length = 0;
  currentClosingLine = null; // Reset closing line reference
};

const clearAllMeasurements = () => {
  if (!scene.value) return;
  // Remove all saved measurement objects
  savedMeasurementObjects.forEach(measurementGroup => {
    measurementGroup.forEach(obj => {
      scene.value.remove(obj);
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) obj.material.dispose();
    });
  });
  // Also remove any current measurement markers
  const allMeasurements = [];
  scene.value.children.forEach(child => {
    if (child.name === 'currentMeasurementMarker' || child.name === 'savedMeasurementMarker') {
      allMeasurements.push(child);
    }
  });
  allMeasurements.forEach(marker => {
    scene.value.remove(marker);
    if (marker.geometry) marker.geometry.dispose();
    if (marker.material) marker.material.dispose();
  });
  measurementMarkers.length = 0;
  savedMeasurementObjects.length = 0;
};

const removeSavedMeasurement = (index) => {
  if (!scene.value || index < 0 || index >= savedMeasurementObjects.length) return;
  
  // Remove all objects belonging to this measurement from the scene
  const measurementGroup = savedMeasurementObjects[index];
  measurementGroup.forEach(obj => {
    scene.value.remove(obj);
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) obj.material.dispose();
  });
  
  // Remove the group from the array
  savedMeasurementObjects.splice(index, 1);
};

const handleMeasurementClick = (event) => {
  if (!currentMeasurementMode || !scene.value || !camera.value) return;
  
  // Don't register click if mouse moved significantly (camera was being rotated)
  const dx = event.clientX - mouseDownPosition.x;
  const dy = event.clientY - mouseDownPosition.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  
  if (distance > 5) { // 5 pixel threshold
    return; // Mouse moved too much, this was a drag not a click
  }

  // Calculate mouse position in normalized device coordinates
  const rect = viewerRef.value.getBoundingClientRect();
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  // Update raycaster
  raycaster.setFromCamera(mouse, camera.value);

  // Set a dynamic threshold for Points objects — use 0.5% of camera-to-target
  // distance so clicks register at any zoom level.
  const camDist = camera.value.position.distanceTo(controls.value.target);
  raycaster.params.Points = { threshold: Math.max(0.5, camDist * 0.005) };

  // Find intersections with scene objects (meshes AND point clouds)
  const intersects = raycaster.intersectObjects(scene.value.children, true)
    .filter(h => !h.object.name?.startsWith('normalsHelper_') && h.object.name !== 'gridHelper' && h.object.name !== 'axesHelper' && h.object.name !== 'boxHelper');
  
  if (intersects.length > 0) {
    const point = intersects[0].point;
    currentMeasurementPoints.push(point);

    // Add visual marker — scale the sphere to ~0.3% of camera distance so it
    // stays visible at any scene scale.
    const markerRadius = Math.max(0.3, camDist * 0.003);
    const markerGeometry = new THREE.SphereGeometry(markerRadius, 16, 16);
    const markerMaterial = new THREE.MeshBasicMaterial({ 
      color: 0xff0000,
      depthTest: false,
      depthWrite: false
    });
    const marker = new THREE.Mesh(markerGeometry, markerMaterial);
    marker.position.copy(point);
    marker.name = 'currentMeasurementMarker';
    marker.renderOrder = 999; // Render on top
    scene.value.add(marker);
    measurementMarkers.push(marker);

    // Draw lines between points
    if (currentMeasurementPoints.length > 1) {
      // Connect last two points
      const linePoints = [
        currentMeasurementPoints[currentMeasurementPoints.length - 2], 
        point
      ];

      const lineGeometry = new THREE.BufferGeometry().setFromPoints(linePoints);
      const lineMaterial = new THREE.LineBasicMaterial({ 
        color: 0xff0000, 
        linewidth: 2,
        depthTest: false,
        depthWrite: false
      });
      const line = new THREE.Line(lineGeometry, lineMaterial);
      line.name = 'currentMeasurementMarker';
      line.renderOrder = 999; // Render on top
      scene.value.add(line);
      measurementMarkers.push(line);
    }
    
    // For area measurements, also draw closing line to first point
    if (currentMeasurementMode === 'area' && currentMeasurementPoints.length >= 2) {
      // Remove the previous closing line if it exists
      if (currentClosingLine) {
        scene.value.remove(currentClosingLine);
        if (currentClosingLine.geometry) currentClosingLine.geometry.dispose();
        if (currentClosingLine.material) currentClosingLine.material.dispose();
        const index = measurementMarkers.indexOf(currentClosingLine);
        if (index > -1) measurementMarkers.splice(index, 1);
      }
      
      // Create new closing line
      const closingLinePoints = [point, currentMeasurementPoints[0]];
      const closingLineGeometry = new THREE.BufferGeometry().setFromPoints(closingLinePoints);
      const closingLineMaterial = new THREE.LineBasicMaterial({ 
        color: 0xff0000, 
        linewidth: 2,
        opacity: 0.7,
        transparent: true,
        depthTest: false,
        depthWrite: false
      });
      currentClosingLine = new THREE.Line(closingLineGeometry, closingLineMaterial);
      currentClosingLine.name = 'currentMeasurementMarker';
      currentClosingLine.renderOrder = 999; // Render on top
      scene.value.add(currentClosingLine);
      measurementMarkers.push(currentClosingLine);
    }

    // Calculate and report measurement
    let value = null;
    let complete = false;

    if (currentMeasurementMode === 'distance' && currentMeasurementPoints.length >= 2) {
      // Calculate total distance for multi-segment line
      let totalDistance = 0;
      for (let i = 1; i < currentMeasurementPoints.length; i++) {
        const p1 = currentMeasurementPoints[i - 1];
        const p2 = currentMeasurementPoints[i];
        const segmentDistance = Math.sqrt(
          Math.pow(p2.x - p1.x, 2) + 
          Math.pow(p2.y - p1.y, 2) + 
          Math.pow(p2.z - p1.z, 2)
        );
        totalDistance += segmentDistance;
      }
      value = `${totalDistance.toFixed(2)} m`;
    } else if (currentMeasurementMode === 'area' && currentMeasurementPoints.length >= 3) {
      // Simple polygon area calculation (assumes planar polygon on XY plane)
      let area = 0;
      for (let i = 0; i < currentMeasurementPoints.length; i++) {
        const j = (i + 1) % currentMeasurementPoints.length;
        area += currentMeasurementPoints[i].x * currentMeasurementPoints[j].y;
        area -= currentMeasurementPoints[j].x * currentMeasurementPoints[i].y;
      }
      area = Math.abs(area / 2);
      value = `${area.toFixed(2)} m²`;
    }

    // Call callback with measurement data
    if (measurementCallback) {
      measurementCallback({
        pointsCount: currentMeasurementPoints.length,
        value,
        complete
      });
    }

    // Don't auto-reset - let user continue or manually save
  }
};

const saveCurrentMeasurement = () => {
  if (!currentMeasurementMode || currentMeasurementPoints.length === 0) return;
  
  let value = null;
  
  if (currentMeasurementMode === 'distance' && currentMeasurementPoints.length >= 2) {
    // Calculate total distance
    let totalDistance = 0;
    for (let i = 1; i < currentMeasurementPoints.length; i++) {
      const p1 = currentMeasurementPoints[i - 1];
      const p2 = currentMeasurementPoints[i];
      const segmentDistance = Math.sqrt(
        Math.pow(p2.x - p1.x, 2) + 
        Math.pow(p2.y - p1.y, 2) + 
        Math.pow(p2.z - p1.z, 2)
      );
      totalDistance += segmentDistance;
    }
    value = `${totalDistance.toFixed(2)} m`;
  } else if (currentMeasurementMode === 'area' && currentMeasurementPoints.length >= 3) {
    // Calculate area
    let area = 0;
    for (let i = 0; i < currentMeasurementPoints.length; i++) {
      const j = (i + 1) % currentMeasurementPoints.length;
      area += currentMeasurementPoints[i].x * currentMeasurementPoints[j].y;
      area -= currentMeasurementPoints[j].x * currentMeasurementPoints[i].y;
    }
    area = Math.abs(area / 2);
    value = `${area.toFixed(2)} m²`;
  }
  
  if (value && measurementCallback) {
    // Convert current markers to saved markers and group them
    const measurementGroup = [];
    measurementMarkers.forEach(marker => {
      marker.name = 'savedMeasurementMarker';
      measurementGroup.push(marker);
    });
    // Store this group of objects for this measurement
    savedMeasurementObjects.push(measurementGroup);
    
    measurementCallback({
      pointsCount: currentMeasurementPoints.length,
      value,
      complete: true  // Mark as complete to save it
    });
  }
  
  // Clear for next measurement (but don't remove visual markers)
  currentMeasurementPoints = [];
  measurementMarkers.length = 0;
};

const undoLastPoint = () => {
  if (currentMeasurementPoints.length === 0) return;
  
  // Remove last point
  currentMeasurementPoints.pop();
  
  // Redraw all markers and lines
  clearCurrentMeasurementMarkers();
  
  // Redraw all points and lines
  for (let i = 0; i < currentMeasurementPoints.length; i++) {
    const point = currentMeasurementPoints[i];
    
    // Add marker
    const markerGeometry = new THREE.SphereGeometry(0.5, 16, 16);
    const markerMaterial = new THREE.MeshBasicMaterial({ 
      color: 0xff0000,
      depthTest: false,
      depthWrite: false
    });
    const marker = new THREE.Mesh(markerGeometry, markerMaterial);
    marker.position.copy(point);
    marker.name = 'currentMeasurementMarker';
    marker.renderOrder = 999;
    scene.value.add(marker);
    measurementMarkers.push(marker);
    
    // Add line from previous point
    if (i > 0) {
      const linePoints = [currentMeasurementPoints[i - 1], point];
      const lineGeometry = new THREE.BufferGeometry().setFromPoints(linePoints);
      const lineMaterial = new THREE.LineBasicMaterial({ 
        color: 0xff0000, 
        linewidth: 2,
        depthTest: false,
        depthWrite: false
      });
      const line = new THREE.Line(lineGeometry, lineMaterial);
      line.name = 'currentMeasurementMarker';
      line.renderOrder = 999;
      scene.value.add(line);
      measurementMarkers.push(line);
    }
  }
  
  // Add closing line for area if we have at least 2 points
  if (currentMeasurementMode === 'area' && currentMeasurementPoints.length >= 2) {
    // Remove old closing line if exists
    if (currentClosingLine) {
      scene.value.remove(currentClosingLine);
      if (currentClosingLine.geometry) currentClosingLine.geometry.dispose();
      if (currentClosingLine.material) currentClosingLine.material.dispose();
      const index = measurementMarkers.indexOf(currentClosingLine);
      if (index > -1) measurementMarkers.splice(index, 1);
    }
    
    const closingLinePoints = [
      currentMeasurementPoints[currentMeasurementPoints.length - 1],
      currentMeasurementPoints[0]
    ];
    const closingLineGeometry = new THREE.BufferGeometry().setFromPoints(closingLinePoints);
    const closingLineMaterial = new THREE.LineBasicMaterial({ 
      color: 0xff0000, 
      linewidth: 2,
      opacity: 0.7,
      transparent: true,
      depthTest: false,
      depthWrite: false
    });
    currentClosingLine = new THREE.Line(closingLineGeometry, closingLineMaterial);
    currentClosingLine.name = 'currentMeasurementMarker';
    currentClosingLine.renderOrder = 999;
    scene.value.add(currentClosingLine);
    measurementMarkers.push(currentClosingLine);
  }
  
  // Update callback with new values
  if (measurementCallback) {
    let value = null;
    
    if (currentMeasurementMode === 'distance' && currentMeasurementPoints.length >= 2) {
      let totalDistance = 0;
      for (let i = 1; i < currentMeasurementPoints.length; i++) {
        const p1 = currentMeasurementPoints[i - 1];
        const p2 = currentMeasurementPoints[i];
        const segmentDistance = Math.sqrt(
          Math.pow(p2.x - p1.x, 2) + 
          Math.pow(p2.y - p1.y, 2) + 
          Math.pow(p2.z - p1.z, 2)
        );
        totalDistance += segmentDistance;
      }
      value = `${totalDistance.toFixed(2)} m`;
    } else if (currentMeasurementMode === 'area' && currentMeasurementPoints.length >= 3) {
      let area = 0;
      for (let i = 0; i < currentMeasurementPoints.length; i++) {
        const j = (i + 1) % currentMeasurementPoints.length;
        area += currentMeasurementPoints[i].x * currentMeasurementPoints[j].y;
        area -= currentMeasurementPoints[j].x * currentMeasurementPoints[i].y;
      }
      area = Math.abs(area / 2);
      value = `${area.toFixed(2)} m²`;
    }
    
    measurementCallback({
      pointsCount: currentMeasurementPoints.length,
      value,
      complete: false
    });
  }
};

const cancelCurrentMeasurement = () => {
  currentMeasurementPoints = [];
  currentClosingLine = null;
  clearCurrentMeasurementMarkers();
  
  if (measurementCallback) {
    measurementCallback({
      pointsCount: 0,
      value: null,
      complete: false
    });
  }
};

// ---------------------------------------------------------------------------
// Metashape XML Marker / GCP loading
// ---------------------------------------------------------------------------

const loadMarkersFile = (file) => {
  const reader = new FileReader();

  reader.onload = (e) => {
    try {
      parseMarkersXML(e.target.result, file.name);
    } catch (err) {
      emit('loading-error', { url: file.name, error: err.message });
    }
  };

  reader.onerror = () => {
    emit('loading-error', { url: file.name, error: 'Failed to read file' });
  };

  reader.readAsText(file);
};

const parseMarkersXML = (xmlText, fileName) => {
  const doc = new DOMParser().parseFromString(xmlText, 'text/xml');
  if (doc.querySelector('parsererror')) {
    throw new Error('Invalid XML file — could not parse.');
  }

  // Collect enabled markers (skip marker-level enabled="false" OR reference enabled="false")
  const markerElements = Array.from(doc.querySelectorAll('marker'));
  const markers = [];

  for (const el of markerElements) {
    if (el.getAttribute('enabled') === 'false') continue;
    const label = el.getAttribute('label') || `Marker ${el.getAttribute('id')}`;
    const ref = el.querySelector('reference');
    if (!ref || ref.getAttribute('enabled') === 'false') continue;

    const x = parseFloat(ref.getAttribute('x'));
    const y = parseFloat(ref.getAttribute('y'));
    const z = parseFloat(ref.getAttribute('z'));
    if (isNaN(x) || isNaN(y) || isNaN(z)) continue;

    markers.push({ label, x, y, z });
  }

  if (markers.length === 0) {
    throw new Error('No enabled markers found in the file.');
  }

  // Derive a sensible flag height: 1/50 of the GCP bounding-box diagonal,
  // with a minimum so a single marker is still visible.
  const xs = markers.map(m => m.x);
  const ys = markers.map(m => m.y);
  const zs = markers.map(m => m.z);
  const dx = Math.max(...xs) - Math.min(...xs);
  const dy = Math.max(...ys) - Math.min(...ys);
  const dz = Math.max(...zs) - Math.min(...zs);
  const diagonal = Math.sqrt(dx * dx + dy * dy + dz * dz);
  const flagH = Math.max(10, diagonal / 50);

  const POLE_COLOR  = 0xdddddd;
  const FLAG_COLOR  = 0xe63946; // red

  const group = new THREE.Group();
  group.name = fileName;
  group.userData.type = 'markers';
  group.userData.markerCount = markers.length;

  for (const m of markers) {
    // Convert Z-up (EPSG:3031) → Y-up (Three.js)
    const sceneX =  m.x;
    const sceneY =  m.z;   // altitude → Three.js Y
    const sceneZ = -m.y;   // northing → Three.js -Z

    const flagGroup = new THREE.Group();
    flagGroup.position.set(sceneX, sceneY, sceneZ);
    flagGroup.name = m.label;

    // Pole — thin cylinder from ground to flag top
    const poleGeo = new THREE.CylinderGeometry(flagH * 0.015, flagH * 0.015, flagH, 6);
    const poleMat = new THREE.MeshBasicMaterial({ color: POLE_COLOR });
    const pole = new THREE.Mesh(poleGeo, poleMat);
    pole.position.y = flagH / 2;
    flagGroup.add(pole);

    // Flag triangle: top of pole → right → lower right
    const fw = flagH * 0.55;  // horizontal extent
    const fh = flagH * 0.35;  // vertical extent
    const flagGeo = new THREE.BufferGeometry();
    flagGeo.setAttribute('position', new THREE.Float32BufferAttribute([
      0,       flagH,        0,   // top of pole
      fw,      flagH - fh * 0.4, 0,   // tip of flag
      0,       flagH - fh,   0,   // foot of flag on pole
    ], 3));
    flagGeo.setIndex([0, 1, 2, 0, 2, 1]); // double-sided via two winding orders
    flagGeo.computeVertexNormals();
    const flagMat = new THREE.MeshBasicMaterial({ color: FLAG_COLOR, side: THREE.DoubleSide });
    flagGroup.add(new THREE.Mesh(flagGeo, flagMat));

    // Label sprite
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 56;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = 'rgba(255,255,255,0.88)';
    ctx.beginPath();
    ctx.roundRect(3, 3, canvas.width - 6, canvas.height - 6, 7);
    ctx.fill();
    ctx.fillStyle = '#222';
    ctx.font = 'bold 22px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(m.label, canvas.width / 2, canvas.height / 2);
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas) })
    );
    sprite.position.set(fw * 0.5, flagH * 1.25, 0);
    sprite.scale.set(flagH * 1.4, flagH * 0.32, 1);
    flagGroup.add(sprite);

    group.add(flagGroup);
  }

  scene.value.add(group);
  emit('model-loaded', { url: fileName, index: 0, object: group });
};

// Watch for model URL changes
watch(() => props.modelUrls, (newUrls) => {
  if (newUrls && newUrls.length > 0) {
    newUrls.forEach((url, index) => {
      loadModelFromUrl(url, index);
    });
  }
}, { immediate: false });

onMounted(() => {
  if (viewerRef.value) {
    initViewer();
    
    // Auto-load models after scene is ready
    if (props.modelUrls.length > 0) {
      props.modelUrls.forEach((url, index) => {
        loadModelFromUrl(url, index);
      });
    }
  }
});

onUnmounted(() => {
  window.removeEventListener('resize', handleResize);
  if (renderer.value) {
    renderer.value.domElement.removeEventListener('click', onCanvasClick);
  }
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
  }
  // Stop any in-flight point cloud worker
  if (activeWorker.value) {
    activeWorker.value.terminate();
    activeWorker.value = null;
  }
  activeWorkerCancel.value?.();
  activeWorkerCancel.value = null;
  clearAllMeasurements();
  cleanup();
});

// Watch for measurement mode changes
watch(measurementMode, (newMode) => {
  if (!newMode) {
    clearCurrentMeasurementMarkers();
  }
});

// Build/remove VertexNormalsHelpers for all mesh objects in loaded models
const updateNormalsHelpers = (show) => {
  if (!scene.value) return;

  // Remove any existing normals helpers first
  const toRemove = [];
  scene.value.traverse((child) => {
    if (child.name?.startsWith('normalsHelper_')) toRemove.push(child);
  });
  toRemove.forEach((h) => {
    scene.value.remove(h);
    if (h.geometry) h.geometry.dispose();
    if (h.material) h.material.dispose();
  });

  if (!show) return;

  // Collect meshes that belong to loaded models (excludes cameras, markers, etc.)
  const meshes = [];
  loadedModels.value.forEach((model) => {
    model.traverse((child) => {
      if (child.isMesh) meshes.push(child);
    });
  });

  meshes.forEach((mesh) => {
    if (!mesh.geometry?.attributes?.position) return;
    if (!mesh.geometry.attributes.normal) {
      mesh.geometry.computeVertexNormals();
    }
    if (!mesh.geometry.boundingSphere) mesh.geometry.computeBoundingSphere();
    const normalSize = Math.max(mesh.geometry.boundingSphere.radius * 0.05, 0.1);
    const helper = new VertexNormalsHelper(mesh, normalSize, 0x00aaff);
    helper.name = `normalsHelper_${mesh.uuid}`;
    scene.value.add(helper);
  });
};

// Sync normals helpers when the store toggle changes
watch(showNormals, (newVal) => {
  updateNormalsHelpers(newVal);
});

// Watch for theme changes and update scene background
watch(theme, (newTheme) => {
  if (scene.value) {
    scene.value.background = new THREE.Color(newTheme === 'dark' ? 0x1a1a1a : 0x87ceeb);
  }
});

// ---------------------------------------------------------------------------
// Scene Bookmarks
// ---------------------------------------------------------------------------
const applyBookmark = (bm) => {
  if (!camera.value || !controls.value) return;
  bookmarkTween = {
    startPos:    camera.value.position.clone(),
    startTarget: controls.value.target.clone(),
    endPos:    new THREE.Vector3(bm.position.x, bm.position.y, bm.position.z),
    endTarget: new THREE.Vector3(bm.target.x,   bm.target.y,   bm.target.z),
    t:        0,
    duration: 60,
  };
};

// ---------------------------------------------------------------------------
// Point Cloud Coloring Modes
// ---------------------------------------------------------------------------
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

const applyColorMode = (layerId, mode) => {
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
      const posArr = geo.attributes.position.array;
      let minZ = Infinity, maxZ = -Infinity;
      for (let i = 0; i < n; i++) {
        const z = posArr[i * 3 + 1]; // Y-up in Three.js
        if (z < minZ) minZ = z;
        if (z > maxZ) maxZ = z;
      }
      const range = maxZ - minZ || 1;
      for (let i = 0; i < n; i++) {
        const t = Math.max(0, Math.min(1, (posArr[i * 3 + 1] - minZ) / range));
        const { r, g, b } = demElevationColor(t);
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

// Expose methods for parent component
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