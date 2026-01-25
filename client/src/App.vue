<template>
  <div id="app">
    <div v-if="isConfigLoaded" class="app-layout">
      <button class="menu-toggle" @click="isSidebarOpen = !isSidebarOpen">
        ☰
      </button>

      <SideBar class="main-sidebar" :class="{ open: isSidebarOpen }" />

      <div
        v-if="isSidebarOpen"
        class="sidebar-overlay"
        @click="isSidebarOpen = false"
      ></div>

      <div class="map-area">
        <MapWidget />
        
        <div class="bottom-left-control">
          <BaseMapSwitcher />
        </div>

        <AttributePanel />
      </div>
    </div>

    <div v-else class="loading">Loading Configuration...</div>
  </div>
</template>

<script setup>
import { ref, onMounted, provide } from "vue";
import yaml from "js-yaml";
import MapWidget from "./components/MapWidget.vue";
import SideBar from "./components/SideBar.vue";
import BaseMapSwitcher from "./components/BaseMapSwitcher.vue";
import AttributePanel from "./components/AttributePanel.vue"; // <--- 1. Import it

const isConfigLoaded = ref(false);
const appConfig = ref(null);
const isSidebarOpen = ref(false);

provide("config", appConfig);

onMounted(async () => {
  try {
    const res = await fetch("/config_antarctica.yaml");
    const txt = await res.text();
    appConfig.value = yaml.load(txt);
    isConfigLoaded.value = true;
  } catch (e) {
    console.error(e);
  }
});
</script>

<style>
/* GLOBAL RESETS */
html,
body {
  margin: 0;
  padding: 0;
  height: 100%;
  overflow: hidden;
}
#app {
  height: 100%;
  width: 100%;
}

.app-layout {
  display: flex;
  height: 100%;
  width: 100%;
  position: relative;
}

/* --- DEFAULT DESKTOP STYLES --- */
.main-sidebar {
  width: 280px;
  flex-shrink: 0;
  z-index: 2000;
  background: white;
}

.map-area {
  flex: 1;
  position: relative; /* <--- This is key. It anchors the absolute children inside */
}

.menu-toggle {
  display: none;
}

.sidebar-overlay {
  display: none;
}

.bottom-left-control {
  position: absolute;
  bottom: 25px;
  left: 20px;
  z-index: 1000;
}

/* --- MOBILE STYLES (Max Width 768px) --- */
@media (max-width: 768px) {
  /* 1. Show the Hamburger Button */
  .menu-toggle {
    display: block;
    position: absolute;
    top: 15px;
    left: 15px;
    z-index: 3000;
    background: white;
    border: none;
    font-size: 24px;
    padding: 8px 12px;
    border-radius: 4px;
    box-shadow: 0 2px 5px rgba(0, 0, 0, 0.2);
    cursor: pointer;
  }

  /* 2. Hide Left Sidebar by default */
  .main-sidebar {
    position: absolute;
    top: 0;
    left: -280px;
    height: 100%;
    transition: left 0.3s ease-in-out;
    box-shadow: 2px 0 10px rgba(0, 0, 0, 0.3);
  }

  .main-sidebar.open {
    left: 0;
  }

  /* 3. Dark Overlay */
  .sidebar-overlay {
    display: block;
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.5);
    z-index: 1500;
    backdrop-filter: blur(2px);
  }

  .bottom-left-control {
    bottom: 30px;
    left: 10px;
    transform: scale(0.9);
    transform-origin: bottom left;
  }

  /* 4. OPTIONAL: Fix Attribute Panel on Mobile */
  /* Since we can't edit AttributePanel.vue here, we can override it globally */
  .attribute-panel {
    width: 100% !important; /* Full width on phone */
    height: 50% !important; /* Half height (bottom sheet style) */
    top: auto !important;
    bottom: 0 !important;
    border-top: 2px solid #ddd;
  }
}
</style>