import { storeToRefs } from 'pinia';
import { useViewer3DStore } from '@/stores/viewer3D/viewer3dStore';

export function useViewer3DLayers() {
  const viewer3DStore = useViewer3DStore();
  const { scene, giro3dInstance } = storeToRefs(viewer3DStore);

  const findCOPCEntity = (layerId) => {
    if (!giro3dInstance.value) return null;
    const entities = giro3dInstance.value.getEntities(e => e.id === layerId);
    return entities?.[0] ?? null;
  };

  const toggleLayerVisibility = (layerId, visible) => {
    const copcEntity = findCOPCEntity(layerId);
    if (copcEntity) {
      copcEntity.visible = visible;
      giro3dInstance.value?.notifyChange();
      return;
    }

    if (!scene.value) return;

    scene.value.traverse((object) => {
      if (object.uuid === layerId) object.visible = visible;
    });
  };

  const removeLayer = (layerId) => {
    const copcEntity = findCOPCEntity(layerId);
    if (copcEntity) {
      giro3dInstance.value.remove(copcEntity);
      giro3dInstance.value.notifyChange();
      return;
    }

    if (!scene.value) return;

    let objectToRemove = null;
    scene.value.traverse((object) => {
      if (object.uuid === layerId) objectToRemove = object;
    });

    if (objectToRemove) {
      const disposeObject = (obj) => {
        if (obj.geometry) obj.geometry.dispose();
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
        if (obj.children) obj.children.forEach(child => disposeObject(child));
      };

      disposeObject(objectToRemove);
      scene.value.remove(objectToRemove);

      console.log(`Removed layer: ${objectToRemove.name || 'Unnamed'}`);
    }
  };

  return { findCOPCEntity, toggleLayerVisibility, removeLayer };
}
