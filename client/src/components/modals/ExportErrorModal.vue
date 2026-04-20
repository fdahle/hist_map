<template>
  <teleport to="body">
    <div v-if="isVisible" class="eem-backdrop" @click.self="close">
      <div class="eem-modal">
        <div class="eem-header">
          <span class="eem-icon" v-html="ICON_WARNING"></span>
          <h3 class="eem-title">Export Failed</h3>
          <button class="eem-close" @click="close" title="Close">
            <span v-html="ICON_CLOSE"></span>
          </button>
        </div>

        <div class="eem-body">
          <p class="eem-message">
            The map could not be exported because all visible layers use cross-origin
            tiles that the browser blocks from canvas export due to CORS restrictions.
          </p>
          <div class="eem-hint">
            <span class="eem-hint-icon" v-html="ICON_INFO"></span>
            <span>
              Add at least one of your own data layers (GeoJSON, GeoTIFF, Shapefile, …)
              and make sure it is visible. User-uploaded layers are served from the same
              origin and are always exportable.
            </span>
          </div>
        </div>

        <div class="eem-footer">
          <button class="eem-btn-primary" @click="close">Got it</button>
        </div>
      </div>
    </div>
  </teleport>
</template>

<script setup>
import { watch, onUnmounted } from 'vue';
import { ICON_INFO, ICON_CLOSE } from '@/constants/icons.js';

const ICON_WARNING = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><circle cx="12" cy="17" r="0.5" fill="currentColor"/></svg>`;

const props = defineProps({
  isVisible: { type: Boolean, default: false },
});

const emit = defineEmits(['close']);
const close = () => emit('close');

const handleEsc = (e) => { if (e.key === 'Escape') close(); };

watch(() => props.isVisible, (val) => {
  if (val) document.addEventListener('keydown', handleEsc);
  else document.removeEventListener('keydown', handleEsc);
});

onUnmounted(() => document.removeEventListener('keydown', handleEsc));
</script>

<style scoped>
.eem-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
}

.eem-modal {
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.25);
  min-width: 320px;
  max-width: 440px;
  width: 90%;
  font-family: "Segoe UI", sans-serif;
  overflow: hidden;
}

.theme-dark .eem-modal {
  background: #2a2a2a;
  color: #e0e0e0;
}

.eem-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px 16px;
  background: #b45309;
  color: #fff;
}

.eem-icon {
  flex-shrink: 0;
  display: flex;
  align-items: center;
}

.eem-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  flex: 1;
  color: #fff;
}

.eem-close {
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.75);
  cursor: pointer;
  padding: 4px;
  display: flex;
  align-items: center;
  border-radius: 4px;
  transition: background 0.15s;
}
.eem-close:hover { background: rgba(255, 255, 255, 0.15); color: #fff; }

.eem-body {
  padding: 18px 20px 14px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.eem-message {
  margin: 0;
  font-size: 13.5px;
  line-height: 1.55;
  color: #333;
}

.theme-dark .eem-message {
  color: #ccc;
}

.eem-hint {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  background: #f0f9ff;
  border: 1px solid #bae6fd;
  border-radius: 6px;
  padding: 10px 12px;
  font-size: 12.5px;
  line-height: 1.5;
  color: #0369a1;
}

.theme-dark .eem-hint {
  background: #1a2a35;
  border-color: #1e4d6b;
  color: #7cc8f0;
}

.eem-hint-icon {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  margin-top: 1px;
}

.eem-footer {
  display: flex;
  justify-content: flex-end;
  padding: 10px 20px 16px;
}

.eem-btn-primary {
  background: #b45309;
  color: #fff;
  border: none;
  border-radius: 5px;
  padding: 7px 22px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s;
}
.eem-btn-primary:hover { background: #92400e; }
</style>
