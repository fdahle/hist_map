<template>
  <teleport to="body">
    <Transition name="cdm-fade">
    <div v-if="isVisible" class="cdm-backdrop" @click.self="close">
      <div class="cdm-modal">
        <div class="cdm-header">
          <span class="cdm-icon" v-html="ICON_DOWNLOAD"></span>
          <h3 class="cdm-title">{{ title }}</h3>
          <button class="cdm-close" @click="close" title="Close" :disabled="loading">
            <span v-html="ICON_CLOSE"></span>
          </button>
        </div>

        <div class="cdm-body">
          <div v-if="formats.length > 1" class="cdm-hint">Choose a format:</div>
          <p v-else class="cdm-hint">No conversion options available for this file type.</p>

          <div class="cdm-options">
            <label
              v-for="opt in formats"
              :key="opt.format ?? '__original__'"
              class="cdm-option"
              :class="{ selected: selectedFormat === (opt.format ?? null) }"
            >
              <input
                type="radio"
                :value="opt.format ?? null"
                v-model="selectedFormat"
                class="cdm-radio"
              />
              <div class="cdm-option-body">
                <span class="cdm-option-label">{{ opt.label }}</span>
                <span class="cdm-option-ext">{{ opt.ext }}</span>
              </div>
              <span v-if="opt.desc" class="cdm-option-desc">{{ opt.desc }}</span>
            </label>
          </div>

          <p v-if="error" class="cdm-error">{{ error }}</p>
        </div>

        <div class="cdm-footer">
          <button class="cdm-btn cdm-btn-cancel" @click="close" :disabled="loading">Cancel</button>
          <button class="cdm-btn cdm-btn-download" @click="confirm" :disabled="loading || formats.length === 0">
            <span v-if="loading" class="cdm-spinner"></span>
            {{ loading ? 'Converting…' : 'Download' }}
          </button>
        </div>
      </div>
    </div>
    </Transition>
  </teleport>
</template>

<script setup>
import { ref, watch, onUnmounted } from 'vue';
import { ICON_CLOSE } from '@/constants/icons.js';

const ICON_DOWNLOAD = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`;

const props = defineProps({
  isVisible: { type: Boolean, default: false },
  title:     { type: String, default: 'Download' },
  formats:   { type: Array, default: () => [] },
  loading:   { type: Boolean, default: false },
  error:     { type: String, default: '' },
});

const emit = defineEmits(['close', 'confirm']);

const selectedFormat = ref(null);

watch(() => props.isVisible, (val) => {
  if (val) {
    selectedFormat.value = null;
    document.addEventListener('keydown', handleEsc);
  } else {
    document.removeEventListener('keydown', handleEsc);
  }
});

onUnmounted(() => document.removeEventListener('keydown', handleEsc));

const handleEsc = (e) => { if (e.key === 'Escape') close(); };
const close = () => { if (!props.loading) emit('close'); };

function confirm() {
  const opt = props.formats.find(f => (f.format ?? null) === selectedFormat.value)
    ?? props.formats[0];
  if (opt) emit('confirm', opt);
}
</script>

<style scoped>
/* ── Transition ─────────────────────────────────────────────────────────────── */
.cdm-fade-enter-active,
.cdm-fade-leave-active { transition: opacity 0.15s ease; }
.cdm-fade-enter-from,
.cdm-fade-leave-to    { opacity: 0; }

/* ── Backdrop ───────────────────────────────────────────────────────────────── */
.cdm-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* ── Modal shell ────────────────────────────────────────────────────────────── */
.cdm-modal {
  background: rgba(30, 30, 30, 0.97);
  border: 1px solid #444;
  border-radius: 8px;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.65);
  backdrop-filter: blur(10px);
  min-width: 320px;
  max-width: 460px;
  width: 90%;
  font-family: 'Segoe UI', sans-serif;
  color: #e0e0e0;
  overflow: hidden;
}

.theme-light .cdm-modal {
  background: rgba(255, 255, 255, 0.97);
  border-color: #ccc;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.18);
  color: #333;
}

/* ── Header ─────────────────────────────────────────────────────────────────── */
.cdm-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  background: rgba(40, 40, 40, 0.85);
  border-bottom: 1px solid #444;
}

.theme-light .cdm-header {
  background: rgba(248, 249, 250, 0.97);
  border-bottom-color: #ddd;
}

.cdm-icon { flex-shrink: 0; display: flex; align-items: center; }
.cdm-icon :deep(svg) { stroke: #4a9eff; }
.theme-light .cdm-icon :deep(svg) { stroke: #2563eb; }

.cdm-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: #e0e0e0;
}
.theme-light .cdm-title { color: #333; }

.cdm-close {
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
.cdm-close:hover:not(:disabled) { background: rgba(255,255,255,0.08); color: #fff; }
.theme-light .cdm-close:hover:not(:disabled) { background: rgba(0,0,0,0.06); color: #000; }

/* ── Body ───────────────────────────────────────────────────────────────────── */
.cdm-body { padding: 16px; display: flex; flex-direction: column; gap: 10px; }

.cdm-hint { font-size: 12px; color: #999; margin: 0; }
.theme-light .cdm-hint { color: #666; }

/* ── Format options ─────────────────────────────────────────────────────────── */
.cdm-options { display: flex; flex-direction: column; gap: 6px; }

.cdm-option {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 12px;
  border: 1px solid #3a3a3a;
  border-radius: 6px;
  cursor: pointer;
  transition: border-color 0.12s, background 0.12s;
  background: transparent;
}
.cdm-option:hover { border-color: #555; background: rgba(255,255,255,0.04); }
.cdm-option.selected { border-color: #4a9eff; background: rgba(74,158,255,0.08); }

.theme-light .cdm-option { border-color: #e0e0e0; }
.theme-light .cdm-option:hover { border-color: #bbb; background: rgba(0,0,0,0.03); }
.theme-light .cdm-option.selected { border-color: #2563eb; background: rgba(37,99,235,0.06); }

.cdm-radio { display: none; }

.cdm-option-body { display: flex; align-items: center; gap: 8px; flex: 1; min-width: 0; }

.cdm-option-label { font-size: 13px; font-weight: 500; color: #e0e0e0; }
.theme-light .cdm-option-label { color: #222; }

.cdm-option-ext {
  font-size: 11px;
  font-family: monospace;
  background: rgba(255,255,255,0.08);
  color: #aaa;
  padding: 1px 5px;
  border-radius: 3px;
}
.theme-light .cdm-option-ext { background: rgba(0,0,0,0.06); color: #666; }

.cdm-option-desc {
  font-size: 11px;
  color: #888;
  margin-left: auto;
  flex-shrink: 0;
  max-width: 160px;
  text-align: right;
}
.theme-light .cdm-option-desc { color: #999; }

/* ── Error ──────────────────────────────────────────────────────────────────── */
.cdm-error {
  margin: 0;
  font-size: 12px;
  color: #f87171;
  background: rgba(248,113,113,0.08);
  border: 1px solid rgba(248,113,113,0.25);
  border-radius: 4px;
  padding: 6px 10px;
}

/* ── Footer ─────────────────────────────────────────────────────────────────── */
.cdm-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid #3a3a3a;
  background: rgba(30,30,30,0.6);
}
.theme-light .cdm-footer { border-top-color: #e0e0e0; background: rgba(248,249,250,0.8); }

.cdm-btn {
  padding: 6px 16px;
  border-radius: 5px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid transparent;
  display: flex;
  align-items: center;
  gap: 6px;
  transition: background 0.12s, opacity 0.12s;
}
.cdm-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.cdm-btn-cancel { background: transparent; border-color: #555; color: #ccc; }
.cdm-btn-cancel:hover:not(:disabled) { background: rgba(255,255,255,0.06); }
.theme-light .cdm-btn-cancel { border-color: #bbb; color: #555; }
.theme-light .cdm-btn-cancel:hover:not(:disabled) { background: rgba(0,0,0,0.04); }

.cdm-btn-download { background: #3b82f6; color: #fff; border-color: #3b82f6; }
.cdm-btn-download:hover:not(:disabled) { background: #2563eb; border-color: #2563eb; }

/* ── Spinner ────────────────────────────────────────────────────────────────── */
.cdm-spinner {
  width: 12px; height: 12px;
  border: 2px solid rgba(255,255,255,0.3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: cdm-spin 0.7s linear infinite;
  flex-shrink: 0;
}
@keyframes cdm-spin { to { transform: rotate(360deg); } }
</style>
