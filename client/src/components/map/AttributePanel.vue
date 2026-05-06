<template>
  <div>
    <transition name="slide-right">
      <div v-if="isOpen" class="attribute-panel" :style="{ width: attrPanelWidth + 'px' }">
        <div class="resize-handle" @mousedown="startResize"></div>

        <!-- ── Multi-selection overview ── -->
        <template v-if="isMultiSelect">
          <div class="panel-header">
            <h3>{{ selectedFeatures.length }} features selected</h3>
            <button @click="clearSelection" class="close-btn">×</button>
          </div>
          <div class="panel-content">
            <div class="feature-actions">
              <button @click="downloadCsv" class="action-btn download-btn" title="Download all selected features as CSV">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="btn-icon">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="7 10 12 15 17 10"></polyline>
                  <line x1="12" y1="15" x2="12" y2="3"></line>
                </svg>
                <span class="btn-text">Download CSV</span>
              </button>
            </div>
            <ul class="feature-list">
              <li
                v-for="(feature, idx) in selectedFeatures"
                :key="feature.properties._featureId || idx"
                class="feature-list-item"
                @click="selectionStore.setActiveDetailFeature(feature)"
              >
                <div class="feature-list-info">
                  <span class="feature-list-name">{{ getFeatureTitle(feature) || ('Feature ' + (idx + 1)) }}</span>
                  <span class="feature-list-layer">{{ getLayerName(feature) }}</span>
                </div>
                <span class="feature-list-arrow">›</span>
              </li>
            </ul>
          </div>
        </template>

        <!-- ── Single feature detail ── -->
        <template v-else>
          <div class="panel-header">
            <div class="header-left">
              <button v-if="activeDetailFeature" @click="selectionStore.clearActiveDetail()" class="back-btn" title="Back to selection">‹</button>
              <h3>Feature Details</h3>
            </div>
            <button @click="clearSelection" class="close-btn">×</button>
          </div>

          <div class="panel-content">
            <h2 v-if="featureTitle" class="feature-title">
              {{ featureTitle }}
            </h2>

            <div
              v-if="selectedFeature.properties._thumbnailUrl"
              class="thumbnail-wrapper"
              @click="showFullImage = true"
            >
              <img
                :src="selectedFeature.properties._thumbnailUrl"
                alt="Feature Thumbnail"
                class="feature-thumbnail clickable"
              />
              <div class="hover-overlay">
                <span>🔍 Enlarge</span>
              </div>
            </div>

            <div class="feature-actions" v-if="hasActions">
              <a
                v-if="downloadUrl"
                :href="downloadUrl"
                download
                target="_blank"
                class="action-btn download-btn"
                title="Download Image"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  class="btn-icon"
                >
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="7 10 12 15 17 10"></polyline>
                  <line x1="12" y1="15" x2="12" y2="3"></line>
                </svg>
                <span class="btn-text">Download</span>
              </a>
              <button
                v-if="layerSupports3D || has3DData"
                @click="has3DData ? handle3DView() : null"
                class="action-btn model-btn"
                :class="{ 'disabled': !has3DData }"
                :title="has3DData ? 'View 3D Model' : 'No 3D data available for this feature'"
                :disabled="!has3DData"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  class="btn-icon"
                >
                  <path
                    d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"
                  ></path>
                  <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
                  <line x1="12" y1="22.08" x2="12" y2="12"></line>
                </svg>
                <span class="btn-text">3D View</span>
              </button>
            </div>

            <table class="attr-table">
              <tbody>
                <tr v-for="(value, key) in displayProperties" :key="key">
                  <td class="key">{{ formatKey(key) }}</td>
                  <td class="value">{{ value }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </template>
      </div>
    </transition>

    <Teleport to="body">
      <transition name="fade">
        <div
          v-if="showFullImage && selectedFeature?.properties?._thumbnailUrl"
          class="image-modal-overlay"
          @click="showFullImage = false"
        >
          <div class="image-modal-content" @click.stop>
            <button class="modal-close-btn" @click="showFullImage = false">
              ×
            </button>
            <img
              :src="selectedFeature.properties._thumbnailUrl"
              alt="Full Size"
              class="full-image"
            />
          </div>
        </div>
      </transition>
    </Teleport>
  </div>
</template>

<script setup>
import { computed, ref } from "vue";
import { storeToRefs } from "pinia";
import { useRouter } from "vue-router";
import { useSelectionStore } from "../../stores/map/selectionStore";
import { useLayerStore } from "../../stores/map/layerStore";
import { formatKey } from "../../utils/helpers";
import { logger } from "../../utils/logger";

const router = useRouter();
const selectionStore = useSelectionStore();
const layerStore = useLayerStore();
const { selectedFeature, selectedFeatures, activeDetailFeature } = storeToRefs(selectionStore);
const { clearSelection } = selectionStore;

// Panel is open whenever any feature is selected
const isOpen = computed(() => selectedFeatures.value.length > 0);
// Multi-select list mode: more than one feature and not drilled into detail
const isMultiSelect = computed(() => selectedFeatures.value.length > 1 && !activeDetailFeature.value);

// State for the modal
const showFullImage = ref(false);

// Attribute panel resize
const AP_MIN = 220, AP_MAX = 520, AP_DEFAULT = 300;
const attrPanelWidth = ref(
  Math.min(AP_MAX, Math.max(AP_MIN, parseInt(localStorage.getItem('s3d_attrpanel_width')) || AP_DEFAULT))
);
const startResize = (e) => {
  e.preventDefault();
  const startX = e.clientX;
  const startWidth = attrPanelWidth.value;
  document.body.style.cursor = 'col-resize';
  document.body.style.userSelect = 'none';
  const onMove = (me) => {
    attrPanelWidth.value = Math.min(AP_MAX, Math.max(AP_MIN, startWidth + startX - me.clientX));
  };
  const onUp = () => {
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    localStorage.setItem('s3d_attrpanel_width', String(attrPanelWidth.value));
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
  };
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
};

// ── Multi-select helpers ─────────────────────────────────────────────────────

// Get the display title for any feature (uses layer's headerAttribute)
const getFeatureTitle = (feature) => {
  const props = feature?.properties;
  if (!props?._layerId) return null;
  const layer = layerStore.layers.find((l) => l._layerId === props._layerId);
  const headerKey = layer?.metadata?.headerAttribute;
  return headerKey && props[headerKey] ? props[headerKey] : null;
};

// Get the human-readable layer name for a feature
const getLayerName = (feature) => {
  const props = feature?.properties;
  if (!props?._layerId) return '';
  const layer = layerStore.layers.find((l) => l._layerId === props._layerId);
  return layer?.name || '';
};

// Download all selected features as a CSV file
const downloadCsv = () => {
  if (!selectedFeatures.value.length) return;

  // Collect all unique public property keys across all features
  const allKeys = new Set();
  selectedFeatures.value.forEach((f) => {
    Object.keys(f.properties).forEach((k) => {
      if (!k.startsWith('_') && k !== 'color') allKeys.add(k);
    });
  });
  const keys = [...allKeys];

  const escape = (v) => {
    if (v == null) return '';
    const s = String(v);
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  };

  const header = keys.map(escape).join(',');
  const rows = selectedFeatures.value.map((f) =>
    keys.map((k) => escape(f.properties[k] ?? '')).join(',')
  );
  const csv = [header, ...rows].join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `selection_${selectedFeatures.value.length}_features.csv`;
  a.click();
  URL.revokeObjectURL(url);
};

// ── Single-feature computed properties ──────────────────────────────────────

const downloadUrl = computed(
  () => selectedFeature.value?.properties?._downloadUrl
);

const model3dUrls = computed(() => {
  const props = selectedFeature.value?.properties;
  if (!props) return [];
  if (Array.isArray(props._model3dUrls) && props._model3dUrls.length > 0) return props._model3dUrls;
  if (props._model3dUrl) return [props._model3dUrl];
  return [];
});

const pointcloudUrls = computed(() => {
  const props = selectedFeature.value?.properties;
  if (!props) return [];
  if (Array.isArray(props._pointcloudUrls) && props._pointcloudUrls.length > 0) return props._pointcloudUrls;
  if (props._pointcloudUrl) return [props._pointcloudUrl];
  return [];
});

const has3DData = computed(() => model3dUrls.value.length > 0 || pointcloudUrls.value.length > 0);

const layerSupports3D = computed(() => {
  const props = selectedFeature.value?.properties;
  if (!props?._layerId) return false;
  const layer = layerStore.layers.find((l) => l._layerId === props._layerId);
  const metadata = layer?.metadata || {};
  return metadata.has3DModels === true || metadata.hasPointClouds === true;
});

const hasActions = computed(() => downloadUrl.value || has3DData.value || layerSupports3D.value);

const handle3DView = () => {
  if (!has3DData.value) return;
  logger.debug('AttributePanel', 'Opening 3D viewer with:', { models: model3dUrls.value, pointclouds: pointcloudUrls.value });

  const props = selectedFeature.value.properties;
  const assetName = props._model3dNames?.[0] || props._pointcloudNames?.[0];
  const name = assetName || props.name || featureTitle.value || 'Model';
  const payload = { models: model3dUrls.value, pointclouds: pointcloudUrls.value, name };
  if (props._x) payload.x = props._x;
  if (props._y) payload.y = props._y;
  localStorage.setItem('s3d_viewer3d', JSON.stringify(payload));

  const route = router.resolve({ name: '3d-viewer' });
  window.open(route.href, '_blank');
};

const displayProperties = computed(() => {
  if (!selectedFeature.value?.properties) return {};
  const props = selectedFeature.value.properties;
  return Object.keys(props)
    .filter((key) => !key.startsWith('_') && !['name', 'color'].includes(key))
    .reduce((obj, key) => { obj[key] = props[key]; return obj; }, {});
});

const featureTitle = computed(() => getFeatureTitle(selectedFeature.value));
</script>

<style scoped>
.attribute-panel {
  position: absolute;
  top: 0;
  right: 0;
  /* width controlled by inline style */
  height: 100%;
  background: white;
  box-shadow: -2px 0 5px rgba(0, 0, 0, 0.1);
  z-index: 2000;
  display: flex;
  flex-direction: column;
}

.resize-handle {
  position: absolute;
  left: 0;
  top: 0;
  width: 5px;
  height: 100%;
  cursor: col-resize;
  z-index: 10;
  background: transparent;
  transition: background 0.15s;
}

.resize-handle:hover {
  background: rgba(100, 100, 100, 0.18);
}

.theme-dark .attribute-panel {
  background: #2a2a2a;
  box-shadow: -2px 0 5px rgba(0, 0, 0, 0.5);
}

.panel-header {
  padding: 0 15px;
  background: #343a40;
  color: white;
  display: flex;
  justify-content: space-between;
  align-items: center;
  height: 48px;
  box-sizing: border-box;
}

.theme-dark .panel-header {
  background: #1a1a1a;
}

.close-btn {
  background: none;
  border: none;
  color: white;
  font-size: 20px;
  cursor: pointer;
  line-height: 1;
  display: flex;
  align-items: center;
}

.panel-content {
  padding: 20px;
  overflow-y: auto;
}

/* Updated Thumbnail Styles */
.thumbnail-wrapper {
  width: 100%;
  max-width: 250px;
  margin: 0 auto 15px;
  border-radius: 4px;
  overflow: hidden;
  background: #f8f9fa;
  aspect-ratio: 1 / 1;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  cursor: pointer;
}

.theme-dark .thumbnail-wrapper {
  background: #3a3a3a;
}

.feature-thumbnail {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border: 1px solid #eee;
  transition: transform 0.3s ease;
}

.theme-dark .feature-thumbnail {
  border: 1px solid #555;
}

.hover-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.3s ease;
}

.hover-overlay span {
  color: white;
  font-weight: bold;
  font-size: 1.1rem;
  background: rgba(0, 0, 0, 0.5);
  padding: 5px 10px;
  border-radius: 4px;
}

.thumbnail-wrapper:hover .hover-overlay {
  opacity: 1;
}

.thumbnail-wrapper:hover .feature-thumbnail {
  transform: scale(1.05);
}

.feature-title {
  /* Ensure no top margin creates a gap */
  margin-top: 0;

  color: #333;
  font-size: 1.2rem;

  /* Keeps the line BELOW the title (separating title from table) */
  border-bottom: 2px solid #eee;

  padding-bottom: 10px;
  margin-bottom: 15px;
  text-align: center;
}

.theme-dark .feature-title {
  color: #e0e0e0;
  border-bottom: 2px solid #444;
}

.feature-actions {
  display: flex;
  justify-content: center;
  gap: 12px;

  /* Removed the border-bottom here */
  border-bottom: none;

  /* Reduced margin so it sits closer to the title below it */
  margin-bottom: 10px;
  padding-bottom: 0;

  flex-wrap: wrap;
}

.action-btn {
  text-decoration: none;
  font-size: 0.9rem;
  font-weight: 500;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 8px 16px; /* Comfortable clickable area */
  border-radius: 6px; /* Slightly rounded corners */
  transition: all 0.2s ease;
  cursor: pointer;
  color: #333;
  border: 1px solid #ddd; /* Subtle border */
  background: #fff;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
}

.theme-dark .action-btn {
  color: #e0e0e0;
  border: 1px solid #555;
  background: #3a3a3a;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
}

/* Icon specific spacing */
.btn-icon {
  margin-right: 8px;
  width: 18px;
  height: 18px;
}

/* Hover Effects */
.action-btn:hover {
  background: #f8f9fa;
  border-color: #bbb;
  transform: translateY(-1px); /* Slight lift */
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.08);
  color: #000;
}

.theme-dark .action-btn:hover {
  background: #454545;
  border-color: #666;
  color: #fff;
}

.action-btn:active {
  transform: translateY(0);
  box-shadow: none;
}

/* Optional: Distinguish the two buttons slightly */
.download-btn:hover {
  border-color: #4dabf7;
  color: #1971c2;
  background-color: #e7f5ff;
}

.model-btn:hover {
  border-color: #69db7c;
  color: #2b8a3e;
  background-color: #ebfbee;
}

/* Disabled button state */
.action-btn.disabled,
.action-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
  pointer-events: none;
}

.action-btn.disabled:hover,
.action-btn:disabled:hover {
  background: #fff;
  border-color: #ddd;
  color: #333;
  transform: none;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
}

.attr-table {
  width: 100%;
  border-collapse: collapse;
}

.attr-table td {
  padding: 8px 0;
  border-bottom: 1px solid #f0f0f0;
  font-size: 14px;
}

.theme-dark .attr-table td {
  border-bottom: 1px solid #444;
}

.key {
  font-weight: 600;
  color: #666;
  width: 40%;
}

.theme-dark .key {
  color: #999;
}

.value {
  color: #333;
}

.theme-dark .value {
  color: #e0e0e0;
}

/* Slide Animation */
.slide-right-enter-active,
.slide-right-leave-active {
  transition: transform 0.3s ease;
}

.slide-right-enter-from,
.slide-right-leave-to {
  transform: translateX(100%);
}

/* Modal Styles */
.image-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(0, 0, 0, 0.85);
  z-index: 3000;
  display: flex;
  justify-content: center;
  align-items: center;
  cursor: zoom-out;
}

.image-modal-content {
  position: relative;
  max-width: 90vw;
  max-height: 90vh;
  cursor: default;
}

.full-image {
  max-width: 100%;
  max-height: 90vh;
  border-radius: 4px;
  box-shadow: 0 5px 15px rgba(0, 0, 0, 0.5);
}

.modal-close-btn {
  position: absolute;
  top: -40px;
  right: -40px;
  background: none;
  border: none;
  color: white;
  font-size: 30px;
  cursor: pointer;
  opacity: 0.8;
  transition: opacity 0.2s;
}

.modal-close-btn:hover {
  opacity: 1;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

@media (max-width: 768px) {
  .resize-handle {
    display: none;
  }
}

/* ── Multi-selection styles ── */
.header-left {
  display: flex;
  align-items: center;
  gap: 6px;
}

.back-btn {
  background: none;
  border: none;
  color: white;
  font-size: 22px;
  cursor: pointer;
  line-height: 1;
  padding: 0 4px;
  display: flex;
  align-items: center;
  opacity: 0.8;
  transition: opacity 0.2s;
}

.back-btn:hover {
  opacity: 1;
}

.feature-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.feature-list-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  border-bottom: 1px solid #f0f0f0;
  cursor: pointer;
  transition: background 0.15s;
  border-radius: 4px;
}

.feature-list-item:hover {
  background: #f0f4f8;
}

.theme-dark .feature-list-item {
  border-bottom: 1px solid #3a3a3a;
}

.theme-dark .feature-list-item:hover {
  background: #333;
}

.feature-list-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.feature-list-name {
  font-size: 14px;
  font-weight: 600;
  color: #333;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.theme-dark .feature-list-name {
  color: #e0e0e0;
}

.feature-list-layer {
  font-size: 12px;
  color: #888;
}

.theme-dark .feature-list-layer {
  color: #aaa;
}

.feature-list-arrow {
  font-size: 18px;
  color: #bbb;
  flex-shrink: 0;
  margin-left: 8px;
}

.theme-dark .feature-list-arrow {
  color: #555;
}
</style>