import * as THREE from 'three';
import Instance from '@giro3d/giro3d/core/Instance.js';
import CoordinateSystem from '@giro3d/giro3d/core/geographic/CoordinateSystem.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useViewer3DStore } from '@/stores/viewer3D/viewer3dStore';
import { useSettingsStore } from '@/stores/settingsStore.js';
import { debounce } from '@/utils/helpers.js';

/**
 * @param {Object} ctx
 * @param {import('vue').Ref<HTMLElement>} ctx.viewerRef
 * @param {Function} ctx.emit
 * @param {Function} ctx.onCanvasClick  - click handler for measurements / pick
 * @param {Function} ctx.onMouseDown    - mousedown handler (drag detection)
 * @param {import('vue').Ref<Object|null>} ctx.bookmarkTween - tween state owned by useCameraControls
 */
export function useSceneInit({ viewerRef, emit, onCanvasClick, onMouseDown, bookmarkTween }) {
  const viewer3DStore = useViewer3DStore();
  const { scene, camera, renderer } = storeToRefs(viewer3DStore);
  const { setScene, setCamera, setRenderer, setControls, setGiro3dInstance } = viewer3DStore;

  const settingsStore = useSettingsStore();
  const { theme, viewer3dBackgroundColor } = storeToRefs(settingsStore);

  let animationFrameId = null;

  const handleResize = () => {
    if (!viewerRef.value || !camera.value || !renderer.value) return;
    camera.value.aspect = viewerRef.value.clientWidth / viewerRef.value.clientHeight;
    camera.value.updateProjectionMatrix();
    renderer.value.setSize(viewerRef.value.clientWidth, viewerRef.value.clientHeight);
  };

  const debouncedHandleResize = debounce(() => handleResize(), 150);

  const initViewer = async () => {
    if (!viewerRef.value) return;

    const instance = new Instance({
      target: viewerRef.value,
      crs: CoordinateSystem.unknown,
      renderer: { antialias: true, preserveDrawingBuffer: true },
    });

    instance.mainLoop.automaticCameraPlaneComputation = false;

    const newCamera = instance.view.camera;
    newCamera.fov = 75;
    newCamera.near = 0.1;
    newCamera.far = 1000000;
    newCamera.position.set(100, 100, 100);
    newCamera.up.set(0, 0, 1);
    newCamera.lookAt(0, 0, 0);
    newCamera.updateProjectionMatrix();

    const newControls = new OrbitControls(newCamera, instance.domElement);
    newControls.enableDamping = true;
    newControls.dampingFactor = 0.05;
    instance.view.setControls(newControls);

    instance.scene.background = new THREE.Color(
      viewer3dBackgroundColor.value ?? (theme.value === 'dark' ? 0x1a1a1a : 0x87ceeb)
    );

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    instance.scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(100, 100, 50);
    instance.scene.add(directionalLight);

    const gridHelper = new THREE.GridHelper(200, 20, 0x888888, 0x444444);
    gridHelper.rotation.x = -Math.PI / 2;
    gridHelper.name = 'gridHelper';
    instance.scene.add(gridHelper);

    const axesHelper = new THREE.AxesHelper(50);
    axesHelper.name = 'axesHelper';
    instance.scene.add(axesHelper);

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);

      if (bookmarkTween.value) {
        bookmarkTween.value.t += 1;
        const alpha = Math.min(1, bookmarkTween.value.t / bookmarkTween.value.duration);
        const ease = 1 - Math.pow(1 - alpha, 3);
        newCamera.position.lerpVectors(bookmarkTween.value.startPos, bookmarkTween.value.endPos, ease);
        newControls.target.lerpVectors(bookmarkTween.value.startTarget, bookmarkTween.value.endTarget, ease);
        if (alpha >= 1) bookmarkTween.value = null;
      }

      newControls.update();
      instance.notifyChange();
    };
    animate();

    window.addEventListener('resize', debouncedHandleResize);
    instance.domElement.addEventListener('click', onCanvasClick);
    instance.domElement.addEventListener('mousedown', onMouseDown);

    setScene(instance.scene);
    setCamera(newCamera);
    setRenderer(instance.renderer);
    setControls(newControls);
    setGiro3dInstance(instance);

    emit('scene-ready');
  };

  const cleanup = () => {
    window.removeEventListener('resize', debouncedHandleResize);
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }
  };

  watch([theme, viewer3dBackgroundColor], ([newTheme, customColor]) => {
    if (scene.value) {
      scene.value.background = new THREE.Color(
        customColor ?? (newTheme === 'dark' ? 0x1a1a1a : 0x87ceeb)
      );
    }
  });

  return { initViewer, handleResize, debouncedHandleResize, cleanup };
}
