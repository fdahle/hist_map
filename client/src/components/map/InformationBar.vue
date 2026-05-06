<template>
  <div class="info-bar">
    <!-- Projected coords (left) -->
    <div class="info-group" v-if="projectedCoords">
      <span class="label">X:</span> {{ Math.round(projectedCoords.x) }}
      <span class="label">Y:</span> {{ Math.round(projectedCoords.y) }}
    </div>

    <!-- Zoom level -->
    <div class="info-group">
      <span class="label">ZOOM:</span> {{ zoom }}
    </div>

    <!-- Scale (approximate) -->
    <div class="info-group" v-if="scaleText">
      <span class="label">SCALE:</span> {{ scaleText }}
    </div>

    <!-- Selected features -->
    <div class="info-group" v-if="selectedCount > 0">
      <span class="label">SEL:</span> {{ selectedCount }} feature{{ selectedCount !== 1 ? 's' : '' }}
    </div>

    <!-- Spacer pushes CRS to the right -->
    <div class="spacer"></div>

    <!-- CRS (right) -->
    <div class="info-group crs-group">
      <span class="label">CRS:</span> {{ crsName }}
    </div>
  </div>
</template>

<script setup>
import { computed } from "vue";
import { storeToRefs } from "pinia";
import { useMapStore } from "../../stores/map/mapStore";
import { useSelectionStore } from "../../stores/map/selectionStore";

const mapStore = useMapStore();
const selectionStore = useSelectionStore();
const { zoom, projectedCoords, crsName } = storeToRefs(mapStore);

const selectedCount = computed(() => selectionStore.selectedFeatures.length);

// Approximate map scale based on zoom (1 tile pixel ~ 256px at 96dpi)
const scaleText = computed(() => {
  const z = zoom.value;
  if (!z) return null;
  // Ground resolution at equator for Web Mercator: 156543m/pixel at zoom 0
  const metersPerPixel = 156543.03392 / Math.pow(2, z);
  const screenDpi = 96;
  const inchesPerMeter = 39.3701;
  const scale = Math.round(metersPerPixel * screenDpi * inchesPerMeter);
  if (!isFinite(scale) || scale <= 0) return null;
  if (scale >= 1000000) return `1:${(scale / 1000000).toFixed(1)}M`;
  if (scale >= 1000) return `1:${(scale / 1000).toFixed(0)}k`;
  return `1:${scale}`;
});
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
  gap: 16px;
  backdrop-filter: blur(2px);
  box-sizing: border-box;
}

.theme-dark .info-bar {
  background: rgba(42, 42, 42, 0.9);
  border-top: 1px solid #444;
  color: #ccc;
}

.info-group {
  display: flex;
  align-items: center;
  gap: 5px;
  white-space: nowrap;
  flex-shrink: 0;
}

.spacer {
  flex: 1;
}

.crs-group {
  color: #555;
  font-family: monospace;
  font-size: 10.5px;
}

.theme-dark .crs-group {
  color: #aaa;
}

.label {
  font-weight: 700;
  color: #888;
}

.theme-dark .label {
  color: #666;
}
</style>