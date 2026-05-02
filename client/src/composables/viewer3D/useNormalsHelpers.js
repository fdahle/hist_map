import { watch } from 'vue';
import { VertexNormalsHelper } from 'three/examples/jsm/helpers/VertexNormalsHelper.js';
import { storeToRefs } from 'pinia';
import { useViewer3DStore } from '@/stores/viewer3D/viewer3dStore';

export function useNormalsHelpers() {
  const viewer3DStore = useViewer3DStore();
  const { scene, loadedModels, showNormals } = storeToRefs(viewer3DStore);

  const updateNormalsHelpers = (show) => {
    if (!scene.value) return;

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

    const meshes = [];
    loadedModels.value.forEach((model) => {
      model.traverse((child) => {
        if (child.isMesh) meshes.push(child);
      });
    });

    meshes.forEach((mesh) => {
      if (!mesh.geometry?.attributes?.position) return;
      if (!mesh.geometry.attributes.normal) mesh.geometry.computeVertexNormals();
      if (!mesh.geometry.boundingSphere) mesh.geometry.computeBoundingSphere();
      const normalSize = Math.max(mesh.geometry.boundingSphere.radius * 0.05, 0.1);
      const helper = new VertexNormalsHelper(mesh, normalSize, 0x00aaff);
      helper.name = `normalsHelper_${mesh.uuid}`;
      scene.value.add(helper);
    });
  };

  watch(showNormals, (newVal) => updateNormalsHelpers(newVal));

  return { updateNormalsHelpers };
}
