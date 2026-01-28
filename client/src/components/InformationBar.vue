<template>
  <div class="info-bar">
    <div class="info-group projected" v-if="projectedCoords">
      <span class="label">X:</span> {{ Math.round(projectedCoords.x) }}
      <span class="label">Y:</span> {{ Math.round(projectedCoords.y) }}
    </div>
    <div class="info-group status">
      <span class="label">ZOOM:</span> {{ zoom }}
      <span class="divider">|</span>
      <span class="label">CRS:</span> {{ crsName }}
    </div>

    <div class="info-group stats">
      <span class="label">LAYERS:</span> {{ activeOverlayCount }}
    </div>
  </div>
</template>

<script setup>
import { computed } from "vue";
import { storeToRefs } from "pinia";
import { useMapStore } from "../stores/mapStore";
import { useLayerStore } from "../stores/layerStore";

const mapStore = useMapStore();
const layerStore = useLayerStore();
const { zoom, mouseCoords, projectedCoords, crsName } = storeToRefs(mapStore);

const activeOverlayCount = computed(
  () => layerStore.overlayLayers.filter((l) => l.active).length
);
</script>

<style scoped>
.info-bar {
  position: absolute;
  bottom: 0;
  left: 0;
  width: 100%;
  height: 28px;
  background: rgba(255, 255, 255, 0.9);
  border-top: 1px solid #ccc;
  z-index: 1000;
  display: flex;
  align-items: center;
  padding: 0 15px;
  font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
  font-size: 11px;
  color: #444;
  gap: 20px;
  backdrop-filter: blur(2px);
}

.info-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.label {
  font-weight: 700;
  color: #888;
}

.divider {
  color: #ddd;
}

.coords {
  min-width: 180px;
  font-family: monospace; /* Keep coords steady */
}
</style>