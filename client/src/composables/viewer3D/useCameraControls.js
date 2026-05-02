import { ref } from 'vue';
import * as THREE from 'three';
import { storeToRefs } from 'pinia';
import { useViewer3DStore } from '@/stores/viewer3D/viewer3dStore';

export function useCameraControls() {
  const viewer3DStore = useViewer3DStore();
  const { scene, camera, controls, giro3dInstance, showBoundingBox } = storeToRefs(viewer3DStore);
  const { storeInitialCamera, resetCamera } = viewer3DStore;

  const bookmarkTween = ref(null);

  // Helper: find a COPC entity by layer id in the Giro3D instance
  const findCOPCEntity = (layerId) => {
    if (!giro3dInstance.value) return null;
    const entities = giro3dInstance.value.getEntities(e => e.id === layerId);
    return entities?.[0] ?? null;
  };

  const adjustCameraToModel = () => {
    if (!scene.value || !camera.value || !controls.value) return;

    scene.value.updateMatrixWorld(true);

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

    if (giro3dInstance.value) {
      for (const entity of giro3dInstance.value.getEntities()) {
        const box = entity.getBoundingBox?.();
        if (box && !box.isEmpty()) modelBBox.union(box);
      }
    }

    if (modelBBox.isEmpty()) return;

    const modelSize = modelBBox.getSize(new THREE.Vector3());
    const modelCenter = modelBBox.getCenter(new THREE.Vector3());
    const maxModelDim = Math.max(modelSize.x, modelSize.y, modelSize.z);

    const grid = scene.value.getObjectByName('gridHelper');
    if (grid) {
      const gridSize = maxModelDim * 2;
      grid.scale.setScalar(gridSize / 200);
      grid.position.set(modelCenter.x, modelCenter.y, modelBBox.min.z);
      grid.rotation.set(Math.PI / 2, 0, 0);
    }

    const axes = scene.value.getObjectByName('axesHelper');
    if (axes) {
      axes.scale.setScalar(maxModelDim / 50);
      axes.position.set(modelCenter.x, modelCenter.y, modelBBox.min.z);
    }

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

    scene.value.updateMatrixWorld(true);

    console.log(`Scene helpers updated — extent: ${modelSize.x.toFixed(2)} x ${modelSize.y.toFixed(2)} x ${modelSize.z.toFixed(2)}`);
  };

  const fitCameraToScene = () => {
    if (!scene.value || !camera.value || !controls.value) return;

    const box = new THREE.Box3();
    scene.value.traverse((object) => {
      if (object.isMesh || object.isPoints) box.expandByObject(object);
    });

    if (box.isEmpty()) return;

    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const distance = maxDim * 2;

    camera.value.position.set(center.x + distance, center.y + distance, center.z + distance);
    controls.value.target.copy(center);
    camera.value.lookAt(center);
    controls.value.update();
  };

  const getSceneBounds = () => {
    if (!scene.value) return null;

    const box = new THREE.Box3();
    scene.value.traverse((object) => {
      if (object.isMesh || object.isPoints) box.expandByObject(object);
    });

    if (box.isEmpty()) return null;

    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    return { center, size, maxDim };
  };

  const setCameraPreset = (preset) => {
    if (!camera.value || !controls.value) return;

    const bounds = getSceneBounds();
    const center = bounds ? bounds.center : new THREE.Vector3(0, 0, 0);
    const distance = bounds ? bounds.maxDim * 1.8 : 100;

    switch (preset) {
      case 'top':
        camera.value.position.set(center.x, center.y, center.z + distance);
        camera.value.up.set(0, 1, 0);
        break;
      case 'front':
        camera.value.position.set(center.x, center.y - distance, center.z);
        camera.value.up.set(0, 0, 1);
        break;
      case 'right':
        camera.value.position.set(center.x - distance, center.y, center.z);
        camera.value.up.set(0, 0, 1);
        break;
      case 'left':
        camera.value.position.set(center.x + distance, center.y, center.z);
        camera.value.up.set(0, 0, 1);
        break;
      case 'back':
        camera.value.position.set(center.x, center.y + distance, center.z);
        camera.value.up.set(0, 0, 1);
        break;
    }

    controls.value.target.copy(center);
    camera.value.lookAt(center);
    controls.value.update();
  };

  const resetToInitialCamera = () => resetCamera();

  const zoomToLayer = (layerId) => {
    if (!camera.value || !controls.value) return;

    const copcEntity = findCOPCEntity(layerId);
    if (copcEntity) {
      if (!copcEntity.object3d) return;
      const box = new THREE.Box3().setFromObject(copcEntity.object3d);
      if (box.isEmpty()) return;
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z);
      const distance = maxDim * 2.5;
      camera.value.position.set(center.x + distance, center.y + distance, center.z + distance);
      controls.value.target.copy(center);
      camera.value.lookAt(center);
      controls.value.update();
      return;
    }

    if (!scene.value) return;
    let targetObject = null;
    scene.value.traverse((object) => {
      if (object.uuid === layerId) targetObject = object;
    });

    if (!targetObject) return;

    const box = new THREE.Box3().setFromObject(targetObject);
    if (box.isEmpty()) return;

    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const distance = maxDim * 2.5;

    camera.value.position.set(center.x + distance, center.y + distance, center.z + distance);
    controls.value.target.copy(center);
    camera.value.lookAt(center);
    controls.value.update();

    console.log(`Zoomed to layer: ${targetObject.name}`);
  };

  const applyBookmark = (bm) => {
    if (!camera.value || !controls.value) return;
    bookmarkTween.value = {
      startPos:    camera.value.position.clone(),
      startTarget: controls.value.target.clone(),
      endPos:    new THREE.Vector3(bm.position.x, bm.position.y, bm.position.z),
      endTarget: new THREE.Vector3(bm.target.x,   bm.target.y,   bm.target.z),
      t:        0,
      duration: 60,
    };
  };

  return {
    bookmarkTween,
    adjustCameraToModel,
    fitCameraToScene,
    getSceneBounds,
    setCameraPreset,
    resetToInitialCamera,
    zoomToLayer,
    applyBookmark,
  };
}
