<template>
  <div
    v-if="isVisible"
    ref="modalRef"
    class="bookmarks-modal"
    :style="modalStyle"
    @mousedown="startDrag"
  >
    <div class="modal-header">
      <h3>
        <span v-html="ICON_BOOKMARK_ADD" />
        Scene Bookmarks
      </h3>
      <button class="header-btn close-btn" title="Close" @click="$emit('close')">
        <span v-html="ICON_CLOSE" />
      </button>
    </div>

    <div class="modal-body">
      <div class="instructions">
        Save named camera viewpoints and jump back with one click.
      </div>

      <!-- Save current view -->
      <div class="save-row">
        <input
          v-model="newName"
          class="name-input"
          placeholder="Bookmark name…"
          maxlength="48"
          @keydown.enter="saveView"
        />
        <button
          class="save-btn"
          :disabled="!newName.trim()"
          title="Save current camera view"
          @click="saveView"
        >
          Save View
        </button>
      </div>

      <!-- Bookmark list -->
      <div v-if="bookmarks.length > 0" class="bookmark-list">
        <h4>Saved Views</h4>
        <div
          v-for="(bm, i) in bookmarks"
          :key="i"
          class="bookmark-item"
        >
          <div class="bm-info">
            <span class="bm-name">{{ bm.name }}</span>
          </div>
          <div class="bm-actions">
            <button class="go-btn" :title="`Go to ${bm.name}`" @click="$emit('apply-bookmark', bm)">
              Go
            </button>
            <button class="del-btn" title="Delete" @click="removeBookmark(i)">
              <span v-html="ICON_TRASH" />
            </button>
          </div>
        </div>
      </div>

      <div v-else-if="!bookmarks.length" class="empty-state">
        No bookmarks yet.
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { useViewer3DStore } from '@/stores/viewer3D/viewer3dStore';
import { storeToRefs } from 'pinia';
import { ICON_CLOSE, ICON_TRASH, ICON_BOOKMARK_ADD } from '@/constants/icons';
import { useModalDrag } from '@/composables/useModalDrag';

defineProps({
  isVisible: { type: Boolean, default: false },
});

defineEmits(['close', 'apply-bookmark']);

const viewer3DStore = useViewer3DStore();
const { bookmarks, camera, controls } = storeToRefs(viewer3DStore);
const { addBookmark, removeBookmark } = viewer3DStore;

const newName = ref('');

const saveView = () => {
  const name = newName.value.trim();
  if (!name || !camera.value || !controls.value) return;
  addBookmark(name, camera.value.position, controls.value.target);
  newName.value = '';
};

const modalRef = ref(null);
const { modalStyle, startDrag } = useModalDrag(modalRef, { initialX: window.innerWidth - 330, initialY: 160 });
</script>

<style scoped>
.bookmarks-modal {
  position: fixed;
  width: 300px;
  max-height: 480px;
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

.theme-light .bookmarks-modal {
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
  flex: 1;
  overflow-y: auto;
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

.save-row {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}

.name-input {
  flex: 1;
  padding: 6px 10px;
  font-size: 12px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid #555;
  border-radius: 5px;
  color: #e0e0e0;
  outline: none;
  transition: border-color 0.2s;
}

.name-input::placeholder {
  color: #666;
}

.name-input:focus {
  border-color: #4a9eff;
  box-shadow: 0 0 0 2px rgba(74, 158, 255, 0.15);
}

.theme-light .name-input {
  background: #fff;
  border-color: #ccc;
  color: #333;
}

.theme-light .name-input::placeholder {
  color: #aaa;
}

.theme-light .name-input:focus {
  border-color: #3b82f6;
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.15);
}

.save-btn {
  padding: 6px 12px;
  font-size: 12px;
  font-weight: 500;
  background: rgba(74, 158, 255, 0.12);
  border: 1px solid rgba(74, 158, 255, 0.35);
  color: #4a9eff;
  border-radius: 5px;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.2s;
}

.save-btn:hover:not(:disabled) {
  background: rgba(74, 158, 255, 0.25);
  border-color: rgba(74, 158, 255, 0.55);
}

.save-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.theme-light .save-btn {
  background: rgba(59, 130, 246, 0.1);
  border-color: rgba(59, 130, 246, 0.3);
  color: #2563eb;
}

.theme-light .save-btn:hover:not(:disabled) {
  background: rgba(59, 130, 246, 0.2);
}

.bookmark-list h4 {
  margin: 0 0 10px 0;
  font-size: 11px;
  font-weight: 600;
  color: #888;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.theme-light .bookmark-list h4 {
  color: #6c757d;
}

.bookmark-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 9px 12px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid #3a3a3a;
  border-radius: 6px;
  margin-bottom: 6px;
  transition: all 0.15s;
}

.theme-light .bookmark-item {
  background: #f8f9fa;
  border-color: #e0e0e0;
}

.bookmark-item:hover {
  background: rgba(255, 255, 255, 0.07);
  border-color: #505050;
}

.theme-light .bookmark-item:hover {
  background: #eef2ff;
  border-color: #c7d2fe;
}

.bm-info {
  flex: 1;
  min-width: 0;
}

.bm-name {
  font-size: 13px;
  color: #ddd;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  display: block;
}

.theme-light .bm-name {
  color: #333;
}

.bm-actions {
  display: flex;
  align-items: center;
  gap: 5px;
  flex-shrink: 0;
}

.go-btn {
  padding: 4px 10px;
  font-size: 11px;
  font-weight: 600;
  background: rgba(74, 158, 255, 0.12);
  border: 1px solid rgba(74, 158, 255, 0.3);
  color: #4a9eff;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.15s;
}

.go-btn:hover {
  background: rgba(74, 158, 255, 0.25);
  border-color: rgba(74, 158, 255, 0.5);
}

.theme-light .go-btn {
  background: rgba(59, 130, 246, 0.08);
  border-color: rgba(59, 130, 246, 0.25);
  color: #2563eb;
}

.theme-light .go-btn:hover {
  background: rgba(59, 130, 246, 0.18);
}

.del-btn {
  background: none;
  border: none;
  color: #666;
  cursor: pointer;
  padding: 4px 6px;
  display: flex;
  align-items: center;
  border-radius: 4px;
  transition: all 0.15s;
}

.del-btn:hover {
  color: #ff5050;
  background: rgba(255, 80, 80, 0.15);
}

.theme-light .del-btn:hover {
  color: #dc3545;
  background: rgba(220, 53, 69, 0.1);
}

.del-btn :deep(svg) {
  width: 12px;
  height: 12px;
}

.empty-state {
  padding: 24px;
  text-align: center;
  color: #666;
  font-size: 12px;
}

.theme-light .empty-state {
  color: #999;
}

/* Scrollbar */
.modal-body::-webkit-scrollbar { width: 6px; }
.modal-body::-webkit-scrollbar-track { background: rgba(0, 0, 0, 0.2); border-radius: 3px; }
.modal-body::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.25); border-radius: 3px; }
.modal-body::-webkit-scrollbar-thumb:hover { background: rgba(255, 255, 255, 0.4); }
.theme-light .modal-body::-webkit-scrollbar-track { background: rgba(0, 0, 0, 0.05); }
.theme-light .modal-body::-webkit-scrollbar-thumb { background: rgba(0, 0, 0, 0.15); }
</style>
