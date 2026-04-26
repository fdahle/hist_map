<template>
  <div
    v-if="isVisible"
    ref="modalRef"
    class="volume-modal"
    :style="modalStyle"
    @mousedown="startDrag"
  >
    <div class="modal-header">
      <h3>
        <span v-html="ICON_VOLUME"></span>
        Volume Calculation
      </h3>
      <button @click="$emit('close')" class="header-btn" title="Close">
        <span v-html="ICON_CLOSE"></span>
      </button>
    </div>

    <div class="modal-body">
      <!-- DEM source selector -->
      <div class="source-row">
        <span class="source-label">DEM source</span>
        <select
          v-model="internalLayerId"
          :disabled="!hasSingleBandLayers || isLoading"
          class="layer-select"
          :class="{ 'select-disabled': !hasSingleBandLayers }"
        >
          <option v-if="!hasSingleBandLayers" disabled value="">
            — No single-band raster available —
          </option>
          <option
            v-for="l in singleBandLayers"
            :key="l._layerId"
            :value="l._layerId"
          >{{ l.name }}</option>
        </select>
      </div>

      <div v-if="!hasSingleBandLayers" class="no-layer-hint">
        Drop a single-band GeoTIFF (DEM / elevation raster) onto the map to enable this tool.
      </div>

      <!-- Baseline options -->
      <div v-if="hasSingleBandLayers" class="baseline-section">
        <span class="section-label">Baseline elevation</span>
        <div class="baseline-options">
          <label class="radio-label">
            <input type="radio" v-model="baselineMode" value="mean" /> Mean of polygon
          </label>
          <label class="radio-label">
            <input type="radio" v-model="baselineMode" value="min" /> Min of polygon
          </label>
          <label class="radio-label">
            <input type="radio" v-model="baselineMode" value="custom" /> Custom
          </label>
        </div>
        <div v-if="baselineMode === 'custom'" class="custom-baseline-row">
          <input
            v-model.number="customBaseline"
            type="number"
            step="any"
            placeholder="e.g. 150.0"
            class="baseline-input"
          />
          <span class="baseline-unit">m</span>
        </div>
      </div>

      <!-- Draw / cancel / finish buttons -->
      <div v-if="hasSingleBandLayers" class="draw-row">
        <button
          class="draw-btn"
          :class="{ active: isDrawing, 'btn-disabled': !internalLayerId || isLoading || customBaselineInvalid }"
          :disabled="!internalLayerId || isLoading || customBaselineInvalid"
          @click="emitToggleDraw"
          title="Draw a polygon on the map"
        >
          <span class="btn-icon" v-html="isDrawing ? ICON_CLOSE : ICON_POLYGON"></span>
          {{ isDrawing ? 'Cancel drawing' : 'Draw polygon' }}
        </button>
        <button
          v-if="isDrawing"
          class="finish-btn"
          @click="$emit('finish-draw')"
          title="Close the polygon and compute"
        >
          <span class="btn-icon" v-html="ICON_CHECK"></span>
          Finish
        </button>
      </div>

      <!-- Loading -->
      <div v-if="isLoading" class="loading-row">
        <div class="spinner"></div>
        <span>Computing volume…</span>
      </div>

      <!-- Results -->
      <template v-else-if="hasResult">
        <div class="results-grid">
          <div class="result-card result-card--fill">
            <span class="result-label">Fill (above baseline)</span>
            <span class="result-value">{{ fmtVol(volumeData.fillVolume) }}</span>
          </div>
          <div class="result-card result-card--cut">
            <span class="result-label">Cut (below baseline)</span>
            <span class="result-value">{{ fmtVol(volumeData.cutVolume) }}</span>
          </div>
          <div class="result-card result-card--net">
            <span class="result-label">Net volume</span>
            <span class="result-value">{{ fmtVol(volumeData.netVolume) }}</span>
          </div>
          <div class="result-card">
            <span class="result-label">Sampled area</span>
            <span class="result-value">{{ fmtArea(volumeData.area) }}</span>
          </div>
        </div>
        <div class="baseline-info">
          Baseline: {{ volumeData.baseline != null ? volumeData.baseline.toFixed(2) + ' m' : '—' }}
          &nbsp;·&nbsp; {{ volumeData.cellCount.toLocaleString() }} pixels sampled
        </div>
        <button class="reset-btn" @click="$emit('reset-result')">
          <span v-html="ICON_RESET"></span> Reset
        </button>
      </template>

      <!-- Empty state -->
      <div v-else-if="!isDrawing && !isLoading && hasSingleBandLayers" class="empty-state">
        Select a DEM, set a baseline, and draw a polygon on the map to calculate cut/fill volumes.
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import { useModalDrag } from '@/composables/useModalDrag';
import { storeToRefs } from 'pinia';
import { useLayerStore } from '@/stores/map/layerStore';
import { ICON_CLOSE } from '@/constants/icons';

const ICON_VOLUME = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3L2 8l10 5 10-5-10-5z"/><path d="M2 16l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>`;
const ICON_POLYGON = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 3 21 9 17 20 7 20 3 9"/></svg>`;
const ICON_CHECK = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
const ICON_RESET = `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.51"/></svg>`;

const props = defineProps({
  isVisible:   { type: Boolean, default: false },
  isDrawing:   { type: Boolean, default: false },
  isLoading:   { type: Boolean, default: false },
  volumeData:  { type: Object,  default: null  },
});
const emit = defineEmits(['close', 'toggle-draw', 'finish-draw', 'reset-result']);

const layerStore = useLayerStore();
const { layers } = storeToRefs(layerStore);

const internalLayerId = ref(null);
const baselineMode = ref('mean');
const customBaseline = ref(0);

const singleBandLayers = computed(() =>
  layers.value.filter(l => l.type === 'geotiff' && l.metadata?.bands === 1)
);
const hasSingleBandLayers = computed(() => singleBandLayers.value.length > 0);

watch(singleBandLayers, (list) => {
  if (list.length && !list.find(l => l._layerId === internalLayerId.value)) {
    internalLayerId.value = list[0]._layerId;
  } else if (list.length === 0) {
    internalLayerId.value = null;
  }
}, { immediate: true });

watch(internalLayerId, (newId, oldId) => {
  if (oldId !== null && newId !== oldId) emit('reset-result');
});

const customBaselineInvalid = computed(() =>
  baselineMode.value === 'custom' && !isFinite(customBaseline.value)
);

const hasResult = computed(() => props.volumeData != null);

const emitToggleDraw = () => {
  const baseline = baselineMode.value === 'custom' ? Number(customBaseline.value) : undefined;
  emit('toggle-draw', internalLayerId.value, baselineMode.value, baseline);
};

function fmtVol(v) {
  if (v == null || !isFinite(v)) return '—';
  if (Math.abs(v) >= 1000) return (v / 1000).toFixed(2) + ' km³';
  if (Math.abs(v) >= 1) return v.toFixed(2) + ' m³';
  return (v * 1000).toFixed(1) + ' L';
}

function fmtArea(v) {
  if (v == null || !isFinite(v)) return '—';
  if (v >= 10000) return (v / 10000).toFixed(2) + ' ha';
  return v.toFixed(1) + ' m²';
}

const modalRef = ref(null);
const { modalStyle, startDrag } = useModalDrag(modalRef, { initialX: window.innerWidth - 360, initialY: 80 });
</script>

<style scoped>
.volume-modal {
  position: fixed;
  width: 310px;
  background: rgba(30, 30, 30, 0.95);
  border: 1px solid #444;
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.6);
  color: #e0e0e0;
  font-family: 'Segoe UI', sans-serif;
  display: flex;
  flex-direction: column;
  z-index: 4000;
  backdrop-filter: blur(10px);
}
.theme-light .volume-modal {
  background: rgba(255, 255, 255, 0.97);
  border: 1px solid #ccc;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
  color: #333;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  border-bottom: 1px solid #444;
  background: rgba(40, 40, 40, 0.8);
  border-radius: 8px 8px 0 0;
  cursor: move;
  user-select: none;
}
.theme-light .modal-header {
  border-bottom: 1px solid #ddd;
  background: rgba(248, 249, 250, 0.95);
}
.modal-header h3 {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 7px;
  color: #fff;
}
.theme-light .modal-header h3 { color: #333; }
.modal-header h3 :deep(svg) { stroke: #a855f7; }

.header-btn {
  background: none;
  border: none;
  color: #aaa;
  cursor: pointer;
  padding: 3px;
  display: flex;
  align-items: center;
  border-radius: 4px;
}
.header-btn:hover { background: rgba(255,255,255,0.1); color: #fff; }
.theme-light .header-btn:hover { background: rgba(0,0,0,0.06); color: #333; }

.modal-body {
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.source-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.source-label {
  font-size: 12px;
  color: #aaa;
  white-space: nowrap;
  flex-shrink: 0;
}
.theme-light .source-label { color: #666; }
.layer-select {
  flex: 1;
  background: #1e1e1e;
  color: #e0e0e0;
  border: 1px solid #555;
  border-radius: 4px;
  padding: 4px 6px;
  font-size: 12px;
  cursor: pointer;
  min-width: 0;
}
.theme-light .layer-select { background: #fff; color: #333; border-color: #ccc; }
.layer-select:disabled, .select-disabled { opacity: 0.5; cursor: not-allowed; }

.no-layer-hint {
  font-size: 11px;
  color: #888;
  font-style: italic;
  line-height: 1.4;
}

/* Baseline */
.baseline-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
  background: rgba(255,255,255,0.03);
  border: 1px solid #3a3a3a;
  border-radius: 5px;
  padding: 8px 10px;
}
.theme-light .baseline-section { background: rgba(0,0,0,0.03); border-color: #e0e0e0; }
.section-label {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: #888;
}
.theme-light .section-label { color: #999; }
.baseline-options {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}
.radio-label {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  cursor: pointer;
  color: #ccc;
}
.theme-light .radio-label { color: #555; }
.custom-baseline-row {
  display: flex;
  align-items: center;
  gap: 6px;
}
.baseline-input {
  flex: 1;
  background: #1e1e1e;
  color: #e0e0e0;
  border: 1px solid #555;
  border-radius: 4px;
  padding: 3px 6px;
  font-size: 12px;
  min-width: 0;
}
.theme-light .baseline-input { background: #fff; color: #333; border-color: #ccc; }
.baseline-input:focus { outline: none; border-color: #a855f7; }
.baseline-input::-webkit-inner-spin-button,
.baseline-input::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
.baseline-input[type=number] { -moz-appearance: textfield; }
.baseline-unit { font-size: 12px; color: #888; }

/* Draw row */
.draw-row {
  display: flex;
  gap: 6px;
  align-items: stretch;
}
.draw-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: rgba(168, 85, 247, 0.15);
  border: 1px solid rgba(168, 85, 247, 0.4);
  color: #a855f7;
  border-radius: 5px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 500;
  transition: all 0.15s;
  flex: 1;
  justify-content: center;
}
.draw-btn:hover:not(:disabled) { background: rgba(168, 85, 247, 0.25); border-color: #a855f7; }
.draw-btn.active { background: rgba(255, 80, 80, 0.15); border-color: rgba(255, 80, 80, 0.5); color: #ff6060; }
.draw-btn.active:hover:not(:disabled) { background: rgba(255, 80, 80, 0.25); }
.draw-btn.btn-disabled, .draw-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.theme-light .draw-btn {
  background: rgba(126, 34, 206, 0.08);
  border-color: rgba(126, 34, 206, 0.35);
  color: #7e22ce;
}
.theme-light .draw-btn:hover:not(:disabled) { background: rgba(126, 34, 206, 0.15); border-color: #7e22ce; }

.finish-btn {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 6px 10px;
  background: rgba(34, 197, 94, 0.15);
  border: 1px solid rgba(34, 197, 94, 0.45);
  color: #22c55e;
  border-radius: 5px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
  transition: all 0.15s;
  white-space: nowrap;
  flex-shrink: 0;
}
.finish-btn:hover { background: rgba(34, 197, 94, 0.25); border-color: #22c55e; }
.theme-light .finish-btn { background: rgba(21, 128, 61, 0.08); border-color: rgba(21, 128, 61, 0.4); color: #15803d; }
.theme-light .finish-btn:hover { background: rgba(21, 128, 61, 0.16); border-color: #15803d; }

.btn-icon { display: flex; align-items: center; }
.btn-icon :deep(svg) { width: 14px; height: 14px; }

/* Loading */
.loading-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: #aaa;
}
.spinner {
  width: 14px;
  height: 14px;
  border: 2px solid #555;
  border-top-color: #a855f7;
  border-radius: 50%;
  animation: spin 0.75s linear infinite;
  flex-shrink: 0;
}
.theme-light .spinner { border-color: #ccc; border-top-color: #7e22ce; }
@keyframes spin { to { transform: rotate(360deg); } }

/* Results */
.results-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
}
.result-card {
  background: rgba(255,255,255,0.04);
  border: 1px solid #3a3a3a;
  border-radius: 5px;
  padding: 6px 8px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.theme-light .result-card { background: rgba(0,0,0,0.03); border-color: #e0e0e0; }
.result-card--fill { border-color: rgba(34, 197, 94, 0.35); }
.result-card--cut  { border-color: rgba(239, 68, 68, 0.35); }
.result-card--net  { border-color: rgba(168, 85, 247, 0.35); }
.result-label {
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: #777;
}
.result-card--fill .result-label { color: #4ade80; }
.result-card--cut  .result-label { color: #f87171; }
.result-card--net  .result-label { color: #c084fc; }
.theme-light .result-label { color: #999; }
.result-value {
  font-size: 13px;
  font-weight: 700;
  color: #e0e0e0;
}
.theme-light .result-value { color: #222; }

.baseline-info {
  font-size: 10px;
  color: #777;
  text-align: center;
}
.theme-light .baseline-info { color: #999; }

.reset-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  padding: 5px 10px;
  background: none;
  border: 1px solid #3a3a3a;
  color: #888;
  border-radius: 4px;
  cursor: pointer;
  font-size: 11px;
  transition: all 0.15s;
}
.reset-btn:hover { border-color: #666; color: #ccc; background: rgba(255,255,255,0.05); }
.theme-light .reset-btn { border-color: #ddd; color: #888; }
.theme-light .reset-btn:hover { border-color: #aaa; color: #333; background: rgba(0,0,0,0.04); }

.empty-state {
  font-size: 12px;
  color: #666;
  text-align: center;
  line-height: 1.5;
  padding: 8px 0;
}
.theme-light .empty-state { color: #999; }
</style>
