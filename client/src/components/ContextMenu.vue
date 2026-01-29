<template>
  <div v-if="visible">
    <div class="overlay" @click="close"></div>

    <div
      class="context-menu"
      :style="{ top: `${y}px`, left: `${x}px` }"
      @click.stop
    >
      <ul>
        <li @click="emitAction('zoom')">🔍 Zoom to Layer</li>
        <li @click="emitAction('download')">💾 Download GeoJSON</li>
        <li class="separator"></li>
        <li class="color-picker">
          <span>🎨 Color:</span>
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
          </div>
        </li>
      </ul>
    </div>
  </div>
</template>

<script setup>
import { ref } from "vue";

const visible = ref(false);
const x = ref(0);
const y = ref(0);
const payload = ref(null);

const emit = defineEmits(["action", "color-change"]);

const open = (event, data) => {
  const mouseEvent = event.originalEvent || event;

  x.value = mouseEvent.clientX;
  y.value = mouseEvent.clientY;

  payload.value = data;
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
  emit("color-change", { color, layer: payload.value });
  close();
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
}

li:hover {
  background: #f0f0f0;
}

.separator {
  height: 1px;
  background: #eee;
  padding: 0;
  margin: 2px 0;
}

.colors {
  display: flex;
  gap: 5px;
  margin-top: 5px;
}

.colors button {
  width: 18px;
  height: 18px;
  border: 1px solid #ddd;
  border-radius: 50%;
  cursor: pointer;
}
</style>