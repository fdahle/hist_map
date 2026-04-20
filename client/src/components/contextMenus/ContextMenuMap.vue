<template>
  <div v-if="visible">
    <div class="overlay" @click="close"></div>

    <div
      class="context-menu"
      :style="{ top: `${y}px`, left: `${x}px` }"
      @click.stop
    >
      <!-- Normal menu -->
      <ul v-if="!pinLabelMode">
        <li @click="handleCopyCoordinates">📋 Copy Coordinates</li>
        <li @click="handleInspectPoint">🔍 Inspect Point</li>
        <template v-if="props.isPinsOpen">
          <li class="menu-separator"></li>
          <li @click="enterPinLabelMode">📌 Place Pin…</li>
        </template>
      </ul>

      <!-- Pin label input -->
      <div v-else class="pin-label-form">
        <div class="pin-label-title">📌 New Pin</div>
        <input
          ref="pinLabelInputRef"
          v-model="pinLabelValue"
          class="pin-label-input"
          placeholder="Label (e.g. GCP #3)"
          maxlength="80"
          @keydown.enter="confirmPin"
          @keydown.escape="close"
        />
        <div class="pin-label-actions">
          <button class="pin-btn pin-btn-primary" @click="confirmPin">Add</button>
          <button class="pin-btn pin-btn-secondary" @click="close">Cancel</button>
        </div>
      </div>
    </div>
  </div>

  <!-- Point Inspection Modal -->
  <Teleport to="body">
    <div v-if="inspectVisible" class="pi-backdrop" @click.self="inspectVisible = false">
      <div class="pi-modal">
        <div class="pi-header">
          <span class="pi-header-icon">🔍</span>
          <h3 class="pi-title">Point Inspection</h3>
          <button class="pi-close" @click="inspectVisible = false">✕</button>
        </div>

        <div class="pi-coords" v-if="coordinate">
          X: {{ coordinate[0].toFixed(2) }} &nbsp; Y: {{ coordinate[1].toFixed(2) }}
        </div>

        <div class="pi-body">
          <div v-if="isInspecting" class="pi-loading">
            <span class="pi-spinner"></span> Reading layers…
          </div>

          <div v-else-if="inspectResults.length === 0" class="pi-empty">
            No active overlay layers found at this point.
          </div>

          <div v-else>
            <div v-for="result in inspectResults" :key="result.layerId" class="pi-layer">
              <div class="pi-layer-header">
                <span class="pi-layer-icon">{{ result.type === 'geotiff' ? '🗺️' : '📐' }}</span>
                <span class="pi-layer-name">{{ result.name }}</span>
              </div>

              <!-- Raster -->
              <template v-if="result.type === 'geotiff'">
                <div v-if="result.noData" class="pi-nodata">NoData pixel</div>
                <div v-else-if="result.values.length === 0" class="pi-nodata">Outside rendered extent</div>
                <table v-else class="pi-table">
                  <tr v-for="(v, i) in result.values" :key="i">
                    <td class="pi-k">Band {{ i + 1 }}</td>
                    <td class="pi-v">{{ v }}</td>
                  </tr>
                  <tr v-if="result.unit">
                    <td class="pi-k">Unit</td>
                    <td class="pi-v">{{ result.unit }}</td>
                  </tr>
                </table>
              </template>

              <!-- Vector -->
              <template v-else>
                <div v-if="result.features.length === 0" class="pi-nodata">No features at this point</div>
                <div v-else class="pi-nodata">{{ result.features.length }} feature{{ result.features.length !== 1 ? 's' : '' }} found</div>
              </template>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, nextTick } from "vue";
import { storeToRefs } from "pinia";
import { logger } from "../../utils/logger";
import { useMapStore } from "../../stores/map/mapStore";
import { useLayerStore } from "../../stores/map/layerStore";
import { usePinStore } from "../../stores/map/pinStore";
import { LAYER_STATUS, LAYER_CATEGORY } from "../../constants/layerConstants";
import { fromBlob, fromUrl } from "geotiff";
import { transform as olTransform, get as getOlProjection } from "ol/proj";

const mapStore = useMapStore();
const layerStore = useLayerStore();
const { layers } = storeToRefs(layerStore);

const visible = ref(false);
const x = ref(0);
const y = ref(0);
const coordinate = ref(null);
const olPixel = ref(null); // [px, py] in map viewport pixels

// Inspection modal state
const inspectVisible = ref(false);
const isInspecting = ref(false);
const inspectResults = ref([]);

const props = defineProps({
  isPinsOpen: { type: Boolean, default: false },
});

const emit = defineEmits(["action"]);

const pinStore = usePinStore();
const pinLabelMode = ref(false);
const pinLabelValue = ref('');
const pinLabelInputRef = ref(null);

const enterPinLabelMode = () => {
  pinLabelMode.value = true;
  pinLabelValue.value = '';
  nextTick(() => pinLabelInputRef.value?.focus());
};

const confirmPin = () => {
  if (coordinate.value) {
    pinStore.addPin([...coordinate.value], pinLabelValue.value);
  }
  close();
};

const open = (event, coord) => {
  const mouseEvent = event.originalEvent || event;
  x.value = mouseEvent.clientX;
  y.value = mouseEvent.clientY;
  coordinate.value = coord;

  // Store OL pixel for getData / forEachFeatureAtPixel
  const map = mapStore.getMap();
  olPixel.value = map ? map.getEventPixel(mouseEvent) : null;

  visible.value = true;
};

const close = () => {
  visible.value = false;
  pinLabelMode.value = false;
  pinLabelValue.value = '';
};

// ---- Copy Coordinates ----
const handleCopyCoordinates = async () => {
  if (!coordinate.value) return;
  const [coordX, coordY] = coordinate.value;
  const coordText = `${coordX.toFixed(2)}, ${coordY.toFixed(2)}`;
  try {
    await navigator.clipboard.writeText(coordText);
    logger.debug('ContextMenu', 'Coordinates copied:', coordText);
  } catch (err) {
    logger.error('ContextMenu', 'Failed to copy coordinates:', err);
  }
  close();
};

// ---- Inspect Point ----
const handleInspectPoint = async () => {
  close();
  inspectVisible.value = true;
  isInspecting.value = true;
  inspectResults.value = [];

  const map = mapStore.getMap();
  if (!map || !olPixel.value) {
    isInspecting.value = false;
    return;
  }

  const pixel = olPixel.value;
  const results = [];

  const overlays = layers.value.filter(
    l => l.category === LAYER_CATEGORY.OVERLAY &&
      l.active &&
      l.status === LAYER_STATUS.READY &&
      l.layerInstance
  );

  for (const layer of overlays) {
    if (layer.type === 'geotiff') {
      // Read raw values directly from the GeoTIFF file instead of the WebGL
      // canvas (getData) — the 8-bit normalised render path loses too much
      // precision for elevation / scientific rasters.
      try {
        const meta = layer.metadata ?? {};
        const { extent, tiffProjection, noDataValue, bands: metaBands } = meta;
        const numBands = typeof metaBands === 'number' && metaBands > 0 ? metaBands : 1;
        const mapCRS = map.getView().getProjection().getCode();

        // Transform click coordinate to TIFF CRS
        let tiffCoord = [...coordinate.value];
        if (tiffProjection && tiffProjection !== mapCRS) {
          const fromProj = getOlProjection(mapCRS);
          const toProj   = getOlProjection(tiffProjection);
          if (fromProj && toProj) {
            tiffCoord = olTransform(tiffCoord, mapCRS, tiffProjection);
          }
        }

        // Check if the point falls inside the TIFF extent
        if (extent) {
          const [ex0, ey0, ex1, ey1] = extent;
          if (tiffCoord[0] < ex0 || tiffCoord[0] > ex1 ||
              tiffCoord[1] < ey0 || tiffCoord[1] > ey1) {
            continue; // outside raster — skip
          }
        }

        // Open the TIFF
        let tiff;
        if (meta.file) {
          tiff = await fromBlob(meta.file);
        } else if (layer.url) {
          tiff = await fromUrl(layer.url);
        } else {
          continue;
        }

        const image = await tiff.getImage();
        const imgExtent = extent ?? image.getBoundingBox();
        const imgW = image.getWidth();
        const imgH = image.getHeight();
        const extW = imgExtent[2] - imgExtent[0];
        const extH = imgExtent[3] - imgExtent[1];

        // Convert geographic coordinate to pixel indices
        const col = Math.floor(((tiffCoord[0] - imgExtent[0]) / extW) * imgW);
        const row = Math.floor(((imgExtent[3] - tiffCoord[1]) / extH) * imgH);
        if (col < 0 || col >= imgW || row < 0 || row >= imgH) continue;

        // Read a single pixel, all bands
        const bandIndices = Array.from({ length: numBands }, (_, i) => i);
        const rasters = await image.readRasters({
          window: [col, row, col + 1, row + 1],
          samples: bandIndices,
        });

        // Resolve effective nodata
        const gdalNoData = image.getGDALNoData();
        const effectiveNoData = (noDataValue !== undefined && noDataValue !== null)
          ? noDataValue : gdalNoData;
        const ndTol = (effectiveNoData !== null && effectiveNoData !== undefined)
          ? Math.max(0.5, Math.abs(effectiveNoData) * 1e-6) : null;

        // Extract values and check nodata
        const values = [];
        let allNoData = true;
        for (let b = 0; b < numBands; b++) {
          const raw = rasters[b][0];
          if (!isFinite(raw) ||
              (ndTol !== null && Math.abs(raw - effectiveNoData) <= ndTol)) {
            values.push(NaN);
          } else {
            allNoData = false;
            values.push(Number.isInteger(raw) ? raw : parseFloat(raw.toPrecision(6)));
          }
        }

        results.push({
          layerId: layer._layerId,
          name: layer.name,
          type: 'geotiff',
          noData: allNoData,
          values: allNoData ? [] : values,
          unit: null,
        });
      } catch (err) {
        logger.warn('ContextMenu', `Failed to read raw GeoTIFF value for "${layer.name}":`, err.message);
      }

    } else {
      // Vector layer
      const features = [];
      map.forEachFeatureAtPixel(pixel, (feature, olLayer) => {
        const belongsHere = olLayer?.get('id') === layer._layerId ||
                            feature.get('_layerId') === layer._layerId;
        if (!belongsHere) return;

        const props = { ...feature.getProperties() };
        delete props.geometry;
        delete props._layerId;
        delete props._featureId;
        if (Object.keys(props).length > 0) features.push(props);
      });

      // Only show layers that actually have features at this pixel
      if (features.length === 0) continue;

      results.push({
        layerId: layer._layerId,
        name: layer.name,
        type: layer.type,
        features,
      });
    }
  }

  inspectResults.value = results;
  isInspecting.value = false;
};

const formatValue = (v) => {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
};

defineExpose({ open, close });
</script>

<style scoped>
/* ---- Context Menu ---- */
.context-menu {
  position: fixed;
  z-index: 9999;
  background: white;
  border: 1px solid #ccc;
  box-shadow: 2px 2px 10px rgba(0, 0, 0, 0.2);
  border-radius: 4px;
  min-width: 170px;
  font-family: "Segoe UI", sans-serif;
  font-size: 13px;
  color: #333;
}

.theme-dark .context-menu {
  background: #2a2a2a;
  border: 1px solid #555;
  box-shadow: 2px 2px 10px rgba(0, 0, 0, 0.6);
  color: #e0e0e0;
}

.overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  z-index: 9998;
  cursor: default;
}

ul {
  list-style: none;
  padding: 0;
  margin: 0;
}

li {
  padding: 8px 12px;
  cursor: pointer;
  border-bottom: 1px solid #f5f5f5;
}
li:last-child { border-bottom: none; }

.theme-dark li { border-bottom: 1px solid #444; }
.theme-dark li:last-child { border-bottom: none; }

li:hover { background: #f0f0f0; }
.theme-dark li:hover { background: #3a3a3a; }

.menu-separator {
  padding: 0;
  height: 1px;
  background: #e8e8e8;
  cursor: default;
  pointer-events: none;
}
.menu-separator:hover { background: #e8e8e8; }
.theme-dark .menu-separator { background: #444; }
.theme-dark .menu-separator:hover { background: #444; }

/* ---- Place Pin inline form ---- */
.pin-label-form {
  padding: 10px 12px 8px;
  min-width: 190px;
}

.pin-label-title {
  font-size: 12px;
  font-weight: 600;
  color: #444;
  margin-bottom: 6px;
}

.theme-dark .pin-label-title { color: #ccc; }

.pin-label-input {
  width: 100%;
  box-sizing: border-box;
  padding: 5px 7px;
  border: 1px solid #ccc;
  border-radius: 4px;
  font-size: 13px;
  font-family: "Segoe UI", sans-serif;
  outline: none;
  margin-bottom: 7px;
}
.pin-label-input:focus { border-color: #3b82f6; box-shadow: 0 0 0 2px rgba(59,130,246,0.2); }
.theme-dark .pin-label-input {
  background: #1e1e1e;
  border-color: #555;
  color: #e0e0e0;
}

.pin-label-actions {
  display: flex;
  gap: 6px;
}

.pin-btn {
  flex: 1;
  padding: 4px 8px;
  border-radius: 4px;
  border: 1px solid transparent;
  font-size: 12px;
  cursor: pointer;
  font-family: "Segoe UI", sans-serif;
}
.pin-btn-primary {
  background: #3b82f6;
  color: #fff;
  border-color: #2563eb;
}
.pin-btn-primary:hover { background: #2563eb; }
.pin-btn-secondary {
  background: #f3f4f6;
  color: #333;
  border-color: #d1d5db;
}
.pin-btn-secondary:hover { background: #e5e7eb; }
.theme-dark .pin-btn-secondary { background: #3a3a3a; color: #ccc; border-color: #555; }
.theme-dark .pin-btn-secondary:hover { background: #444; }

/* ---- Inspection Modal ---- */
.pi-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
}

.pi-modal {
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.25);
  width: 420px;
  max-width: 95vw;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  font-family: "Segoe UI", sans-serif;
  overflow: hidden;
}

.theme-dark .pi-modal {
  background: #2a2a2a;
  color: #e0e0e0;
}

.pi-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  background: #343a40;
  color: #fff;
  flex-shrink: 0;
}

.pi-header-icon { font-size: 16px; }

.pi-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  flex: 1;
}

.pi-close {
  background: none;
  border: none;
  color: rgba(255,255,255,0.7);
  cursor: pointer;
  font-size: 14px;
  padding: 2px 6px;
  border-radius: 4px;
  transition: background 0.15s;
}
.pi-close:hover { background: rgba(255,255,255,0.15); color: #fff; }

.pi-coords {
  padding: 6px 16px;
  font-size: 11px;
  color: #888;
  background: #f8f9fa;
  border-bottom: 1px solid #e9ecef;
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
}

.theme-dark .pi-coords {
  background: #222;
  color: #888;
  border-bottom-color: #444;
}

.pi-body {
  overflow-y: auto;
  padding: 8px 0 12px;
  flex: 1;
}

.pi-loading {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 20px 16px;
  color: #666;
  font-size: 13px;
}

.pi-spinner {
  display: inline-block;
  width: 14px;
  height: 14px;
  border: 2px solid #ccc;
  border-top-color: #3b82f6;
  border-radius: 50%;
  animation: pi-spin 0.7s linear infinite;
  flex-shrink: 0;
}

@keyframes pi-spin { to { transform: rotate(360deg); } }

.pi-empty {
  padding: 20px 16px;
  color: #888;
  font-size: 13px;
  text-align: center;
}

.pi-layer {
  margin: 0 0 4px;
}

.pi-layer-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px 4px;
  font-size: 12px;
  font-weight: 700;
  color: #555;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  border-top: 1px solid #eee;
}

.theme-dark .pi-layer-header {
  color: #aaa;
  border-top-color: #444;
}

.pi-layer:first-child .pi-layer-header {
  border-top: none;
}

.pi-layer-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-transform: none;
  font-size: 13px;
  color: #333;
}

.theme-dark .pi-layer-name { color: #ddd; }

.pi-nodata {
  padding: 4px 16px 6px;
  font-size: 12px;
  color: #999;
  font-style: italic;
}

.pi-feature-idx {
  padding: 2px 16px 2px;
  font-size: 11px;
  font-weight: 600;
  color: #888;
}

.pi-keys {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding: 4px 16px 8px;
}

.pi-key-tag {
  display: inline-block;
  background: #e9ecef;
  color: #495057;
  border-radius: 10px;
  padding: 2px 8px;
  font-size: 11px;
  font-weight: 500;
}

.theme-dark .pi-key-tag {
  background: #3a3a3a;
  color: #bbb;
}

.pi-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}

.pi-table tr:nth-child(even) { background: #f7f8fa; }
.theme-dark .pi-table tr:nth-child(even) { background: #313131; }

.pi-k {
  padding: 5px 16px;
  font-weight: 600;
  color: #555;
  white-space: nowrap;
  width: 38%;
  vertical-align: top;
}

.theme-dark .pi-k { color: #aaa; }

.pi-v {
  padding: 5px 16px 5px 0;
  color: #222;
  word-break: break-word;
}

.theme-dark .pi-v { color: #ddd; }
</style>