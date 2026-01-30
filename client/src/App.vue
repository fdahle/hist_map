<template>
  <div id="app">
    <div v-if="isConfigLoaded" class="app-layout">
      <button class="menu-toggle" @click="isSidebarOpen = !isSidebarOpen">
        ☰
      </button>

      <SideBar 
        class="main-sidebar" 
        :class="{ open: isSidebarOpen }" 
        @open-settings="isSettingsOpen = true"
      />

      <div
        v-if="isSidebarOpen"
        class="sidebar-overlay"
        @click="isSidebarOpen = false"
      ></div>

      <div class="map-area">
        <MapWidget />

        <div class="bottom-left-control" :class="{ 'has-info-bar': settingsStore.showInfoBar }">
          <BaseMapSwitcher />
        </div>

        <InformationBar v-if="settingsStore.showInfoBar" />

        <AttributePanel />
      </div>

      <Settings
        :is-open="isSettingsOpen"
        @close="isSettingsOpen = false"
      />
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
import AttributePanel from "./components/AttributePanel.vue";
import InformationBar from "./components/InformationBar.vue";

// --- FIX: Import the Missing Components & Store ---
import Settings from "./components/modals/Settings.vue";
import { useSettingsStore } from "./stores/settingsStore";

// state variables
const isConfigLoaded = ref(false);
const appConfig = ref(null);
const isSidebarOpen = ref(false);

// provide config to the rest of the app
provide("config", appConfig);

// --- FIX: Initialize Store & Modal State ---
const settingsStore = useSettingsStore(); 
const isSettingsOpen = ref(false);

// load configuration on mount
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
  position: relative;
}

.menu-toggle {
  display: none;
}

.sidebar-overlay {
  display: none;
}

/* --- CONTROL POSITIONING --- */
.bottom-left-control {
  position: absolute;
  bottom: 25px;
  left: 20px;
  z-index: 1000;
  transition: bottom 0.3s ease; /* Smooth animation */
}

/* 4. ADDED: Moves switcher up when InfoBar is visible */
.bottom-left-control.has-info-bar {
  bottom: 40px; /* 28px bar + 12px gap */
}

/* --- MOBILE STYLES (Max Width 768px) --- */
@media (max-width: 768px) {
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

  /* Adjust mobile spacing for InfoBar */
  .bottom-left-control.has-info-bar {
    bottom: 45px;
  }

  .attribute-panel {
    width: 100% !important;
    height: 50% !important;
    top: auto !important;
    bottom: 0 !important;
    border-top: 2px solid #ddd;
  }
}

.loading {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100%;
  font-family: sans-serif;
  color: #666;
}
</style>