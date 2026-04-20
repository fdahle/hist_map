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
        Map Bookmarks
      </h3>
      <button class="header-btn close-btn" title="Close" @click="$emit('close')">
        <span v-html="ICON_CLOSE" />
      </button>
    </div>

    <div class="modal-body">
      <div class="instructions">
        Save named map positions and jump back with one click.
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
          title="Save current map position"
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
            <button class="go-btn" :title="`Go to ${bm.name}`" @click="applyBookmark(bm)">
              Go
            </button>
            <button class="del-btn" title="Delete" @click="removeBookmark(i)">
              <span v-html="ICON_TRASH" />
            </button>
          </div>
        </div>
      </div>

      <div v-else class="empty-state">
        No bookmarks yet.
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onUnmounted } from 'vue';
import { useMapStore } from '@/stores/map/mapStore';
import { ICON_CLOSE, ICON_TRASH, ICON_BOOKMARK_ADD } from '@/constants/icons';

defineProps({
  isVisible: { type: Boolean, default: false },
});

defineEmits(['close']);

const mapStore = useMapStore();

const STORAGE_KEY = 'histmap_map_bookmarks';

const _load = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
};

const bookmarks = ref(_load());
const newName = ref('');

const _save = () => {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(bookmarks.value)); } catch { /* ignore */ }
};

const saveView = () => {
  const name = newName.value.trim();
  if (!name) return;
  const map = mapStore.getMap();
  if (!map) return;
  const view = map.getView();
  const center = view.getCenter();
  const zoom = view.getZoom();
  const projection = view.getProjection().getCode();
  bookmarks.value.push({ name, center, zoom, projection });
  _save();
  newName.value = '';
};

const applyBookmark = async (bm) => {
  const map = mapStore.getMap();
  if (!map) return;
  const view = map.getView();
  const currentProj = view.getProjection().getCode();
  let center = bm.center;
  if (bm.projection && bm.projection !== currentProj) {
    try {
      const { transform } = await import('ol/proj');
      center = transform(bm.center, bm.projection, currentProj);
    } catch { /* use as-is */ }
  }
  view.animate({ center, zoom: bm.zoom, duration: 600 });
};

const removeBookmark = (index) => {
  bookmarks.value.splice(index, 1);
  _save();
};

// --- drag ---
const modalRef = ref(null);
const isDragging = ref(false);
const dragOffset = ref({ x: 0, y: 0 });
const position = ref({ x: window.innerWidth - 330, y: 160 });

const modalStyle = computed(() => ({
  left: `${position.value.x}px`,
  top: `${position.value.y}px`,
}));

const startDrag = (e) => {
  if (!e.target.closest('.modal-header')) return;
  if (e.target.closest('.close-btn')) return;
  isDragging.value = true;
  dragOffset.value = { x: e.clientX - position.value.x, y: e.clientY - position.value.y };
  document.addEventListener('mousemove', onDrag);
  document.addEventListener('mouseup', stopDrag);
  e.preventDefault();
};

const onDrag = (e) => {
  if (!isDragging.value) return;
  const w = modalRef.value?.offsetWidth || 300;
  const h = modalRef.value?.offsetHeight || 300;
  position.value = {
    x: Math.max(0, Math.min(e.clientX - dragOffset.value.x, window.innerWidth - w)),
    y: Math.max(0, Math.min(e.clientY - dragOffset.value.y, window.innerHeight - h)),
  };
};

const stopDrag = () => {
  isDragging.value = false;
  document.removeEventListener('mousemove', onDrag);
  document.removeEventListener('mouseup', stopDrag);
};

onUnmounted(() => {
  document.removeEventListener('mousemove', onDrag);
  document.removeEventListener('mouseup', stopDrag);
});
</script>

<style scoped>
.bookmarks-modal {
  position: fixed;
  width: 300px;
  max-height: 480px;
  background: rgba(255, 255, 255, 0.97);
  border: 1px solid #d1d5db;
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
  color: #333;
  font-family: 'Segoe UI', sans-serif;
  display: flex;
  flex-direction: column;
  z-index: 1500;
  backdrop-filter: blur(10px);
}

.theme-dark .bookmarks-modal {
  background: rgba(30, 30, 30, 0.95);
  border-color: #444;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.6);
  color: #e0e0e0;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid #e5e7eb;
  background: rgba(248, 249, 250, 0.95);
  border-radius: 8px 8px 0 0;
  cursor: move;
  user-select: none;
}

.theme-dark .modal-header {
  border-bottom-color: #444;
  background: rgba(40, 40, 40, 0.8);
}

.modal-header h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 8px;
  color: #1f2937;
}

.theme-dark .modal-header h3 {
  color: #fff;
}

.modal-header h3 :deep(svg) {
  width: 16px;
  height: 16px;
  stroke: #3b82f6;
}

.theme-dark .modal-header h3 :deep(svg) {
  stroke: #4a9eff;
}

.header-btn {
  background: none;
  border: none;
  color: #6b7280;
  cursor: pointer;
  padding: 4px;
  display: flex;
  align-items: center;
  border-radius: 4px;
  transition: all 0.2s;
}

.theme-dark .header-btn {
  color: #aaa;
}

.header-btn:hover {
  background: rgba(0, 0, 0, 0.06);
  color: #111;
}

.theme-dark .header-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
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
  color: #6b7280;
  margin-bottom: 14px;
  padding: 8px 12px;
  background: rgba(59, 130, 246, 0.07);
  border-left: 3px solid #3b82f6;
  border-radius: 4px;
  line-height: 1.5;
}

.theme-dark .instructions {
  color: #aaa;
  background: rgba(74, 158, 255, 0.1);
  border-left-color: #4a9eff;
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
  background: #fff;
  border: 1px solid #d1d5db;
  border-radius: 5px;
  color: #1f2937;
  outline: none;
  transition: border-color 0.2s;
}

.name-input::placeholder { color: #9ca3af; }

.name-input:focus {
  border-color: #3b82f6;
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.15);
}

.theme-dark .name-input {
  background: rgba(255, 255, 255, 0.06);
  border-color: #555;
  color: #e0e0e0;
}

.theme-dark .name-input::placeholder { color: #666; }

.theme-dark .name-input:focus {
  border-color: #4a9eff;
  box-shadow: 0 0 0 2px rgba(74, 158, 255, 0.15);
}

.save-btn {
  padding: 6px 12px;
  font-size: 12px;
  font-weight: 500;
  background: rgba(59, 130, 246, 0.1);
  border: 1px solid rgba(59, 130, 246, 0.3);
  color: #2563eb;
  border-radius: 5px;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.2s;
}

.save-btn:hover:not(:disabled) {
  background: rgba(59, 130, 246, 0.2);
  border-color: rgba(59, 130, 246, 0.5);
}

.save-btn:disabled { opacity: 0.35; cursor: not-allowed; }

.theme-dark .save-btn {
  background: rgba(74, 158, 255, 0.12);
  border-color: rgba(74, 158, 255, 0.35);
  color: #4a9eff;
}

.theme-dark .save-btn:hover:not(:disabled) {
  background: rgba(74, 158, 255, 0.25);
  border-color: rgba(74, 158, 255, 0.55);
}

.bookmark-list h4 {
  margin: 0 0 10px 0;
  font-size: 11px;
  font-weight: 600;
  color: #9ca3af;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.theme-dark .bookmark-list h4 { color: #888; }

.bookmark-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 9px 12px;
  background: #f8f9fa;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  margin-bottom: 6px;
  transition: all 0.15s;
}

.theme-dark .bookmark-item {
  background: rgba(255, 255, 255, 0.04);
  border-color: #3a3a3a;
}

.bookmark-item:hover {
  background: #eff6ff;
  border-color: #bfdbfe;
}

.theme-dark .bookmark-item:hover {
  background: rgba(255, 255, 255, 0.07);
  border-color: #505050;
}

.bm-info {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
}

.bm-name {
  font-size: 13px;
  color: #1f2937;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.theme-dark .bm-name { color: #ddd; }

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
  background: rgba(59, 130, 246, 0.08);
  border: 1px solid rgba(59, 130, 246, 0.25);
  color: #2563eb;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.15s;
}

.go-btn:hover {
  background: rgba(59, 130, 246, 0.18);
  border-color: rgba(59, 130, 246, 0.5);
}

.theme-dark .go-btn {
  background: rgba(74, 158, 255, 0.12);
  border-color: rgba(74, 158, 255, 0.3);
  color: #4a9eff;
}

.theme-dark .go-btn:hover {
  background: rgba(74, 158, 255, 0.25);
  border-color: rgba(74, 158, 255, 0.5);
}

.del-btn {
  background: none;
  border: none;
  color: #9ca3af;
  cursor: pointer;
  padding: 4px 6px;
  display: flex;
  align-items: center;
  border-radius: 4px;
  transition: all 0.15s;
}

.del-btn:hover {
  color: #dc2626;
  background: rgba(220, 38, 38, 0.08);
}

.theme-dark .del-btn { color: #666; }

.theme-dark .del-btn:hover {
  color: #ff5050;
  background: rgba(255, 80, 80, 0.15);
}

.del-btn :deep(svg) { width: 12px; height: 12px; }

.empty-state {
  padding: 24px;
  text-align: center;
  color: #9ca3af;
  font-size: 12px;
}

.theme-dark .empty-state { color: #666; }

.modal-body::-webkit-scrollbar { width: 6px; }
.modal-body::-webkit-scrollbar-track { background: rgba(0,0,0,0.05); border-radius: 3px; }
.modal-body::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.15); border-radius: 3px; }
.modal-body::-webkit-scrollbar-thumb:hover { background: rgba(0,0,0,0.25); }
.theme-dark .modal-body::-webkit-scrollbar-track { background: rgba(0,0,0,0.2); }
.theme-dark .modal-body::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.25); }
</style>
