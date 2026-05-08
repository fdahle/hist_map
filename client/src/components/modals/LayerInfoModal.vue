<template>
  <teleport to="body">
    <Transition name="lim-fade">
    <div v-if="isVisible" class="lim-backdrop" @click.self="close">
      <div class="lim-modal">
        <div class="lim-header">
          <span class="lim-icon" v-html="ICON_INFO"></span>
          <h3 class="lim-title">{{ title }}</h3>
          <button class="lim-close" @click="close" title="Close">
            <span v-html="ICON_CLOSE"></span>
          </button>
        </div>

        <div class="lim-body">
          <div v-if="description" class="lim-description">{{ description }}</div>
          <table class="lim-table">
            <tbody>
              <template v-for="(row, i) in rows" :key="row.key">
                <!-- Visual separator before URL row -->
                <tr v-if="row.key === 'URL' && i > 0" class="lim-separator-row">
                  <td colspan="2"><hr class="lim-separator" /></td>
                </tr>
                <tr>
                  <td class="lim-key">{{ row.key }}</td>
                  <td class="lim-value">
                    <a v-if="row.key === 'URL'" :href="row.value" target="_blank" rel="noopener noreferrer" class="lim-url">{{ row.value }}</a>
                    <span v-else>{{ row.value }}</span>
                  </td>
                </tr>
              </template>
            </tbody>
          </table>
        </div>
      </div>
    </div>
    </Transition>
  </teleport>
</template>

<script setup>
import { watch, onUnmounted } from 'vue';
import { ICON_INFO, ICON_CLOSE } from '@/constants/icons.js';

const props = defineProps({
  isVisible:   { type: Boolean, default: false },
  title:       { type: String, default: 'Layer Info' },
  rows:        { type: Array, default: () => [] },
  description: { type: String, default: null },
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
/* ── Transition ─────────────────────────────────────────────────────────────── */
.lim-fade-enter-active,
.lim-fade-leave-active { transition: opacity 0.15s ease; }
.lim-fade-enter-from,
.lim-fade-leave-to { opacity: 0; }

/* ── Backdrop ───────────────────────────────────────────────────────────────── */
.lim-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* ── Modal shell ────────────────────────────────────────────────────────────── */
.lim-modal {
  background: rgba(30, 30, 30, 0.97);
  border: 1px solid #444;
  border-radius: 8px;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.65);
  backdrop-filter: blur(10px);
  min-width: 320px;
  max-width: 480px;
  width: 90%;
  font-family: 'Segoe UI', sans-serif;
  color: #e0e0e0;
  overflow: hidden;
}

.theme-light .lim-modal {
  background: rgba(255, 255, 255, 0.97);
  border-color: #ccc;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.18);
  color: #333;
}

/* ── Header ─────────────────────────────────────────────────────────────────── */
.lim-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  background: rgba(40, 40, 40, 0.85);
  border-bottom: 1px solid #444;
  border-radius: 8px 8px 0 0;
}

.theme-light .lim-header {
  background: rgba(248, 249, 250, 0.97);
  border-bottom-color: #ddd;
}

.lim-icon {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  color: #4a9eff;
}

.lim-icon :deep(svg) {
  width: 16px;
  height: 16px;
  stroke: #4a9eff;
}

.theme-light .lim-icon {
  color: #2563eb;
}

.theme-light .lim-icon :deep(svg) {
  stroke: #2563eb;
}

.lim-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  flex: 1;
  color: #e0e0e0;
}

.theme-light .lim-title {
  color: #333;
}

.lim-close {
  background: none;
  border: none;
  color: #aaa;
  cursor: pointer;
  padding: 4px;
  display: flex;
  align-items: center;
  border-radius: 4px;
  transition: background 0.15s, color 0.15s;
}

.lim-close :deep(svg) {
  width: 14px;
  height: 14px;
}

.lim-close:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}

.theme-light .lim-close {
  color: #666;
}

.theme-light .lim-close:hover {
  background: rgba(0, 0, 0, 0.06);
  color: #333;
}

/* ── Body ───────────────────────────────────────────────────────────────────── */
.lim-body {
  padding: 8px 0;
  max-height: 60vh;
  overflow-y: auto;
}

.lim-body::-webkit-scrollbar { width: 6px; }
.lim-body::-webkit-scrollbar-track { background: transparent; }
.lim-body::-webkit-scrollbar-thumb { background: #555; border-radius: 3px; }
.theme-light .lim-body::-webkit-scrollbar-thumb { background: #bbb; }

/* ── Description ────────────────────────────────────────────────────────────── */
.lim-description {
  padding: 10px 16px;
  font-size: 13px;
  line-height: 1.5;
  color: #c8c8c8;
  border-bottom: 1px solid #333;
  white-space: pre-wrap;
  word-break: break-word;
}

.theme-light .lim-description {
  color: #444;
  border-bottom-color: #e0e0e0;
}

/* ── Table ──────────────────────────────────────────────────────────────────── */
.lim-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.lim-table tr:nth-child(even) {
  background: rgba(255, 255, 255, 0.04);
}

.theme-light .lim-table tr:nth-child(even) {
  background: rgba(0, 0, 0, 0.03);
}

.lim-key {
  padding: 8px 16px;
  font-weight: 600;
  color: #aaa;
  white-space: nowrap;
  width: 40%;
  vertical-align: top;
}

.theme-light .lim-key {
  color: #666;
}

.lim-value {
  padding: 8px 16px;
  color: #e0e0e0;
  word-break: break-all;
}

.theme-light .lim-value {
  color: #222;
}

.lim-url {
  color: #4a9eff;
  text-decoration: none;
  word-break: break-all;
}

.lim-url:hover { text-decoration: underline; }

.theme-light .lim-url { color: #2563eb; }

/* ── Separator ──────────────────────────────────────────────────────────────── */
.lim-separator-row td { padding: 0 16px; }

.lim-separator {
  border: none;
  border-top: 1px solid #3a3a3a;
  margin: 4px 0;
}

.theme-light .lim-separator { border-top-color: #e0e0e0; }
</style>
