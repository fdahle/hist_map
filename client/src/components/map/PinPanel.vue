<template>
  <Transition name="pin-panel-slide">
    <div v-if="isOpen" class="pin-panel" :style="panelStyle" ref="panelRef">
      <div class="pin-panel-header" @mousedown="startDrag">
        <span class="pin-panel-title">📌 Pins <span class="pin-count">({{ pins.length }})</span></span>
        <button class="pin-panel-close" @click="$emit('close')" title="Close">✕</button>
      </div>

      <div v-if="pins.length === 0" class="pin-panel-empty">
        Right-click the map and choose<br><strong>Place Pin…</strong> to add a pin.<br><small>(available while this panel is open)</small>
      </div>

      <ul v-else class="pin-list">
        <li v-for="pin in pins" :key="pin.id" class="pin-item">
          <span class="pin-item-icon">📌</span>
          <span
            class="pin-item-label"
            :title="pin.label"
            @dblclick="startInlineEdit(pin)"
          >
            <template v-if="editingPinId === pin.id">
              <input
                ref="inlineEditInput"
                v-model="editingLabel"
                class="pin-inline-input"
                maxlength="80"
                @keydown.enter="commitInlineEdit"
                @keydown.escape="editingPinId = null"
                @blur="commitInlineEdit"
                @click.stop
              />
            </template>
            <template v-else>{{ pin.label }}</template>
          </span>
          <div class="pin-item-actions">
            <button class="pin-action-btn" @click="zoomToPin(pin)" title="Zoom to pin">
              <span v-html="ICON_FLY"></span>
            </button>
            <button class="pin-action-btn pin-action-delete" @click="pinStore.removePin(pin.id)" title="Delete pin">
              <span v-html="ICON_TRASH"></span>
            </button>
          </div>
        </li>
      </ul>

      <div v-if="pins.length > 0" class="pin-panel-footer">
        <button class="pin-clear-btn" @click="pinStore.clearPins()">Clear all</button>
      </div>
    </div>
  </Transition>
</template>

<script setup>
import { ref, nextTick, computed, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { usePinStore } from '@/stores/map/pinStore';
import { useMapStore } from '@/stores/map/mapStore';

const props = defineProps({ isOpen: { type: Boolean, default: false } });
defineEmits(['close']);

// ---- Dragging ----
const panelRef = ref(null);
const dragPos = ref(null); // { top, left } or null for default position

const panelStyle = computed(() => {
  if (!dragPos.value) return {};
  return {
    top: dragPos.value.top + 'px',
    left: dragPos.value.left + 'px',
    right: 'auto',
  };
});

// Reset position when panel is re-opened
watch(() => props.isOpen, (open) => {
  if (open) dragPos.value = null;
});

const startDrag = (e) => {
  // Don't drag when clicking the close button
  if (e.target.closest('.pin-panel-close')) return;
  e.preventDefault();
  const panel = panelRef.value;
  if (!panel) return;
  const rect = panel.getBoundingClientRect();
  const parentRect = (panel.offsetParent || document.documentElement).getBoundingClientRect();
  const offsetX = e.clientX - rect.left;
  const offsetY = e.clientY - rect.top;

  const onMove = (me) => {
    dragPos.value = {
      top: me.clientY - parentRect.top - offsetY,
      left: me.clientX - parentRect.left - offsetX,
    };
  };
  const onUp = () => {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
  };
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
};

const ICON_FLY   = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>`;
const ICON_TRASH = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>`;

const pinStore = usePinStore();
const mapStore = useMapStore();
const { pins } = storeToRefs(pinStore);

const editingPinId = ref(null);
const editingLabel = ref('');
const inlineEditInput = ref(null);

const startInlineEdit = (pin) => {
  editingPinId.value = pin.id;
  editingLabel.value = pin.label;
  nextTick(() => {
    if (Array.isArray(inlineEditInput.value)) {
      inlineEditInput.value[0]?.focus();
    } else {
      inlineEditInput.value?.focus();
    }
  });
};

const commitInlineEdit = () => {
  if (editingPinId.value) {
    pinStore.updatePin(editingPinId.value, editingLabel.value);
  }
  editingPinId.value = null;
};

const zoomToPin = (pin) => {
  const map = mapStore.getMap();
  if (!map) return;
  map.getView().animate({ center: pin.coordinate, zoom: Math.max(map.getView().getZoom() ?? 14, 14), duration: 600 });
};
</script>

<style scoped>
.pin-panel {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 4000;
  background: #fff;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  box-shadow: 0 4px 20px rgba(0,0,0,0.15);
  width: 240px;
  max-height: calc(100% - 80px);
  display: flex;
  flex-direction: column;
  font-family: "Segoe UI", sans-serif;
  font-size: 13px;
  overflow: hidden;
}

.pin-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 9px 12px 8px;
  background: #f8f9fa;
  border-bottom: 1px solid #e9ecef;
  flex-shrink: 0;
  cursor: move;
  user-select: none;
}

.pin-panel-title {
  font-weight: 600;
  font-size: 13px;
  color: #333;
}

.pin-count {
  font-weight: 400;
  color: #888;
}

.pin-panel-close {
  background: none;
  border: none;
  cursor: pointer;
  color: #888;
  font-size: 14px;
  padding: 0 3px;
  line-height: 1;
}
.pin-panel-close:hover { color: #333; }

.pin-panel-empty {
  padding: 20px 14px;
  color: #888;
  text-align: center;
  font-size: 12px;
  line-height: 1.6;
}

.pin-list {
  list-style: none;
  margin: 0;
  padding: 4px 0;
  overflow-y: auto;
  flex: 1;
}

.pin-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px 5px 12px;
  border-bottom: 1px solid #f3f4f6;
  transition: background 0.1s;
}
.pin-item:hover { background: #f9fafb; }
.pin-item:last-child { border-bottom: none; }

.pin-item-icon {
  flex-shrink: 0;
  font-size: 13px;
}

.pin-item-label {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: default;
  color: #333;
  font-size: 12px;
}

.pin-inline-input {
  width: 100%;
  padding: 2px 4px;
  border: 1px solid #3b82f6;
  border-radius: 3px;
  font-size: 12px;
  font-family: "Segoe UI", sans-serif;
  outline: none;
  box-shadow: 0 0 0 2px rgba(59,130,246,0.2);
}

.pin-item-actions {
  display: flex;
  gap: 3px;
  flex-shrink: 0;
}

.pin-action-btn {
  background: none;
  border: none;
  cursor: pointer;
  padding: 3px 4px;
  border-radius: 3px;
  color: #666;
  display: flex;
  align-items: center;
  transition: background 0.1s, color 0.1s;
}
.pin-action-btn:hover { background: #e5e7eb; color: #333; }
.pin-action-delete:hover { background: #fee2e2; color: #dc2626; }

.pin-panel-footer {
  padding: 7px 12px;
  border-top: 1px solid #e9ecef;
  flex-shrink: 0;
}

.pin-clear-btn {
  background: none;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  padding: 3px 10px;
  font-size: 11px;
  color: #666;
  cursor: pointer;
  font-family: "Segoe UI", sans-serif;
}
.pin-clear-btn:hover { background: #fee2e2; border-color: #fca5a5; color: #dc2626; }

/* Slide-in animation */
.pin-panel-slide-enter-active,
.pin-panel-slide-leave-active {
  transition: opacity 0.18s, transform 0.18s;
}
.pin-panel-slide-enter-from,
.pin-panel-slide-leave-to {
  opacity: 0;
  transform: translateY(-6px) scale(0.97);
}

/* Dark theme */
.theme-dark .pin-panel {
  background: #2a2a2a;
  border-color: #555;
  color: #e0e0e0;
}
.theme-dark .pin-panel-header { background: #222; border-bottom-color: #444; }
.theme-dark .pin-panel-title { color: #e0e0e0; }
.theme-dark .pin-item { border-bottom-color: #3a3a3a; }
.theme-dark .pin-item:hover { background: #333; }
.theme-dark .pin-item-label { color: #e0e0e0; }
.theme-dark .pin-panel-footer { border-top-color: #444; }
.theme-dark .pin-clear-btn { border-color: #555; color: #aaa; background: none; }
.theme-dark .pin-clear-btn:hover { background: #3d1212; border-color: #7f1d1d; color: #fca5a5; }
.theme-dark .pin-action-btn { color: #aaa; }
.theme-dark .pin-action-btn:hover { background: #444; color: #e0e0e0; }
.theme-dark .pin-action-delete:hover { background: #3d1212; color: #fca5a5; }
.theme-dark .pin-panel-empty { color: #888; }
.theme-dark .pin-panel-close { color: #aaa; }
.theme-dark .pin-panel-close:hover { color: #e0e0e0; }
.theme-dark .pin-count { color: #777; }
</style>
