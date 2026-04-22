<template>
  <div
    v-if="isVisible"
    ref="modalRef"
    class="coord-modal"
    :style="modalStyle"
    @mousedown="startDrag"
  >
    <div class="modal-header">
      <h3>
        <span v-html="ICON_PICK_XYZ" />
        XYZ Coordinate Picker
      </h3>
      <button class="header-btn close-btn" title="Close (disables pick mode)" @click="$emit('close')">
        <span v-html="ICON_CLOSE" />
      </button>
    </div>

    <div class="modal-body">
      <div class="instructions">
        Click any surface in the scene to read its coordinates.
      </div>

      <div v-if="pickedCoord" class="coord-display">
        <div class="coord-row">
          <span class="axis x">X</span>
          <span class="coord-value">{{ pickedCoord.x.toFixed(4) }}</span>
          <button class="copy-btn" title="Copy X" @click="copyToClipboard(pickedCoord.x.toFixed(4))">
            <span v-html="ICON_COPY" />
          </button>
        </div>
        <div class="coord-row">
          <span class="axis y">Y</span>
          <span class="coord-value">{{ pickedCoord.y.toFixed(4) }}</span>
          <button class="copy-btn" title="Copy Y" @click="copyToClipboard(pickedCoord.y.toFixed(4))">
            <span v-html="ICON_COPY" />
          </button>
        </div>
        <div class="coord-row">
          <span class="axis z">Z</span>
          <span class="coord-value">{{ pickedCoord.z.toFixed(4) }}</span>
          <button class="copy-btn" title="Copy Z" @click="copyToClipboard(pickedCoord.z.toFixed(4))">
            <span v-html="ICON_COPY" />
          </button>
        </div>
        <button class="copy-all-btn" @click="copyAll">
          Copy All
        </button>
      </div>

      <div v-else class="empty-state">
        No point picked yet.
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { useViewer3DStore } from '@/stores/viewer3D/viewer3dStore';
import { storeToRefs } from 'pinia';
import { ICON_CLOSE, ICON_PICK_XYZ } from '@/constants/icons';
import { copyToClipboard } from '@/utils/clipboard';
import { useModalDrag } from '@/composables/useModalDrag';

const ICON_COPY = `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;

defineProps({
  isVisible: { type: Boolean, default: false },
});

defineEmits(['close']);

const viewer3DStore = useViewer3DStore();
const { pickedCoord } = storeToRefs(viewer3DStore);

const modalRef = ref(null);
const { modalStyle, startDrag } = useModalDrag(modalRef, { initialX: window.innerWidth - 330, initialY: 80 });

const copyAll = () => {
  if (!pickedCoord.value) return;
  const { x, y, z } = pickedCoord.value;
  copyToClipboard(`${x.toFixed(4)}, ${y.toFixed(4)}, ${z.toFixed(4)}`);
};
</script>

<style scoped>
.coord-modal {
  position: fixed;
  width: 280px;
  background: rgba(30, 30, 30, 0.95);
  border: 1px solid #444;
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.6);
  color: #e0e0e0;
  font-family: 'Segoe UI', sans-serif;
  display: flex;
  flex-direction: column;
  z-index: 1000;
  backdrop-filter: blur(10px);
}

.theme-light .coord-modal {
  background: rgba(255, 255, 255, 0.95);
  border: 1px solid #ccc;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
  color: #333;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
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
  font-size: 14px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 8px;
  color: #fff;
}

.theme-light .modal-header h3 {
  color: #333;
}

.modal-header h3 :deep(svg) {
  width: 16px;
  height: 16px;
  stroke: #4a9eff;
}

.theme-light .modal-header h3 :deep(svg) {
  stroke: #2563eb;
}

.header-btn {
  background: none;
  border: none;
  color: #aaa;
  cursor: pointer;
  padding: 4px;
  display: flex;
  align-items: center;
  border-radius: 4px;
  transition: all 0.2s;
}

.theme-light .header-btn {
  color: #666;
}

.header-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}

.theme-light .header-btn:hover {
  background: rgba(0, 0, 0, 0.05);
  color: #333;
}

.header-btn :deep(svg) {
  width: 14px;
  height: 14px;
}

.modal-body {
  padding: 14px 16px;
  user-select: text;
  cursor: auto;
}

.instructions {
  font-size: 12px;
  color: #aaa;
  margin-bottom: 14px;
  padding: 8px 12px;
  background: rgba(74, 158, 255, 0.1);
  border-left: 3px solid #4a9eff;
  border-radius: 4px;
  line-height: 1.5;
}

.theme-light .instructions {
  color: #666;
  background: rgba(59, 130, 246, 0.1);
  border-left-color: #3b82f6;
}

.coord-display {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.coord-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid #3a3a3a;
  border-radius: 6px;
}

.theme-light .coord-row {
  background: #f8f9fa;
  border-color: #e0e0e0;
}

.axis {
  font-size: 11px;
  font-weight: 700;
  width: 14px;
  text-align: center;
  letter-spacing: 0.05em;
}

.axis.x { color: #f87171; }
.axis.y { color: #4ade80; }
.axis.z { color: #60a5fa; }

.coord-value {
  flex: 1;
  font-family: 'Courier New', monospace;
  font-size: 13px;
  color: #e8e8e8;
}

.theme-light .coord-value {
  color: #222;
}

.copy-btn {
  background: none;
  border: none;
  color: #666;
  cursor: pointer;
  padding: 2px 4px;
  border-radius: 3px;
  display: flex;
  align-items: center;
  transition: all 0.15s;
}

.copy-btn:hover {
  color: #4a9eff;
  background: rgba(74, 158, 255, 0.1);
}

.theme-light .copy-btn:hover {
  color: #2563eb;
  background: rgba(59, 130, 246, 0.1);
}

.copy-all-btn {
  margin-top: 4px;
  width: 100%;
  padding: 6px 12px;
  background: rgba(74, 158, 255, 0.08);
  border: 1px solid rgba(74, 158, 255, 0.25);
  color: #4a9eff;
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 500;
  transition: all 0.2s;
}

.copy-all-btn:hover {
  background: rgba(74, 158, 255, 0.18);
  border-color: rgba(74, 158, 255, 0.45);
}

.theme-light .copy-all-btn {
  background: rgba(59, 130, 246, 0.08);
  border-color: rgba(59, 130, 246, 0.25);
  color: #2563eb;
}

.theme-light .copy-all-btn:hover {
  background: rgba(59, 130, 246, 0.15);
}

.empty-state {
  padding: 20px;
  text-align: center;
  color: #666;
  font-size: 12px;
}

.theme-light .empty-state {
  color: #999;
}
</style>
