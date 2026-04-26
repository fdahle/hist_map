<template>
  <div
    v-if="isVisible"
    ref="modalRef"
    class="elevation-modal"
    :style="modalStyle"
    @mousedown="startDrag"
  >
    <div class="modal-header">
      <h3>
        <span v-html="ICON_ELEVATION"></span>
        Elevation Profile
      </h3>
      <div class="header-actions">
        <button
          @click.stop="showSettings = !showSettings"
          class="header-btn"
          :class="{ active: showSettings }"
          title="Settings"
        >
          <span v-html="ICON_SETTINGS"></span>
        </button>
        <button @click="$emit('close')" class="header-btn" title="Close">
          <span v-html="ICON_CLOSE"></span>
        </button>
      </div>
    </div>

    <div class="modal-body">
      <!-- Source selector -->
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

      <!-- Settings panel -->
      <div v-if="showSettings" class="settings-panel">
        <div class="settings-row">
          <label class="settings-label">No-data value</label>
          <input
            v-model="noDataInput"
            type="number"
            class="nodata-input"
            placeholder="e.g. -9999"
            step="any"
          />
          <button
            v-if="noDataInput !== ''"
            @click="noDataInput = ''"
            class="nodata-clear"
            title="Clear override"
          >✕</button>
        </div>
        <div class="settings-hint">Pixels equal to this value will be treated as missing data and excluded from the profile.</div>
      </div>

      <!-- Draw / cancel / finish buttons -->
      <div class="draw-row">
        <button
          class="draw-btn"
          :class="{ active: isDrawing, 'btn-disabled': !internalLayerId || isLoading }"
          :disabled="!internalLayerId || isLoading"
          @click="$emit('toggle-draw', internalLayerId, noDataOverride)"
          title="Click then draw a line on the map"
        >
          <span class="btn-icon" v-html="isDrawing ? ICON_CLOSE : ICON_DRAW"></span>
          {{ isDrawing ? 'Cancel drawing' : 'Draw profile line' }}
        </button>
        <button
          v-if="isDrawing"
          class="finish-btn"
          @click="$emit('finish-draw')"
          title="Finish drawing the current line"
        >
          <span class="btn-icon" v-html="ICON_CHECK"></span>
          Finish
        </button>
      </div>

      <!-- Loading -->
      <div v-if="isLoading" class="loading-row">
        <div class="spinner"></div>
        <span>Sampling elevation…</span>
      </div>

      <!-- Chart -->
      <template v-else-if="hasData">
        <div class="stats-row">
          <div class="stat">
            <span class="stat-label">Min</span>
            <span class="stat-value">{{ fmtElev(profileStats.min) }}</span>
          </div>
          <div class="stat">
            <span class="stat-label">Max</span>
            <span class="stat-value">{{ fmtElev(profileStats.max) }}</span>
          </div>
          <div class="stat">
            <span class="stat-label">Avg</span>
            <span class="stat-value">{{ fmtElev(profileStats.avg) }}</span>
          </div>
          <div class="stat">
            <span class="stat-label">Length</span>
            <span class="stat-value">{{ fmtDist(profileData.totalLength) }}</span>
          </div>
        </div>

        <!-- Chart wrapper: y-labels left, SVG + x-labels right -->
        <div class="chart-wrapper">
          <div class="y-axis">
            <div
              v-for="tick in yTicks"
              :key="tick.value"
              class="y-tick"
              :style="{ bottom: tick.pct + '%' }"
            >{{ tick.label }}</div>
          </div>
          <div class="chart-area">
            <svg
              class="elevation-svg"
              viewBox="0 0 400 100"
              preserveAspectRatio="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <defs>
                <linearGradient id="elevGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stop-color="var(--chart-color)" stop-opacity="0.55" />
                  <stop offset="100%" stop-color="var(--chart-color)" stop-opacity="0.05" />
                </linearGradient>
              </defs>

              <!-- Horizontal grid lines -->
              <line
                v-for="tick in yTicks"
                :key="'g' + tick.value"
                x1="0" :y1="tick.svgY" x2="400" :y2="tick.svgY"
                class="grid-line"
              />

              <!-- Fill area under profile -->
              <path :d="fillPath" class="chart-fill" />

              <!-- Profile line -->
              <path :d="linePath" class="chart-line" />
            </svg>

            <!-- Hover crosshair (vertical line over SVG) -->
            <div
              v-if="hoverInfo"
              class="hover-crosshair"
              :style="{ left: `${hoverInfo.fraction * 100}%` }"
            ></div>

            <!-- Hover dot at the elevation value -->
            <div
              v-if="hoverInfo && hoverInfo.svgY !== null"
              class="hover-dot"
              :style="{ left: `${hoverInfo.fraction * 100}%`, top: `${hoverInfo.svgY / 100 * 90}px` }"
            ></div>

            <!-- Hover elevation label -->
            <div
              v-if="hoverInfo"
              class="hover-label"
              :style="{ left: `${hoverInfo.fraction * 100}%` }"
            >{{ fmtElev(hoverInfo.elevation) }}</div>

            <!-- Transparent mouse-capture overlay (sits over the SVG) -->
            <div
              class="chart-hover-overlay"
              @mousemove="onChartMouseMove"
              @mouseleave="onChartMouseLeave"
            ></div>

            <div class="x-axis">
              <span>0</span>
              <span>{{ fmtDist(profileData.totalLength / 2) }}</span>
              <span>{{ fmtDist(profileData.totalLength) }}</span>
            </div>
          </div>
        </div>
      </template>

      <!-- All-NaN: profile was computed but line is entirely outside the DEM -->
      <div v-else-if="allNaN && !isDrawing && !isLoading" class="out-of-bounds-hint">
        The drawn line is outside the DEM coverage area. Try drawing within the raster bounds.
      </div>

      <!-- Empty state -->
      <div v-else-if="!isDrawing && !isLoading" class="empty-state">
        Select a source and draw a line on the map to generate an elevation profile.
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onUnmounted } from 'vue';
import { useModalDrag } from '@/composables/useModalDrag';
import { storeToRefs } from 'pinia';
import { useLayerStore } from '@/stores/map/layerStore';
import { ICON_CLOSE } from '@/constants/icons';

const ICON_ELEVATION = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 17 7 10 11 14 15 7 21 17"/><line x1="3" y1="20" x2="21" y2="20"/></svg>`;
const ICON_DRAW = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17L9 11L13 15L20 7"/><circle cx="3" cy="17" r="1.5" fill="currentColor"/><circle cx="20" cy="7" r="1.5" fill="currentColor"/></svg>`;
const ICON_CHECK = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;const ICON_SETTINGS = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`;

const props = defineProps({
  isVisible:   { type: Boolean, default: false },
  isDrawing:   { type: Boolean, default: false },
  isLoading:   { type: Boolean, default: false },
  profileData: { type: Object,  default: null  },
});
const emit = defineEmits(['close', 'toggle-draw', 'finish-draw', 'hover-profile', 'reset-profile']);

const layerStore = useLayerStore();
const { layers } = storeToRefs(layerStore);

// Internal layer selection (emitted via toggle-draw)
const internalLayerId = ref(null);

// Settings panel
const showSettings = ref(false);
const noDataInput = ref('');
const noDataOverride = computed(() => {
  const v = noDataInput.value.trim();
  if (v === '') return undefined;
  const n = parseFloat(v);
  return isFinite(n) ? n : undefined;
});

// Only single-band raster layers
const singleBandLayers = computed(() =>
  layers.value.filter(l => l.type === 'geotiff' && l.metadata?.bands === 1)
);
const hasSingleBandLayers = computed(() => singleBandLayers.value.length > 0);

// Auto-select the first available layer
watch(singleBandLayers, (list) => {
  if (list.length && !list.find(l => l._layerId === internalLayerId.value)) {
    internalLayerId.value = list[0]._layerId;
  } else if (list.length === 0) {
    internalLayerId.value = null;
  }
}, { immediate: true });

// Reset the profile when the user switches DEM source.
watch(internalLayerId, (newId, oldId) => {
  if (oldId !== null && newId !== oldId) {
    emit('reset-profile');
  }
});

// ── Chart computations ───────────────────────────────────────────────────────
const hasData = computed(() =>
  props.profileData?.elevations?.some(v => isFinite(v))
);

// Profile was computed but every sample is NaN (line is outside DEM coverage).
const allNaN = computed(() =>
  props.profileData?.elevations != null && !hasData.value
);

const profileStats = computed(() => {
  if (!hasData.value) return { min: 0, max: 0, avg: 0 };
  const valid = props.profileData.elevations.filter(v => isFinite(v));
  const min = Math.min(...valid);
  const max = Math.max(...valid);
  const avg = valid.reduce((s, v) => s + v, 0) / valid.length;
  return { min, max, avg };
});

// Chart Y range with 5% padding
const chartRange = computed(() => {
  const { min, max } = profileStats.value;
  const pad = (max - min) * 0.05 || 1;
  return { min: min - pad, max: max + pad };
});

// Convert elevation to SVG Y coordinate (viewBox height = 100)
const elevToSvgY = (elev) => {
  const { min, max } = chartRange.value;
  return 100 - ((elev - min) / (max - min)) * 100;
};

// Convert sample index to SVG X coordinate (viewBox width = 400)
const idxToSvgX = (i, total) => (i / Math.max(1, total - 1)) * 400;

// Build the profile <path d="..."> handling gaps (NaN / out-of-extent points)
const linePath = computed(() => {
  if (!hasData.value) return '';
  const elevs = props.profileData.elevations;
  let d = '';
  let penDown = false;
  for (let i = 0; i < elevs.length; i++) {
    const e = elevs[i];
    if (!isFinite(e)) { penDown = false; continue; }
    const x = idxToSvgX(i, elevs.length);
    const y = elevToSvgY(e);
    d += penDown ? `L${x.toFixed(1)},${y.toFixed(1)}` : `M${x.toFixed(1)},${y.toFixed(1)}`;
    penDown = true;
  }
  return d;
});

// Build the gradient fill – one polygon per continuous segment
const fillPath = computed(() => {
  if (!hasData.value) return '';
  const elevs = props.profileData.elevations;
  let d = '';
  let segStart = null;
  let segPoints = [];

  const closeSeg = () => {
    if (segPoints.length < 2) { segPoints = []; segStart = null; return; }
    const lastX = segPoints[segPoints.length - 1].x;
    d += `M${segPoints[0].x.toFixed(1)},100 `;
    for (const { x, y } of segPoints) d += `L${x.toFixed(1)},${y.toFixed(1)} `;
    d += `L${lastX.toFixed(1)},100 Z `;
    segPoints = [];
    segStart = null;
  };

  for (let i = 0; i < elevs.length; i++) {
    const e = elevs[i];
    if (!isFinite(e)) { closeSeg(); continue; }
    segPoints.push({ x: idxToSvgX(i, elevs.length), y: elevToSvgY(e) });
  }
  closeSeg();
  return d;
});

// Y-axis tick marks
const yTicks = computed(() => {
  if (!hasData.value) return [];
  const { min, max } = chartRange.value;
  const { min: dataMin, max: dataMax } = profileStats.value;
  const range = dataMax - dataMin;
  const approxStep = range / 4;
  const step = niceStep(approxStep);
  const ticks = [];
  const start = Math.ceil(dataMin / step) * step;
  for (let v = start; v <= dataMax + step * 0.01; v += step) {
    if (v < min || v > max) continue;
    const pct = ((v - min) / (max - min)) * 100;
    const svgY = 100 - pct;
    ticks.push({ value: v, label: fmtElev(v), pct, svgY });
  }
  return ticks;
});

function niceStep(approx) {
  if (!approx || approx <= 0) return 1;
  const exp = Math.floor(Math.log10(approx));
  const frac = approx / Math.pow(10, exp);
  const nice = frac < 1.5 ? 1 : frac < 3.5 ? 2 : frac < 7.5 ? 5 : 10;
  return nice * Math.pow(10, exp);
}

// ── Formatters ────────────────────────────────────────────────────────────────
function fmtElev(v) {
  if (v == null || !isFinite(v)) return '—';
  return Math.abs(v) >= 1000
    ? v.toFixed(0) + ' m'
    : v.toFixed(1) + ' m';
}
function fmtDist(m) {
  if (m == null || !isFinite(m)) return '—';
  return m >= 1000 ? (m / 1000).toFixed(2) + ' km' : Math.round(m) + ' m';
}

// ── Dragging ─────────────────────────────────────────────────────────────────
const modalRef = ref(null);
const { modalStyle, startDrag } = useModalDrag(modalRef, { initialX: window.innerWidth - 340, initialY: 80 });

// ── Chart hover ──────────────────────────────────────────────────────────────
const hoverInfo = ref(null);

const onChartMouseMove = (evt) => {
  if (!hasData.value) return;
  const rect = evt.currentTarget.getBoundingClientRect();
  const fraction = Math.max(0, Math.min(1, (evt.clientX - rect.left) / rect.width));
  const elevs = props.profileData.elevations;
  const idx = Math.round(fraction * (elevs.length - 1));
  const elevation = elevs[idx];
  const svgY = isFinite(elevation) ? elevToSvgY(elevation) : null;
  const distance = fraction * props.profileData.totalLength;
  hoverInfo.value = { fraction, elevation, svgY, distance };
  emit('hover-profile', fraction);
};

const onChartMouseLeave = () => {
  hoverInfo.value = null;
  emit('hover-profile', null);
};
</script>

<style scoped>
.elevation-modal {
  position: fixed;
  width: 320px;
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
  --chart-color: #4a9eff;
}

.theme-light .elevation-modal {
  background: rgba(255, 255, 255, 0.97);
  border: 1px solid #ccc;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
  color: #333;
  --chart-color: #2563eb;
}

/* ── Header ── */
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
.modal-header h3 :deep(svg) { stroke: #4a9eff; }
.theme-light .modal-header h3 :deep(svg) { stroke: #2563eb; }

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
.header-btn.active { background: rgba(74,158,255,0.18); color: #4a9eff; }
.theme-light .header-btn.active { background: rgba(37,99,235,0.1); color: #2563eb; }

.header-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

/* ── Body ── */
.modal-body {
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

/* ── Source row ── */
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
.theme-light .layer-select {
  background: #fff;
  color: #333;
  border-color: #ccc;
}
.layer-select:disabled, .select-disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.no-layer-hint {
  font-size: 11px;
  color: #888;
  font-style: italic;
  line-height: 1.4;
}
.theme-light .no-layer-hint { color: #888; }

/* ── Settings panel ── */
.settings-panel {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid #3a3a3a;
  border-radius: 5px;
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.theme-light .settings-panel {
  background: rgba(0, 0, 0, 0.03);
  border-color: #e0e0e0;
}
.settings-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.settings-label {
  font-size: 12px;
  color: #aaa;
  white-space: nowrap;
  flex-shrink: 0;
}
.theme-light .settings-label { color: #666; }
.nodata-input {
  flex: 1;
  background: #1e1e1e;
  color: #e0e0e0;
  border: 1px solid #555;
  border-radius: 4px;
  padding: 3px 6px;
  font-size: 12px;
  min-width: 0;
}
.theme-light .nodata-input {
  background: #fff;
  color: #333;
  border-color: #ccc;
}
.nodata-input:focus { outline: none; border-color: #4a9eff; }
.theme-light .nodata-input:focus { border-color: #2563eb; }
.nodata-input::-webkit-inner-spin-button,
.nodata-input::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
.nodata-input[type=number] { -moz-appearance: textfield; }
.nodata-clear {
  background: none;
  border: none;
  color: #666;
  cursor: pointer;
  font-size: 11px;
  padding: 2px 4px;
  border-radius: 3px;
  line-height: 1;
  flex-shrink: 0;
}
.nodata-clear:hover { background: rgba(255,255,255,0.08); color: #ccc; }
.theme-light .nodata-clear:hover { background: rgba(0,0,0,0.06); color: #333; }
.settings-hint {
  font-size: 10px;
  color: #666;
  font-style: italic;
  line-height: 1.3;
}
.theme-light .settings-hint { color: #999; }

/* ── Draw row + buttons ── */
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
  background: rgba(74, 158, 255, 0.15);
  border: 1px solid rgba(74, 158, 255, 0.4);
  color: #4a9eff;
  border-radius: 5px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 500;
  transition: all 0.15s;
  flex: 1;
  justify-content: center;
}
.draw-btn:hover:not(:disabled) {
  background: rgba(74, 158, 255, 0.25);
  border-color: #4a9eff;
}
.draw-btn.active {
  background: rgba(255, 80, 80, 0.15);
  border-color: rgba(255, 80, 80, 0.5);
  color: #ff6060;
}
.draw-btn.active:hover:not(:disabled) {
  background: rgba(255, 80, 80, 0.25);
}
.draw-btn.btn-disabled, .draw-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.theme-light .draw-btn {
  background: rgba(37, 99, 235, 0.08);
  border-color: rgba(37, 99, 235, 0.35);
  color: #2563eb;
}
.theme-light .draw-btn:hover:not(:disabled) {
  background: rgba(37, 99, 235, 0.15);
  border-color: #2563eb;
}

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
.finish-btn:hover {
  background: rgba(34, 197, 94, 0.25);
  border-color: #22c55e;
}
.theme-light .finish-btn {
  background: rgba(21, 128, 61, 0.08);
  border-color: rgba(21, 128, 61, 0.4);
  color: #15803d;
}
.theme-light .finish-btn:hover {
  background: rgba(21, 128, 61, 0.16);
  border-color: #15803d;
}

.btn-icon { display: flex; align-items: center; }
.btn-icon :deep(svg) { width: 14px; height: 14px; }

/* ── Loading ── */
.loading-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: #aaa;
}
.theme-light .loading-row { color: #666; }
.spinner {
  width: 14px;
  height: 14px;
  border: 2px solid #555;
  border-top-color: #4a9eff;
  border-radius: 50%;
  animation: spin 0.75s linear infinite;
  flex-shrink: 0;
}
.theme-light .spinner { border-color: #ccc; border-top-color: #2563eb; }
@keyframes spin { to { transform: rotate(360deg); } }

/* ── Stats ── */
.stats-row {
  display: flex;
  justify-content: space-between;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid #3a3a3a;
  border-radius: 5px;
  padding: 6px 8px;
}
.theme-light .stats-row {
  background: rgba(0, 0, 0, 0.03);
  border-color: #e0e0e0;
}
.stat { display: flex; flex-direction: column; align-items: center; gap: 1px; }
.stat-label { font-size: 9px; text-transform: uppercase; letter-spacing: 0.5px; color: #777; }
.stat-value { font-size: 11px; font-weight: 600; color: #e0e0e0; }
.theme-light .stat-label { color: #999; }
.theme-light .stat-value { color: #222; }

/* ── Chart ── */
.chart-wrapper {
  display: flex;
  gap: 4px;
}
.y-axis {
  position: relative;
  width: 36px;
  flex-shrink: 0;
  /* height is set to match the SVG + x-axis */
  height: 106px; /* 90px svg + 16px x-axis */
}
.y-tick {
  position: absolute;
  right: 2px;
  font-size: 9px;
  color: #666;
  transform: translateY(50%);
  white-space: nowrap;
  text-align: right;
  /* bottom is set via inline style as percentage of SVG area (90px) */
  /* We need to offset to align with SVG, not full container */
}
.theme-light .y-tick { color: #999; }
.chart-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  position: relative;
}
.elevation-svg {
  width: 100%;
  height: 90px;
  border: 1px solid #3a3a3a;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.2);
  display: block;
}
.theme-light .elevation-svg {
  border-color: #ddd;
  background: rgba(0, 0, 0, 0.02);
}
.chart-fill {
  fill: url(#elevGrad);
}
.chart-line {
  fill: none;
  stroke: var(--chart-color);
  stroke-width: 1.5;
  stroke-linejoin: round;
  stroke-linecap: round;
}
.grid-line {
  stroke: #3a3a3a;
  stroke-width: 0.5;
}
.theme-light .grid-line { stroke: #e0e0e0; }
.x-axis {
  display: flex;
  justify-content: space-between;
  font-size: 9px;
  color: #666;
  padding: 0 1px;
  height: 14px;
}
.theme-light .x-axis { color: #999; }

/* ── Empty state ── */
.empty-state {
  font-size: 12px;
  color: #666;
  text-align: center;
  line-height: 1.5;
  padding: 8px 0;
}
.theme-light .empty-state { color: #999; }

/* ── Out-of-bounds hint ── */
.out-of-bounds-hint {
  font-size: 12px;
  color: #f59e0b;
  background: rgba(245, 158, 11, 0.08);
  border: 1px solid rgba(245, 158, 11, 0.3);
  border-radius: 5px;
  padding: 8px 10px;
  line-height: 1.5;
  text-align: center;
}
.theme-light .out-of-bounds-hint {
  color: #b45309;
  background: rgba(245, 158, 11, 0.06);
  border-color: rgba(180, 83, 9, 0.25);
}

/* ── Hover interaction ── */
.chart-hover-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 90px;
  cursor: crosshair;
  z-index: 3;
}
.hover-crosshair {
  position: absolute;
  width: 1px;
  top: 0;
  height: 90px;
  background: rgba(255, 255, 255, 0.35);
  pointer-events: none;
  z-index: 4;
  transform: translateX(-50%);
}
.theme-light .hover-crosshair { background: rgba(0, 0, 0, 0.25); }
.hover-dot {
  position: absolute;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--chart-color);
  border: 2px solid #fff;
  transform: translate(-50%, -50%);
  pointer-events: none;
  z-index: 5;
}
.hover-label {
  position: absolute;
  top: 4px;
  transform: translateX(-50%);
  background: var(--chart-color);
  color: #fff;
  font-size: 9px;
  font-weight: 700;
  padding: 1px 5px;
  border-radius: 10px;
  white-space: nowrap;
  pointer-events: none;
  z-index: 6;
  line-height: 1.6;
}
</style>
