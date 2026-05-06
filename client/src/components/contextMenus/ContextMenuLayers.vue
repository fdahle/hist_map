<template>
  <div v-if="visible">
    <div class="overlay" @click="close"></div>

    <div
      class="context-menu"
      :style="{ top: `${y}px`, left: `${x}px` }"
      @click.stop
    >
      <ul>
        <!-- Sub-group mode: only show colour picker -->
        <template v-if="subGroupValue !== null">
          <li class="color-picker">
            <span class="menu-icon" v-html="ICON_PALETTE"></span><span>{{ subGroupValue }}:</span>
            <div class="colors">
              <button @click="emitColor('#e63946')" style="background: #e63946"></button>
              <button @click="emitColor('#007bff')" style="background: #007bff"></button>
              <button @click="emitColor('#2a9d8f')" style="background: #2a9d8f"></button>
              <button @click="emitColor('#e9c46a')" style="background: #e9c46a"></button>
              <button @click="emitColor('#9b59b6')" style="background: #9b59b6"></button>
              <button @click="emitColor('#33cc33')" style="background: #33cc33"></button>
              <label class="custom-color-btn" title="Choose custom color">
                <input type="color" @change="emitColor($event.target.value)" @click.stop />
              </label>
            </div>
          </li>
        </template>

        <!-- Normal layer mode -->
        <template v-else>
        <li @click="emitAction('info')"><span class="menu-icon" v-html="ICON_INFO_SM"></span> Layer Info</li>
        <li @click="emitAction('zoom')"><span class="menu-icon" v-html="ICON_ZOOM"></span> Zoom to Layer</li>
        <li @click="allowDownload && emitAction('download')" :class="{ 'menu-item-disabled': !allowDownload }">
          <span class="menu-icon" v-html="ICON_DOWNLOAD"></span> {{ payload?.type === 'geotiff' ? 'Download TIF' : 'Download GeoJSON' }}
        </li>
        <template v-if="payload?.type !== 'geotiff'">
          <li class="color-picker">
            <span class="menu-icon" v-html="ICON_PALETTE"></span><span>Color:</span>
            <div class="colors">
              <button
                @click="emitColor('#e63946')"
                style="background: #e63946"
              ></button>
              <button
                @click="emitColor('#007bff')"
                style="background: #007bff"
              ></button>
              <button
                @click="emitColor('#2a9d8f')"
                style="background: #2a9d8f"
              ></button>
              <button
                @click="emitColor('#e9c46a')"
                style="background: #e9c46a"
              ></button>
              <!-- custom color -->
              <label class="custom-color-btn" title="Choose custom color">
                <input
                  type="color"
                  @change="emitColor($event.target.value)"
                  @click.stop
                />
              </label>
            </div>
          </li>
        </template>
        <template v-if="payload?.isUserAdded">
          <li class="separator"></li>
          <li class="danger" @click="handleRemove()"><span class="menu-icon" v-html="ICON_TRASH_SM"></span> Remove Layer</li>
        </template>
        </template> <!-- end normal layer mode -->
      </ul>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, inject } from "vue";

// Ribbon-matching icons (defined locally, matching MapRibbonMenu style)
const ICON_ZOOM = `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`;
const ICON_DOWNLOAD = `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`;
const ICON_PALETTE = `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="8" cy="10" r="1.2" fill="currentColor" stroke="none"/><circle cx="12" cy="8" r="1.2" fill="currentColor" stroke="none"/><circle cx="16" cy="10" r="1.2" fill="currentColor" stroke="none"/><circle cx="16" cy="14" r="1.2" fill="currentColor" stroke="none"/><circle cx="8" cy="14" r="1.2" fill="currentColor" stroke="none"/></svg>`;
const ICON_TRASH_SM = `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>`;
const ICON_INFO_SM = `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><circle cx="12" cy="8" r="0.5" fill="currentColor"/></svg>`;

const appConfig = inject('config');
const allowDownload = computed(() => appConfig?.value?.ui?.map_download !== false);

const visible = ref(false);
const x = ref(0);
const y = ref(0);
const payload = ref(null);
// When non-null, the menu was opened from a sub-group row.
// Only the colour picker section is shown in that case.
const subGroupValue = ref(null);

const emit = defineEmits(["action", "color-change"]);

const open = (event, data, subValue = null) => {
  const mouseEvent = event.originalEvent || event;

  x.value = mouseEvent.clientX;
  y.value = mouseEvent.clientY;

  payload.value = data;
  subGroupValue.value = subValue;
  visible.value = true;
};

const close = () => {
  visible.value = false;
};

const emitAction = (type) => {
  emit("action", { type, layer: payload.value });
  close();
};

const emitColor = (color) => {
  emit("color-change", { color, layer: payload.value, subGroupValue: subGroupValue.value });
  close();
};

const handleRemove = () => {
  const name = payload.value?.name || 'this layer';
  if (!confirm(`Remove "${name}"? This cannot be undone.`)) return;
  emitAction('remove');
};

defineExpose({ open, close });
</script>

<style scoped>
.context-menu {
  position: fixed;
  z-index: 9999;
  background: white;
  border: 1px solid #ccc;
  box-shadow: 2px 2px 10px rgba(0, 0, 0, 0.2);
  border-radius: 4px;
  min-width: 160px;
  font-family: "Segoe UI", sans-serif;
  font-size: 13px;
  color: #333;
}

.theme-dark .context-menu {
  background: #2a2a2a;
  border: 1px solid #555;
  box-shadow: 2px 2px 10px rgba(0, 0, 0, 0.6);
  color: #e0e0e0;
}

/* This overlay now catches the clicks */
.overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  z-index: 9998; /* Ensures it sits just behind the menu (9999) */
  cursor: default;
}

ul {
  list-style: none;
  padding: 0;
  margin: 0;
}

li {
  padding: 8px 12px;
  cursor: pointer;
  border-bottom: 1px solid #f5f5f5;
  display: flex;
  align-items: center;
  gap: 7px;
}

.menu-icon {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  color: #555;
}

.theme-dark .menu-icon {
  color: #aaa;
}

.theme-dark li {
  border-bottom: 1px solid #444;
}

li:hover {
  background: #f0f0f0;
}

.theme-dark li:hover {
  background: #3a3a3a;
}

.menu-item-disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.menu-item-disabled:hover {
  background: transparent !important;
}

.separator {
  height: 1px;
  background: #eee;
  padding: 0;
  margin: 2px 0;
  border-bottom: none;
}

li:has(+ .separator) {
  border-bottom: none;
}

.theme-dark .separator {
  background: #444;
}

li.danger {
  color: #dc2626;
}

.theme-dark li.danger {
  color: #f87171;
}

li.danger:hover {
  background: #fee2e2;
}

.theme-dark li.danger:hover {
  background: #3a1a1a;
}

.colors {
  display: flex;
  gap: 5px;
  margin-top: 5px;
  align-items: center;
}

.colors button {
  width: 18px;
  height: 18px;
  border: 1px solid #ddd;
  border-radius: 50%;
  cursor: pointer;
}

.colors button:hover {
  border-color: #999;
}

/* Wrapper to create the round shape and rainbow background */
.custom-color-btn {
  width: 18px;
  height: 18px;
  border: 1px solid #ddd;
  border-radius: 50%;
  cursor: pointer;
  position: relative;
  display: inline-block;
  margin-left: 5px;
  background: conic-gradient(
    red,
    orange,
    yellow,
    green,
    blue,
    indigo,
    violet,
    red
  );
  box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.1);
}

/* The actual input is invisible but stretches to fill the circle */
.custom-color-btn input {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  opacity: 0; /* Hidden */
  cursor: pointer;
  padding: 0;
  margin: 0;
}

/* Hover effect to match your other buttons */
.custom-color-btn:hover {
  border-color: #999;
}
</style>