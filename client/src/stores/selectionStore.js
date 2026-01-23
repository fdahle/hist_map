import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useSelectionStore = defineStore('selection', () => {
  const selectedFeature = ref(null);

  // We save the WHOLE feature so the sidebar can display attributes
  function selectFeature(feature) {
    // If clicking the same thing twice, maybe deselect it? (Optional)
    if (selectedFeature.value && selectedFeature.value.properties.id === feature.properties.id) {
      // selectedFeature.value = null; // Uncomment if you want toggle behavior
    } else {
      selectedFeature.value = feature;
    }
  }

  function clearSelection() {
    selectedFeature.value = null;
  }

  return { selectedFeature, selectFeature, clearSelection };
});