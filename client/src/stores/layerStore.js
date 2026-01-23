import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { useMapStore } from './mapStore'; 

export const useLayerStore = defineStore('layers', () => {

  const layers = ref([]);

  // --- ACTIONS ---

  // UPDATED: Added geometryType and color to the arguments
  const addLayer = (name, layerInstance, type, category, isVisible, geometryType, color) => {
    layers.value.push({
      id: name,
      name,
      type,
      category,
      active: isVisible,
      layerInstance,
      // Store the new values so the sidebar can use them
      geometryType: geometryType || 'unknown', 
      color: color || '#3388ff'
    });
  };

  const toggleLayer = (index) => {
    const layer = layers.value[index];
    if (!layer) return;

    const mapStore = useMapStore();
    const map = mapStore.getMap();

    if (!map) {
      console.error("Map not initialized yet!");
      return;
    }

    if (layer.category === 'base') {
      if (layer.active) return;

      layers.value.forEach(l => {
        if (l.category === 'base' && l.active) {
          l.active = false;
          map.removeLayer(l.layerInstance);
        }
      });

      layer.active = true;
      map.addLayer(layer.layerInstance);
    } 
    else {
      layer.active = !layer.active;
      if (layer.active) {
        map.addLayer(layer.layerInstance);
      } else {
        map.removeLayer(layer.layerInstance);
      }
    }
  };

  // --- GETTERS ---
  const baseLayers = computed(() => layers.value.filter(l => l.category === 'base'));
  const overlayLayers = computed(() => layers.value.filter(l => l.category === 'overlay'));

  return {
    layers,
    baseLayers,
    overlayLayers,
    addLayer,
    toggleLayer
  };
});