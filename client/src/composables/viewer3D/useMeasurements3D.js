import * as THREE from 'three';
import { watch, onUnmounted } from 'vue';
import { storeToRefs } from 'pinia';
import { useViewer3DStore } from '@/stores/viewer3D/viewer3dStore';

/**
 * @param {Object} ctx
 * @param {Function} ctx.emit
 * @param {import('vue').Ref<HTMLElement>} ctx.viewerRef
 */
export function useMeasurements3D({ emit, viewerRef }) {
  const viewer3DStore = useViewer3DStore();
  const {
    scene, camera, controls, renderer,
    measurementMode, measurementPoints, pickMode,
  } = storeToRefs(viewer3DStore);
  const { addMeasurementPoint, setPickedCoord } = viewer3DStore;

  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();
  const measurementMarkers = [];

  let measurementCallback = null;
  let currentMeasurementMode = null;
  let currentMeasurementPoints = [];
  let savedMeasurementObjects = [];
  let mouseDownPosition = { x: 0, y: 0 };
  let currentClosingLine = null;

  const onMouseDown = (e) => {
    mouseDownPosition.x = e.clientX;
    mouseDownPosition.y = e.clientY;
  };

  const addMeasurementMarker = (point) => {
    if (!scene.value) return;

    const markerGeometry = new THREE.SphereGeometry(0.5, 16, 16);
    const markerMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    const marker = new THREE.Mesh(markerGeometry, markerMaterial);
    marker.position.copy(point);
    marker.name = 'measurementMarker';
    scene.value.add(marker);
    measurementMarkers.push(marker);

    if (measurementPoints.value.length > 1) {
      const lineGeometry = new THREE.BufferGeometry().setFromPoints([
        measurementPoints.value[measurementPoints.value.length - 2],
        measurementPoints.value[measurementPoints.value.length - 1],
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

  const clearCurrentMeasurementMarkers = () => {
    if (!scene.value) return;
    const markersToRemove = [];
    scene.value.children.forEach(child => {
      if (child.name === 'currentMeasurementMarker') markersToRemove.push(child);
    });
    markersToRemove.forEach(marker => {
      scene.value.remove(marker);
      if (marker.geometry) marker.geometry.dispose();
      if (marker.material) marker.material.dispose();
    });
    measurementMarkers.length = 0;
    currentClosingLine = null;
  };

  const clearAllMeasurements = () => {
    if (!scene.value) return;
    savedMeasurementObjects.forEach(measurementGroup => {
      measurementGroup.forEach(obj => {
        scene.value.remove(obj);
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) obj.material.dispose();
      });
    });
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

  const removeSavedMeasurement = (index) => {
    if (!scene.value || index < 0 || index >= savedMeasurementObjects.length) return;
    const measurementGroup = savedMeasurementObjects[index];
    measurementGroup.forEach(obj => {
      scene.value.remove(obj);
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) obj.material.dispose();
    });
    savedMeasurementObjects.splice(index, 1);
  };

  const _computeMeasurementValue = (mode, points) => {
    if (mode === 'distance' && points.length >= 2) {
      let totalDistance = 0;
      for (let i = 1; i < points.length; i++) {
        const p1 = points[i - 1];
        const p2 = points[i];
        totalDistance += Math.sqrt(
          Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2) + Math.pow(p2.z - p1.z, 2)
        );
      }
      return `${totalDistance.toFixed(2)} m`;
    } else if (mode === 'area' && points.length >= 3) {
      let area = 0;
      for (let i = 0; i < points.length; i++) {
        const j = (i + 1) % points.length;
        area += points[i].x * points[j].y;
        area -= points[j].x * points[i].y;
      }
      return `${Math.abs(area / 2).toFixed(2)} m²`;
    }
    return null;
  };

  const handleMeasurementClick = (event) => {
    if (!currentMeasurementMode || !scene.value || !camera.value) return;

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
      const point = intersects[0].point;
      currentMeasurementPoints.push(point);

      const markerRadius = Math.max(0.3, camDist * 0.003);
      const markerGeometry = new THREE.SphereGeometry(markerRadius, 16, 16);
      const markerMaterial = new THREE.MeshBasicMaterial({
        color: 0xff0000, depthTest: false, depthWrite: false,
      });
      const marker = new THREE.Mesh(markerGeometry, markerMaterial);
      marker.position.copy(point);
      marker.name = 'currentMeasurementMarker';
      marker.renderOrder = 999;
      scene.value.add(marker);
      measurementMarkers.push(marker);

      if (currentMeasurementPoints.length > 1) {
        const linePoints = [currentMeasurementPoints[currentMeasurementPoints.length - 2], point];
        const lineGeometry = new THREE.BufferGeometry().setFromPoints(linePoints);
        const lineMaterial = new THREE.LineBasicMaterial({
          color: 0xff0000, linewidth: 2, depthTest: false, depthWrite: false,
        });
        const line = new THREE.Line(lineGeometry, lineMaterial);
        line.name = 'currentMeasurementMarker';
        line.renderOrder = 999;
        scene.value.add(line);
        measurementMarkers.push(line);
      }

      if (currentMeasurementMode === 'area' && currentMeasurementPoints.length >= 2) {
        if (currentClosingLine) {
          scene.value.remove(currentClosingLine);
          if (currentClosingLine.geometry) currentClosingLine.geometry.dispose();
          if (currentClosingLine.material) currentClosingLine.material.dispose();
          const index = measurementMarkers.indexOf(currentClosingLine);
          if (index > -1) measurementMarkers.splice(index, 1);
        }
        const closingLinePoints = [point, currentMeasurementPoints[0]];
        const closingLineGeometry = new THREE.BufferGeometry().setFromPoints(closingLinePoints);
        const closingLineMaterial = new THREE.LineBasicMaterial({
          color: 0xff0000, linewidth: 2, opacity: 0.7, transparent: true,
          depthTest: false, depthWrite: false,
        });
        currentClosingLine = new THREE.Line(closingLineGeometry, closingLineMaterial);
        currentClosingLine.name = 'currentMeasurementMarker';
        currentClosingLine.renderOrder = 999;
        scene.value.add(currentClosingLine);
        measurementMarkers.push(currentClosingLine);
      }

      const value = _computeMeasurementValue(currentMeasurementMode, currentMeasurementPoints);

      if (measurementCallback) {
        measurementCallback({ pointsCount: currentMeasurementPoints.length, value, complete: false });
      }
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

  const onCanvasClick = (event) => {
    if (pickMode.value) {
      handlePickClick(event);
      return;
    }

    if (currentMeasurementMode) {
      handleMeasurementClick(event);
      return;
    }

    // Legacy handling (fallback)
    if (!measurementMode.value || !scene.value || !camera.value) return;

    const rect = renderer.value.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera.value);

    const meshes = [];
    scene.value.traverse((object) => {
      if (object.isMesh && object.name !== 'measurementMarker') meshes.push(object);
    });

    const intersects = raycaster.intersectObjects(meshes, false);

    if (intersects.length > 0) {
      const point = intersects[0].point;
      addMeasurementPoint(point);
      addMeasurementMarker(point);
    }
  };

  const saveCurrentMeasurement = () => {
    if (!currentMeasurementMode || currentMeasurementPoints.length === 0) return;

    const value = _computeMeasurementValue(currentMeasurementMode, currentMeasurementPoints);

    if (value && measurementCallback) {
      const measurementGroup = [];
      measurementMarkers.forEach(marker => {
        marker.name = 'savedMeasurementMarker';
        measurementGroup.push(marker);
      });
      savedMeasurementObjects.push(measurementGroup);

      measurementCallback({ pointsCount: currentMeasurementPoints.length, value, complete: true });
    }

    currentMeasurementPoints = [];
    measurementMarkers.length = 0;
  };

  const undoLastPoint = () => {
    if (currentMeasurementPoints.length === 0) return;

    currentMeasurementPoints.pop();

    clearCurrentMeasurementMarkers();

    const camDist = camera.value?.position.distanceTo(controls.value?.target) ?? 100;

    for (let i = 0; i < currentMeasurementPoints.length; i++) {
      const point = currentMeasurementPoints[i];

      const markerGeometry = new THREE.SphereGeometry(0.5, 16, 16);
      const markerMaterial = new THREE.MeshBasicMaterial({
        color: 0xff0000, depthTest: false, depthWrite: false,
      });
      const marker = new THREE.Mesh(markerGeometry, markerMaterial);
      marker.position.copy(point);
      marker.name = 'currentMeasurementMarker';
      marker.renderOrder = 999;
      scene.value.add(marker);
      measurementMarkers.push(marker);

      if (i > 0) {
        const linePoints = [currentMeasurementPoints[i - 1], point];
        const lineGeometry = new THREE.BufferGeometry().setFromPoints(linePoints);
        const lineMaterial = new THREE.LineBasicMaterial({
          color: 0xff0000, linewidth: 2, depthTest: false, depthWrite: false,
        });
        const line = new THREE.Line(lineGeometry, lineMaterial);
        line.name = 'currentMeasurementMarker';
        line.renderOrder = 999;
        scene.value.add(line);
        measurementMarkers.push(line);
      }
    }

    if (currentMeasurementMode === 'area' && currentMeasurementPoints.length >= 2) {
      if (currentClosingLine) {
        scene.value.remove(currentClosingLine);
        if (currentClosingLine.geometry) currentClosingLine.geometry.dispose();
        if (currentClosingLine.material) currentClosingLine.material.dispose();
        const index = measurementMarkers.indexOf(currentClosingLine);
        if (index > -1) measurementMarkers.splice(index, 1);
      }
      const closingLinePoints = [
        currentMeasurementPoints[currentMeasurementPoints.length - 1],
        currentMeasurementPoints[0],
      ];
      const closingLineGeometry = new THREE.BufferGeometry().setFromPoints(closingLinePoints);
      const closingLineMaterial = new THREE.LineBasicMaterial({
        color: 0xff0000, linewidth: 2, opacity: 0.7, transparent: true,
        depthTest: false, depthWrite: false,
      });
      currentClosingLine = new THREE.Line(closingLineGeometry, closingLineMaterial);
      currentClosingLine.name = 'currentMeasurementMarker';
      currentClosingLine.renderOrder = 999;
      scene.value.add(currentClosingLine);
      measurementMarkers.push(currentClosingLine);
    }

    if (measurementCallback) {
      const value = _computeMeasurementValue(currentMeasurementMode, currentMeasurementPoints);
      measurementCallback({ pointsCount: currentMeasurementPoints.length, value, complete: false });
    }
  };

  const cancelCurrentMeasurement = () => {
    currentMeasurementPoints = [];
    currentClosingLine = null;
    clearCurrentMeasurementMarkers();

    if (measurementCallback) {
      measurementCallback({ pointsCount: 0, value: null, complete: false });
    }
  };

  watch(measurementMode, (newMode) => {
    if (!newMode) clearCurrentMeasurementMarkers();
  });

  onUnmounted(() => {
    clearAllMeasurements();
  });

  return {
    onCanvasClick,
    onMouseDown,
    enableMeasurementMode,
    disableMeasurementMode,
    clearMeasurements,
    clearAllMeasurements,
    saveCurrentMeasurement,
    undoLastPoint,
    cancelCurrentMeasurement,
    removeSavedMeasurement,
  };
}
