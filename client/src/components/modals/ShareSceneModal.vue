<template>
  <Transition name="fade">
    <div v-if="isOpen" class="modal-overlay" @click.self="$emit('close')">
      <div class="modal-content">
        <header class="modal-header">
          <h3>
            <span v-html="ICON_SHARE"></span>
            Share Scene
          </h3>
          <button class="close-btn" @click="$emit('close')" title="Close">
            <span v-html="ICON_CLOSE"></span>
          </button>
        </header>

        <div class="modal-body">
          <!-- Tabs -->
          <div class="share-tabs">
            <button :class="['share-tab', { active: tab === 'export' }]" @click="tab = 'export'">Export</button>
            <button :class="['share-tab', { active: tab === 'import' }]" @click="tab = 'import'; importWarnings = []; importSuccess = false">Import</button>
          </div>

          <!-- Export tab -->
          <div v-if="tab === 'export'" class="tab-content">
            <p class="description">
              This code captures the current map view (position, zoom) and all overlay layer states.
              Share it with others so they can restore the exact same scene.
            </p>
            <div class="code-box">
              <textarea ref="exportTextarea" class="code-textarea" readonly :value="exportCode" rows="5"></textarea>
            </div>
            <div class="action-row">
              <button class="btn btn-primary" @click="copyToClipboard">
                <span v-html="ICON_COPY"></span>
                {{ copyLabel }}
              </button>
            </div>
          </div>

          <!-- Import tab -->
          <div v-if="tab === 'import'" class="tab-content">
            <p class="description">
              Paste a scene code below to restore a shared map view.
            </p>
            <div class="code-box">
              <textarea
                v-model="importCode"
                class="code-textarea"
                placeholder="Paste scene code here…"
                rows="5"
                spellcheck="false"
              ></textarea>
            </div>

            <div v-if="importWarnings.length" class="warnings-box">
              <strong>⚠ Some layers could not be restored:</strong>
              <ul>
                <li v-for="w in importWarnings" :key="w">{{ w }}</li>
              </ul>
            </div>

            <div v-if="importSuccess" class="success-box">
              ✓ Scene restored successfully.
            </div>

            <div v-if="importError" class="error-box">
              ✗ {{ importError }}
            </div>

            <div class="action-row">
              <button class="btn btn-primary" @click="loadScene" :disabled="!importCode.trim() || !!currentDisambiguation">
                Load Scene
              </button>
            </div>
          </div>
        </div>

        <!-- Disambiguation overlay (shown when multiple layers share the same name) -->
        <Transition name="fade">
          <div v-if="currentDisambiguation" class="disambig-overlay">
            <div class="disambig-box">
              <p class="disambig-title">
                Multiple layers named <strong>"{{ currentDisambiguation.savedLayer.name }}"</strong> were found.
                Select the correct one:
              </p>
              <ul class="disambig-list">
                <li
                  v-for="candidate in currentDisambiguation.candidates"
                  :key="candidate._layerId"
                  class="disambig-item"
                  @click="resolveDisambiguation(candidate)"
                >
                  <span class="disambig-type">{{ candidate.type }}</span>
                  <span class="disambig-url">{{ candidate.url ? shortenUrl(candidate.url) : candidate.geometryType }}</span>
                </li>
              </ul>
              <div class="disambig-actions">
                <button class="btn btn-secondary" @click="resolveDisambiguation(null)">Skip this layer</button>
              </div>
            </div>
          </div>
        </Transition>
      </div>
    </div>
  </Transition>
</template>

<script setup>
import { ref, watch, onUnmounted } from 'vue';
import { useMapStore } from '@/stores/map/mapStore';
import { transform } from 'ol/proj';
import { useLayerStore } from '@/stores/map/layerStore';
import { usePinStore } from '@/stores/map/pinStore';
import { ICON_CLOSE } from '@/constants/icons.js';

const ICON_SHARE = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>`;
const ICON_COPY  = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>`;

const props = defineProps({
  isOpen: { type: Boolean, default: false },
});

const emit = defineEmits(['close']);

const mapStore = useMapStore();
const layerStore = useLayerStore();
const pinStore = usePinStore();

const tab = ref('export');
const exportCode = ref('');
const importCode = ref('');
const copyLabel = ref('Copy to Clipboard');
let copyLabelTimer = null;
onUnmounted(() => clearTimeout(copyLabelTimer));
const importWarnings = ref([]);
const importSuccess = ref(false);
const importError = ref('');
const exportTextarea = ref(null);

// Disambiguation state
const currentDisambiguation = ref(null); // { savedLayer, candidates }
const disambiguationQueue = ref([]);     // remaining conflicts to resolve
const pendingApplyQueue = ref([]);       // { storeLayer, savedLayer } ready to apply
const pendingWarnings = ref([]);

// Re-generate export code whenever the modal opens on the export tab
watch(() => props.isOpen, (open) => {
  if (open) {
    tab.value = 'export';
    importCode.value = '';
    importWarnings.value = [];
    importSuccess.value = false;
    importError.value = '';
    copyLabel.value = 'Copy to Clipboard';
    exportCode.value = generateSceneCode();
    currentDisambiguation.value = null;
    disambiguationQueue.value = [];
    pendingApplyQueue.value = [];
    pendingWarnings.value = [];
  }
});

const generateSceneCode = () => {
  const map = mapStore.getMap();
  if (!map) return '';

  const view = map.getView();
  const center = view.getCenter();
  const zoom = view.getZoom();
  const projection = view.getProjection().getCode();

  const layers = layerStore.layers
    .filter(l => l.category === 'overlay')
    .map(l => ({
      name: l.name,
      active: l.active,
      color: l.color,
    }));

  const pins = pinStore.pins.map(p => ({
    id: p.id,
    label: p.label,
    coordinate: p.coordinate,
  }));

  const payload = { v: 1, center, zoom, projection, layers, pins };
  return btoa(JSON.stringify(payload));
};

const copyToClipboard = async () => {
  try {
    await navigator.clipboard.writeText(exportCode.value);
    copyLabel.value = '✓ Copied!';
    copyLabelTimer = setTimeout(() => { copyLabel.value = 'Copy to Clipboard'; }, 2000);
  } catch {
    // Fallback for browsers without clipboard API
    exportTextarea.value?.select();
    document.execCommand('copy');
    copyLabel.value = '✓ Copied!';
    copyLabelTimer = setTimeout(() => { copyLabel.value = 'Copy to Clipboard'; }, 2000);
  }
};

const loadScene = async () => {
  importWarnings.value = [];
  importSuccess.value = false;
  importError.value = '';
  currentDisambiguation.value = null;
  disambiguationQueue.value = [];
  pendingApplyQueue.value = [];
  pendingWarnings.value = [];

  let payload;
  try {
    payload = JSON.parse(atob(importCode.value.trim()));
  } catch {
    importError.value = 'Invalid scene code. Make sure you pasted the full, unmodified text.';
    return;
  }

  if (!payload?.v || !Array.isArray(payload.center) || typeof payload.zoom !== 'number') {
    importError.value = 'Unrecognised scene format.';
    return;
  }

  const map = mapStore.getMap();
  if (!map) {
    importError.value = 'Map is not ready yet.';
    return;
  }

  // Restore view immediately (independent of layer disambiguation)
  const view = map.getView();
  const currentProj = view.getProjection().getCode();
  let center = payload.center;
  if (payload.projection && payload.projection !== currentProj) {
    try {
      center = transform(payload.center, payload.projection, currentProj);
    } catch {
      pendingWarnings.value.push(`Projection mismatch (saved: ${payload.projection}, current: ${currentProj}) – position may be inaccurate.`);
    }
  }
  view.animate({ center, zoom: payload.zoom, duration: 600 });

  // Restore pins (if any)
  await restorePins(payload, currentProj);

  // Classify each layer: unique match → queue, no match → warn, multiple → disambiguate
  const toDisambiguate = [];
  for (const savedLayer of (payload.layers ?? [])) {
    const matches = layerStore.layers.filter(l => l.name === savedLayer.name);
    if (matches.length === 0) {
      pendingWarnings.value.push(`"${savedLayer.name}" – layer not found in current config.`);
    } else if (matches.length === 1) {
      pendingApplyQueue.value.push({ storeLayer: matches[0], savedLayer });
    } else {
      toDisambiguate.push({ savedLayer, candidates: matches });
    }
  }

  if (toDisambiguate.length > 0) {
    disambiguationQueue.value = toDisambiguate.slice(1);
    currentDisambiguation.value = toDisambiguate[0];
  } else {
    applyRestoredLayers();
  }
};

const resolveDisambiguation = (chosenLayer) => {
  if (chosenLayer) {
    pendingApplyQueue.value.push({ storeLayer: chosenLayer, savedLayer: currentDisambiguation.value.savedLayer });
  } else {
    pendingWarnings.value.push(`"${currentDisambiguation.value.savedLayer.name}" – skipped (multiple matches).`);
  }

  if (disambiguationQueue.value.length > 0) {
    currentDisambiguation.value = disambiguationQueue.value[0];
    disambiguationQueue.value = disambiguationQueue.value.slice(1);
  } else {
    currentDisambiguation.value = null;
    applyRestoredLayers();
  }
};

const applyRestoredLayers = () => {
  for (const { storeLayer, savedLayer } of pendingApplyQueue.value) {
    storeLayer.active = savedLayer.active;
    storeLayer.layerInstance?.setVisible(savedLayer.active);
    if (savedLayer.color) storeLayer.color = savedLayer.color;
  }
  importWarnings.value = [...pendingWarnings.value];
  importSuccess.value = true;
  pendingApplyQueue.value = [];
  pendingWarnings.value = [];
};

const restorePins = async (payload, currentProj) => {
  if (!Array.isArray(payload.pins) || payload.pins.length === 0) return;
  let pins = payload.pins;
  if (payload.projection && payload.projection !== currentProj) {
    try {
      pins = pins.map(p => ({
        ...p,
        coordinate: transform(p.coordinate, payload.projection, currentProj),
      }));
    } catch {
      // If transform fails, use coordinates as-is
    }
  }
  pinStore.setPins(pins);
};

const shortenUrl = (url) => {
  try { return new URL(url).hostname; }
  catch { return url.length > 45 ? url.slice(0, 45) + '…' : url; }
};
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
}

.modal-content {
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
  width: 480px;
  max-width: 95vw;
  display: flex;
  flex-direction: column;
  font-family: "Segoe UI", sans-serif;
  position: relative;
  overflow: hidden;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px 12px;
  border-bottom: 1px solid #e5e7eb;
}

.modal-header h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: #1f2937;
  display: flex;
  align-items: center;
  gap: 8px;
}

.close-btn {
  background: none;
  border: none;
  padding: 4px;
  cursor: pointer;
  color: #6b7280;
  border-radius: 4px;
  display: flex;
  align-items: center;
}
.close-btn:hover { color: #111; background: #f3f4f6; }

.modal-body {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* Tabs */
.share-tabs {
  display: flex;
  gap: 2px;
  border-bottom: 1px solid #e5e7eb;
  margin-bottom: 4px;
}
.share-tab {
  padding: 6px 16px;
  border: none;
  background: none;
  cursor: pointer;
  font-size: 13px;
  color: #6b7280;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  transition: all 0.15s;
}
.share-tab:hover { color: #111; }
.share-tab.active { color: #3b82f6; border-bottom-color: #3b82f6; font-weight: 500; }

.tab-content {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.description {
  font-size: 12px;
  color: #6b7280;
  margin: 0;
  line-height: 1.5;
}

.code-box { position: relative; }

.code-textarea {
  width: 100%;
  box-sizing: border-box;
  font-family: "Cascadia Code", "Fira Mono", monospace;
  font-size: 11px;
  padding: 8px 10px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  background: #f9fafb;
  color: #374151;
  resize: vertical;
  outline: none;
  line-height: 1.5;
  transition: border-color 0.15s;
}
.code-textarea:focus { border-color: #3b82f6; background: #fff; }
.code-textarea[readonly] { cursor: default; }

.action-row {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 14px;
  border-radius: 6px;
  border: none;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s;
}
.btn:disabled { opacity: 0.45; cursor: not-allowed; }
.btn-primary { background: #3b82f6; color: #fff; }
.btn-primary:hover:not(:disabled) { background: #2563eb; }
.btn-secondary { background: #f3f4f6; color: #374151; border: 1px solid #d1d5db; }
.btn-secondary:hover { background: #e5e7eb; }

/* Disambiguation overlay */
.disambig-overlay {
  position: absolute;
  inset: 0;
  background: rgba(255, 255, 255, 0.97);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
  padding: 24px;
  box-sizing: border-box;
}
.disambig-box {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.disambig-title {
  margin: 0;
  font-size: 13px;
  color: #1f2937;
  line-height: 1.5;
}
.disambig-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.disambig-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 12px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
  transition: background 0.12s, border-color 0.12s;
}
.disambig-item:hover { background: #eff6ff; border-color: #93c5fd; }
.disambig-type {
  font-weight: 600;
  color: #3b82f6;
  text-transform: uppercase;
  font-size: 10px;
  letter-spacing: 0.05em;
  background: #eff6ff;
  border-radius: 4px;
  padding: 2px 6px;
  white-space: nowrap;
}
.disambig-url {
  color: #6b7280;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.disambig-actions {
  display: flex;
  justify-content: flex-end;
}

.warnings-box {
  background: #fffbeb;
  border: 1px solid #fcd34d;
  border-radius: 6px;
  padding: 10px 12px;
  font-size: 12px;
  color: #92400e;
}
.warnings-box ul {
  margin: 6px 0 0 0;
  padding-left: 18px;
}
.warnings-box li { margin: 2px 0; }

.success-box {
  background: #f0fdf4;
  border: 1px solid #86efac;
  border-radius: 6px;
  padding: 8px 12px;
  font-size: 12px;
  color: #166534;
}

.error-box {
  background: #fff1f2;
  border: 1px solid #fca5a5;
  border-radius: 6px;
  padding: 8px 12px;
  font-size: 12px;
  color: #991b1b;
}

/* Fade transition */
.fade-enter-active, .fade-leave-active { transition: opacity 0.2s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
