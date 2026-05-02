import * as THREE from 'three';
import { storeToRefs } from 'pinia';
import { useViewer3DStore } from '@/stores/viewer3D/viewer3dStore';

/**
 * @param {Object} ctx
 * @param {Function} ctx.emit
 * @param {import('vue').Ref<boolean>} ctx.loadingCancelled
 * @param {import('vue').Ref<number>} ctx.fileLoadedCount
 * @param {Set} ctx.activeReaders
 */
export function useCameraVisualizer({ emit, loadingCancelled, fileLoadedCount, activeReaders }) {
  const viewer3DStore = useViewer3DStore();
  const { scene } = storeToRefs(viewer3DStore);

  const parseCamerasTxt = (content) => {
    const lines = content.split('\n').filter(line => line.trim() && !line.startsWith('#'));
    const cameras = [];

    const firstLine = lines[0];
    const delimiter = firstLine?.includes(';') ? ';' : /\s+/;
    const isSemicolon = firstLine?.includes(';');

    for (const line of lines) {
      const parts = line.trim().split(delimiter).map(p => p.trim());

      if (isSemicolon && parts.length >= 8) {
        cameras.push({
          name: parts[0],
          position: { x: parseFloat(parts[2]), y: parseFloat(parts[3]), z: parseFloat(parts[4]) },
          euler: { yaw: parseFloat(parts[5]), pitch: parseFloat(parts[6]), roll: parseFloat(parts[7]) },
        });
      } else if (!isSemicolon && parts.length >= 7) {
        const camera = {
          name: parts[0],
          position: { x: parseFloat(parts[1]), y: parseFloat(parts[2]), z: parseFloat(parts[3]) },
        };
        const val4 = parseFloat(parts[4]);
        if (parts.length >= 8 && Math.abs(val4) <= 1) {
          camera.quaternion = { w: val4, x: parseFloat(parts[5]), y: parseFloat(parts[6]), z: parseFloat(parts[7]) };
        } else {
          camera.euler = { yaw: parseFloat(parts[4]), pitch: parseFloat(parts[5]), roll: parseFloat(parts[6]) };
        }
        cameras.push(camera);
      }
    }

    return cameras;
  };

  const addCameraFrustum = (camData, index) => {
    if (!scene.value) return null;

    const cameraGroup = new THREE.Group();

    const position = new THREE.Vector3(
      camData.position.x,
      camData.position.z,
      -camData.position.y
    );
    cameraGroup.position.copy(position);

    if (camData.quaternion) {
      const quat = new THREE.Quaternion(
        camData.quaternion.x, camData.quaternion.z, -camData.quaternion.y, camData.quaternion.w
      );
      cameraGroup.setRotationFromQuaternion(quat);
    } else if (camData.euler) {
      const euler = new THREE.Euler(
        THREE.MathUtils.degToRad(-camData.euler.pitch),
        THREE.MathUtils.degToRad(camData.euler.yaw),
        THREE.MathUtils.degToRad(-camData.euler.roll),
        'YXZ'
      );
      cameraGroup.setRotationFromEuler(euler);
    }

    const bodyGeometry = new THREE.BoxGeometry(0.3, 0.2, 0.4);
    const bodyMaterial = new THREE.MeshBasicMaterial({ color: 0x666666 });
    const cameraBody = new THREE.Mesh(bodyGeometry, bodyMaterial);
    cameraBody.name = `camera_body_${camData.name}`;
    cameraGroup.add(cameraBody);

    const lensGeometry = new THREE.CylinderGeometry(0.08, 0.08, 0.15, 8);
    const lensMaterial = new THREE.MeshBasicMaterial({ color: 0x333333 });
    const lens = new THREE.Mesh(lensGeometry, lensMaterial);
    lens.rotation.x = Math.PI / 2;
    lens.position.set(0, 0, -0.275);
    cameraGroup.add(lens);

    const axesHelper = new THREE.AxesHelper(0.5);
    cameraGroup.add(axesHelper);

    const frustumGeometry = new THREE.BufferGeometry();
    const frustumVertices = new Float32Array([
      -0.15, -0.1, -0.2,  0.15, -0.1, -0.2,  0.15, 0.1, -0.2,  -0.15, 0.1, -0.2,
      -0.6, -0.4, -1.5,   0.6, -0.4, -1.5,   0.6, 0.4, -1.5,   -0.6, 0.4, -1.5,
    ]);
    frustumGeometry.setAttribute('position', new THREE.BufferAttribute(frustumVertices, 3));
    frustumGeometry.setIndex([0, 1, 1, 2, 2, 3, 3, 0, 4, 5, 5, 6, 6, 7, 7, 4, 0, 4, 1, 5, 2, 6, 3, 7]);

    const frustumMaterial = new THREE.LineBasicMaterial({ color: 0x888888, transparent: true, opacity: 0.3 });
    const frustumLines = new THREE.LineSegments(frustumGeometry, frustumMaterial);
    cameraGroup.add(frustumLines);

    cameraGroup.name = `camera_${camData.name}`;
    cameraGroup.userData = { type: 'camera_frustum', cameraName: camData.name };

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
    sprite.position.set(0, 0.8, 0);
    sprite.scale.set(2, 0.5, 1);
    sprite.name = `camera_label_${camData.name}`;
    sprite.userData = { type: 'camera_label' };
    cameraGroup.add(sprite);

    return cameraGroup;
  };

  const loadCamerasFile = async (file) => {
    loadingCancelled.value = false;
    const reader = new FileReader();
    activeReaders.add(reader);
    const fileSize = file.size;

    reader.onprogress = (e) => {
      if (e.lengthComputable) {
        emit('loading-progress', {
          url: file.name, index: 0,
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
        url: file.name, index: 0,
        loaded: fileSize, total: fileSize, progress: 100, status: 'parsing',
      });

      setTimeout(() => {
        if (loadingCancelled.value) return;
        try {
          const cameras = parseCamerasTxt(e.target.result);

          console.log(`Parsed ${cameras.length} cameras from file`);

          const cameraGroup = new THREE.Group();
          cameraGroup.name = file.name;
          cameraGroup.userData.type = 'camera';
          cameraGroup.userData.cameraCount = cameras.length;

          cameras.forEach((cam, index) => {
            const cameraObject = addCameraFrustum(cam, index);
            if (cameraObject) cameraGroup.add(cameraObject);
          });

          scene.value.add(cameraGroup);

          console.log(`Loaded ${cameras.length} cameras into scene as group`);

          emit('model-loaded', { url: file.name, index: 0, object: cameraGroup, isFileDrop: true });
        } catch (error) {
          console.error('Camera loading error:', error);
          emit('loading-error', { url: file.name, error: error.message });
        }
      }, 50);
    };

    reader.onerror = () => {
      activeReaders.delete(reader);
      emit('loading-error', { url: file.name, error: 'Failed to read file' });
    };

    reader.readAsText(file);
  };

  return { loadCamerasFile, parseCamerasTxt, addCameraFrustum };
}
