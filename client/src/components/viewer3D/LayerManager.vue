<template>
  <div :class="['layer-panel', { 'is-open': isOpen }]">
    <!-- Mobile backdrop -->
    <div class="layer-backdrop" @click="isOpen = false"></div>

    <div class="layer-header">
      <h4>Layers</h4>
      <button class="layer-close-btn" @click="isOpen = false" title="Close panel" aria-label="Close layers panel">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
    
    <div class="layer-list">
      <template v-for="layer in layers" :key="layer.id">
        <div 
          class="layer-item"
          :class="{ selected: selectedLayerId === layer.id }"
          @click="selectLayer(layer.id)"
          @contextmenu.prevent="handleRightClick($event, layer)"
        >
          <span class="layer-icon" v-html="getLayerIcon(layer.type)"></span>
          <span class="layer-name" :title="layer.name">{{ layer.name }}</span>
          
          <button 
            class="visibility-btn" 
            @click.stop="toggleVisibility(layer)"
            :title="layer.visible ? 'Hide layer' : 'Show layer'"
          >
            <span v-html="layer.visible ? ICON_EYE : ICON_EYE_OFF"></span>
          </button>
        </div>
      </template>
      
      <div v-if="layers.length === 0" class="empty-state">
        No layers loaded
      </div>
    </div>

    <div class="layer-footer">
      <button class="settings-btn" @click="$emit('open-settings')">
        <span class="settings-icon" v-html="ICON_SETTINGS"></span>
        <span>Settings</span>
      </button>
    </div>

    <!-- Context Menu -->
    <ContextMenu3D
      ref="contextMenuRef"
      @action="handleMenuAction"

    />

    <!-- Layer Info Modal -->
    <LayerInfoModal
      :is-visible="infoModalVisible"
      :title="infoModalTitle"
      :rows="infoModalRows"
      @close="infoModalVisible = false"
    />
  </div>
</template>

<script setup>
import { ref, markRaw } from 'vue';
import * as THREE from 'three';
import ContextMenu3D from '../contextMenus/ContextMenu3D.vue';
import LayerInfoModal from '../modals/LayerInfoModal.vue';
import {
  ICON_3D_MODEL,
  ICON_POINT_CLOUD,
  ICON_CAMERA,
  ICON_MARKER_FLAG,
  ICON_PACKAGE,
  ICON_EYE,
  ICON_EYE_OFF,
  ICON_TRASH,
  ICON_SETTINGS
} from '@/constants/icons.js';

const emit = defineEmits(['toggle-layer-visibility', 'remove-layer', 'zoom-to-layer', 'select-layer', 'open-settings']);

const layers = ref([]);
const selectedLayerId = ref(null);
const contextMenuRef = ref(null);

// Open by default on desktop, closed on mobile
const isOpen = ref(typeof window !== 'undefined' ? window.innerWidth >= 768 : true);

const toggle = () => { isOpen.value = !isOpen.value; };

// Info modal state
const infoModalVisible = ref(false);
const infoModalTitle = ref('');
const infoModalRows = ref([]);

const getLayerIcon = (type) => {
  switch(type) {
    case 'model':      return ICON_3D_MODEL;
    case 'pointcloud': return ICON_POINT_CLOUD;
    case 'copc':       return ICON_POINT_CLOUD;
    case 'camera':     return ICON_CAMERA;
    case 'markers':    return ICON_MARKER_FLAG;
    default:           return ICON_PACKAGE;
  }
};

const addLayer = (layer) => {
  layers.value.push({ ...layer, object: layer.object ? markRaw(layer.object) : null });
  if (layers.value.length === 1) {
    selectedLayerId.value = layer.id;
    emit('select-layer', layers.value[0]);
  }
};

const toggleVisibility = (layer) => {
  layer.visible = !layer.visible;
  emit('toggle-layer-visibility', { layerId: layer.id, visible: layer.visible });
};

const removeLayer = (layerId) => {
  const layer = layers.value.find(l => l.id === layerId);
  const name = layer?.name || 'this layer';
  if (!confirm(`Remove "${name}"? This cannot be undone.`)) return;
  forceRemoveLayer(layerId);
};

const forceRemoveLayer = (layerId) => {
  const index = layers.value.findIndex(l => l.id === layerId);
  if (index !== -1) {
    layers.value.splice(index, 1);
    emit('remove-layer', layerId);
    if (selectedLayerId.value === layerId) {
      const next = layers.value.length > 0 ? layers.value[0] : null;
      selectedLayerId.value = next ? next.id : null;
      emit('select-layer', next);
    }
  }
};

const selectLayer = (layerId) => {
  selectedLayerId.value = layerId;
  const layer = layers.value.find(l => l.id === layerId) ?? null;
  emit('select-layer', layer);
};

// --- Point size helpers (only relevant for pointcloud/copc layers) ---
const getPointSize = (layer) => {
  if (!layer.object) return 2;
  if (layer.object.userData?.type === 'copc') return layer.object.userData.pointSize ?? 2;
  let size = 2;
  layer.object.traverse((child) => {
    if (child.isPoints && child.material) size = child.material.size;
  });
  return size;
};

const setPointSize = (layer, newSize) => {
  if (!layer.object) return;
  if (layer.object.userData?.type === 'copc') {
    // COPC point size is managed via setCOPCPointSize in Canvas.vue through 3DView.vue
    layer.object.userData.pointSize = newSize;
    return;
  }
  layer.object.traverse((child) => {
    if (child.isPoints && child.material) {
      child.material.size = newSize;
      child.material.needsUpdate = true;
    }
  });
};

// --- Layer info computation ---
const TYPE_LABELS = {
  model:      '3D Model',
  pointcloud: 'Point Cloud',
  copc:       'Point Cloud (COPC)',
  camera:     'Camera Poses',
  markers:    'GCP Markers',
};

const collectLayerInfo = (layer) => {
  const rows = [];
  rows.push({ key: 'Name', value: layer.name });
  rows.push({ key: 'Type', value: TYPE_LABELS[layer.type] || layer.type });

  // COPC entity — read metadata from Giro3D entity
  if (layer.object?.userData?.type === 'copc') {
    const entity = layer.object.userData.giro3dEntity;
    if (entity) {
      const metadata = entity.source?.metadata;
      if (metadata?.pointCount) {
        rows.push({ key: 'Points', value: metadata.pointCount.toLocaleString() });
      }
      if (entity.object3d) {
        const box = new THREE.Box3().setFromObject(entity.object3d);
        if (!box.isEmpty()) {
          const size = box.getSize(new THREE.Vector3());
          const center = box.getCenter(new THREE.Vector3());
          rows.push({ key: 'Size X', value: `${size.x.toFixed(2)} m` });
          rows.push({ key: 'Size Y', value: `${size.y.toFixed(2)} m` });
          rows.push({ key: 'Size Z', value: `${size.z.toFixed(2)} m` });
          rows.push({ key: 'Center X', value: center.x.toFixed(1) });
          rows.push({ key: 'Center Y', value: center.y.toFixed(1) });
          rows.push({ key: 'Center Z', value: center.z.toFixed(1) });
        }
      }
    }
    return rows;
  }

  if (layer.object) {
    let totalPoints = 0;
    let rawTotalPoints = 0;
    let totalVertices = 0;
    let totalTriangles = 0;
    let meshCount = 0;

    layer.object.traverse((child) => {
      if (child.isPoints && child.geometry?.attributes?.position) {
        totalPoints += child.geometry.attributes.position.count;
        if (child.userData.totalPoints) rawTotalPoints += child.userData.totalPoints;
      }
      if (child.isMesh && child.geometry?.attributes?.position) {
        meshCount++;
        totalVertices += child.geometry.attributes.position.count;
        const idx = child.geometry.index;
        totalTriangles += idx ? idx.count / 3 : Math.round(child.geometry.attributes.position.count / 3);
      }
    });

    if (totalPoints > 0) {
      const pointsValue = rawTotalPoints > totalPoints
        ? `${totalPoints.toLocaleString()} (sampled from ${rawTotalPoints.toLocaleString()})`
        : totalPoints.toLocaleString();
      rows.push({ key: 'Points', value: pointsValue });
    }
    if (totalVertices > 0)  rows.push({ key: 'Vertices',  value: totalVertices.toLocaleString() });
    if (totalTriangles > 0) rows.push({ key: 'Triangles', value: Math.round(totalTriangles).toLocaleString() });
    if (meshCount > 1)      rows.push({ key: 'Meshes',    value: meshCount.toLocaleString() });

    if (layer.type === 'camera' && layer.object.userData?.cameraCount) {
      rows.push({ key: 'Cameras', value: layer.object.userData.cameraCount });
    }
    if (layer.type === 'markers' && layer.object.userData?.markerCount) {
      rows.push({ key: 'Markers', value: layer.object.userData.markerCount });
    }

    // Bounding box — for markers compute from group positions only (not visual geometry)
    let box;
    if (layer.type === 'markers') {
      box = new THREE.Box3();
      layer.object.children.forEach(child => {
        if (child.isGroup) box.expandByPoint(child.position);
      });
    } else {
      box = new THREE.Box3().setFromObject(layer.object);
    }

    if (!box.isEmpty()) {
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      rows.push({ key: 'Size X', value: `${size.x.toFixed(2)} m` });
      rows.push({ key: 'Size Y', value: `${size.y.toFixed(2)} m` });
      rows.push({ key: 'Size Z', value: `${size.z.toFixed(2)} m` });
      rows.push({ key: 'Center X', value: center.x.toFixed(1) });
      rows.push({ key: 'Center Y', value: center.y.toFixed(1) });
      rows.push({ key: 'Center Z', value: center.z.toFixed(1) });
    }
  }

  return rows;
};

const handleRightClick = (event, layer) => {
  contextMenuRef.value.open(event, layer);
};

const handleMenuAction = ({ type, layer }) => {
  if (type === 'info') {
    infoModalRows.value = collectLayerInfo(layer);
    infoModalTitle.value = layer.name;
    infoModalVisible.value = true;
  } else if (type === 'zoom') {
    emit('zoom-to-layer', layer);
  } else if (type === 'remove') {
    removeLayer(layer.id);
  }
};

const openInfoForLayer = (layer) => {
  infoModalRows.value = collectLayerInfo(layer);
  infoModalTitle.value = layer.name;
  infoModalVisible.value = true;
};

const setPointSizeById = (layerId, size) => {
  const layer = layers.value.find(l => l.id === layerId);
  if (layer) setPointSize(layer, size);
};

defineExpose({
  toggle,
  addLayer,
  openInfoForLayer,
  removeLayerById: removeLayer,   // includes confirmation dialog
  setPointSizeById,
});
</script>

<style scoped>
.layer-panel {
  width: 240px;
  height: 100%;
  background: #f8f9fa;
  border-right: 1px solid #ddd;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  font-family: "Segoe UI", sans-serif;
  z-index: 800;
}

.layer-backdrop {
  display: none;
}

.layer-close-btn {
  display: none;
}

@media (max-width: 767px) {
  .layer-panel {
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    z-index: 1000;
    transform: translateX(-100%);
    transition: transform 0.25s ease;
    box-shadow: 4px 0 20px rgba(0, 0, 0, 0.25);
  }

  .layer-panel.is-open {
    transform: translateX(0);
  }

  .layer-backdrop {
    display: block;
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0);
    pointer-events: none;
    z-index: -1;
    transition: background 0.25s ease;
  }

  .layer-panel.is-open .layer-backdrop {
    background: rgba(0, 0, 0, 0.45);
    pointer-events: auto;
  }

  .layer-close-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border: none;
    background: rgba(255, 255, 255, 0.15);
    color: #fff;
    border-radius: 4px;
    cursor: pointer;
    flex-shrink: 0;
    transition: background 0.15s;
  }

  .layer-close-btn:hover {
    background: rgba(255, 255, 255, 0.28);
  }
}

.theme-dark .layer-panel {
  background: #2a2a2a;
  border-right: 1px solid #444;
}

.layer-header {
  padding: 0 15px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #343a40;
  flex-shrink: 0;
}

.theme-light .layer-header {
  background: #4a5568;
}

.layer-header h4 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: #fff;
  letter-spacing: 0.3px;
}

.layer-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.layer-item {
  display: flex;
  align-items: center;
  padding: 7px 8px;
  margin-bottom: 2px;
  border-radius: 4px;
  cursor: pointer;
  transition: background-color 0.15s;
  gap: 8px;
  background: #fff;
  border: 1px solid #eee;
}

.theme-dark .layer-item {
  background: #3a3a3a;
  border: 1px solid #4a4a4a;
}

.layer-item:hover {
  background: #f1f1f1;
}

.theme-dark .layer-item:hover {
  background: #454545;
}

.layer-item.selected {
  background: rgba(59, 130, 246, 0.08);
  outline: 1px solid rgba(59, 130, 246, 0.35);
  outline-offset: -1px;
}

.theme-dark .layer-item.selected {
  background: rgba(74, 158, 255, 0.1);
  outline: 1px solid rgba(74, 158, 255, 0.3);
}

.visibility-btn {
  padding: 2px;
  border: none;
  background: none;
  cursor: pointer;
  color: #666;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0.7;
  transition: opacity 0.15s;
  flex-shrink: 0;
}

.theme-dark .visibility-btn {
  color: #999;
}

.visibility-btn:hover {
  opacity: 1;
  color: #333;
}

.theme-dark .visibility-btn:hover {
  color: #ccc;
}

.visibility-btn :deep(svg) {
  width: 15px;
  height: 15px;
}

.layer-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  color: #666;
  flex-shrink: 0;
}

.theme-dark .layer-icon {
  color: #999;
}

.layer-icon :deep(svg) {
  width: 15px;
  height: 15px;
}

.layer-name {
  flex: 1;
  font-size: 12px;
  color: #333;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.theme-dark .layer-name {
  color: #e0e0e0;
}

.layer-action {
  padding: 2px;
  width: 20px;
  height: 20px;
  border: none;
  background: none;
  color: #999;
  border-radius: 3px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: all 0.15s;
  flex-shrink: 0;
}

.layer-item:hover .layer-action {
  opacity: 0.6;
}

.layer-action:hover {
  opacity: 1 !important;
  color: #dc3545;
  background: rgba(220, 53, 69, 0.1);
}

.layer-action :deep(svg) {
  width: 13px;
  height: 13px;
}

.empty-state {
  padding: 40px 20px;
  text-align: center;
  color: #999;
  font-size: 12px;
}

.theme-dark .empty-state {
  color: #666;
}

.layer-footer {
  padding: 10px 8px;
  border-top: 1px solid #ddd;
  flex-shrink: 0;
  background: #f8f9fa;
}

.theme-dark .layer-footer {
  border-top: 1px solid #444;
  background: #2a2a2a;
}

.settings-btn {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border: none;
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.04);
  color: #555;
  font-size: 13px;
  font-family: "Segoe UI", sans-serif;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.theme-dark .settings-btn {
  background: rgba(255, 255, 255, 0.05);
  color: #aaa;
}

.settings-btn:hover {
  background: rgba(0, 0, 0, 0.08);
  color: #222;
}

.theme-dark .settings-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}

.settings-icon {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.settings-icon :deep(svg) {
  width: 15px;
  height: 15px;
}

/* Scrollbar styling */
.layer-list::-webkit-scrollbar {
  width: 6px;
}

.layer-list::-webkit-scrollbar-track {
  background: transparent;
}

.layer-list::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.15);
  border-radius: 3px;
}

.layer-list::-webkit-scrollbar-thumb:hover {
  background: rgba(0, 0, 0, 0.25);
}
</style>
