import { defineStore } from "pinia";
import { ref } from "vue";

export const useSelectionStore = defineStore("selection", () => {
  const selectedFeature = ref(null);

  // We save the WHOLE feature so the sidebar can display attributes
  function selectFeature(feature) {
    if (
      selectedFeature.value &&
      selectedFeature.value.properties._featureId === feature.properties._featureId
    ) {
      // If clicking the same thing twice, deselect it
      selectedFeature.value = null;
    } else {
      selectedFeature.value = feature;
    }
  }

  function clearSelection() {
    selectedFeature.value = null;
  }

  return { selectedFeature, selectFeature, clearSelection };
});
