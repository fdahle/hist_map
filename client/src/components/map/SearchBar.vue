<template>
  <div class="search-wrapper">
    <div class="search-box">
      <span class="search-icon">🔍</span>
      <input
        type="text"
        v-model="query"
        :placeholder="placeholderText"
        @input="handleInput"
        @focus="isFocused = true"
        @keydown.down.prevent="navigateResults(1)"
        @keydown.up.prevent="navigateResults(-1)"
        @keydown.enter.prevent="selectActiveResult"
      />
      <button v-if="query" class="clear-btn" @click="clearSearch">✕</button>
    </div>

    <ul v-if="showResults" class="results-list">
      <li
        v-for="(result, index) in results"
        :key="result.uid"
        :class="{ 'is-active': index === activeIndex }"
        @click="selectResult(result)"
        @mouseenter="activeIndex = index"
      >
        <div class="result-info">
          <span class="result-name">{{ result.name }}</span>
          <span class="result-layer">{{ result.layerName }}</span>
        </div>
      </li>
    </ul>
    
    <div v-if="query && results.length === 0 && isFocused" class="no-results">
        {{ STRINGS.search.noResults }}
    </div>
  </div>
</template>

<script setup>
import { ref, computed, inject } from "vue";
import { useLayerStore } from "../../stores/map/layerStore";
import { useMapStore } from "../../stores/map/mapStore";
import { SEARCH_MIN_LENGTH, SEARCH_DEBOUNCE_MS } from "../../constants/layerConstants";
import { STRINGS } from "../../constants/strings";
import { logger } from "../../utils/logger";

const layerStore = useLayerStore();
const mapStore = useMapStore();
const layerManager = inject("layerManager");

const placeholderText = computed(() => STRINGS.search.placeholder);

const query = ref("");
const results = ref([]);
const isFocused = ref(false);
const activeIndex = ref(-1);
let debounceTimeout = null;

const showResults = computed(() => {
  return isFocused.value && results.value.length > 0;
});

// --- Search Logic ---
const handleInput = () => {
  if (debounceTimeout) clearTimeout(debounceTimeout);
  debounceTimeout = setTimeout(performSearch, SEARCH_DEBOUNCE_MS);
};

const performSearch = () => {
  if (!query.value || query.value.length < SEARCH_MIN_LENGTH) {
    results.value = [];
    return;
  }

  const searchTerm = query.value.toLowerCase();
  const matches = [];

  // Search only in ACTIVE overlay layers that have a search index.
  // Layers without search_fields in config never get indexed, so they
  // are automatically excluded here.
  layerStore.overlayLayers.forEach((layer) => {
    if (!layer.active || !layerManager.value) return;

    const index = layerManager.value.searchIndex.get(layer._layerId);
    if (!index) return;

    for (const [key, entries] of index) {
      if (key.includes(searchTerm)) {
        for (const { feature, displayValue } of entries) {
          if (matches.length >= 10) break;
          matches.push({
            uid: feature.ol_uid,
            name: displayValue,
            layerName: layer.name,
            feature: feature,
            geometry: feature.getGeometry(),
          });
        }
      }
      if (matches.length >= 10) break;
    }
  });

  results.value = matches;
  activeIndex.value = -1;
};

// --- Navigation ---
const navigateResults = (direction) => {
  if (results.value.length === 0) return;
  activeIndex.value += direction;
  if (activeIndex.value < 0) activeIndex.value = results.value.length - 1;
  if (activeIndex.value >= results.value.length) activeIndex.value = 0;
};

const selectActiveResult = () => {
  if (activeIndex.value >= 0 && activeIndex.value < results.value.length) {
    selectResult(results.value[activeIndex.value]);
  }
};

// --- Selection & Zoom Logic ---
const selectResult = (result) => {
  query.value = result.name;
  isFocused.value = false;

  const map = mapStore.getMap();
  if (!map) {
    logger.warn('SearchBar', 'Map instance not found in store');
    return;
  }

  const geometry = result.geometry;
  if (!geometry) return;

  const view = map.getView();
  
  // 1. Handle Points (Zoom to center)
  if (geometry.getType() === "Point") {
    const coordinates = geometry.getCoordinates();
    view.animate({
      center: coordinates,
      zoom: 12, // Zoom level for points
      duration: 1000,
    });
  } 
  // 2. Handle Lines/Polygons (Fit to extent)
  else {
    const extent = geometry.getExtent();
    view.fit(extent, {
      padding: [100, 100, 100, 100],
      duration: 1000,
      maxZoom: 14
    });
  }
  
  // Optional: Trigger a "flash" selection effect here if you have a selection store
  // selectionStore.selectFeature(result.feature); 
};

const clearSearch = () => {
  query.value = "";
  results.value = [];
  activeIndex.value = -1;
};
</script>

<style scoped>
.search-wrapper {
  position: absolute;
  top: 20px;
  left: 50%;
  transform: translateX(-50%);
  width: 350px;
  z-index: 3000;
  font-family: 'Segoe UI', sans-serif;
}

@media (max-width: 768px) {
  .search-wrapper {
    left: 68px;
    right: 12px;
    width: auto;
    transform: none;
    top: 15px;
  }
}

.search-box {
  display: flex;
  align-items: center;
  background: white;
  padding: 10px 15px;
  border-radius: 30px;
  box-shadow: 0 4px 15px rgba(0,0,0,0.15);
  border: 1px solid #e0e0e0;
}

.theme-dark .search-box {
  background: #2a2a2a;
  border: 1px solid #444;
  box-shadow: 0 4px 15px rgba(0,0,0,0.5);
}

.search-box input {
  border: none;
  outline: none;
  flex: 1;
  font-size: 15px;
  margin: 0 10px;
}

.theme-dark .search-box input {
  background: #2a2a2a;
  color: #e0e0e0;
}

.search-icon {
  font-size: 16px;
  color: #666;
}

.theme-dark .search-icon {
  color: #999;
}

.clear-btn {
  background: none;
  border: none;
  cursor: pointer;
  color: #999;
  font-weight: bold;
}

.clear-btn:hover {
  color: #d32f2f;
}

.results-list {
  list-style: none;
  margin: 8px 0 0 0;
  padding: 5px 0;
  background: white;
  border-radius: 12px;
  box-shadow: 0 4px 20px rgba(0,0,0,0.15);
  max-height: 400px;
  overflow-y: auto;
}

.theme-dark .results-list {
  background: #2a2a2a;
  box-shadow: 0 4px 20px rgba(0,0,0,0.5);
}

.results-list li {
  padding: 10px 20px;
  cursor: pointer;
  transition: background 0.1s;
  border-bottom: 1px solid #f5f5f5;
}

.theme-dark .results-list li {
  border-bottom: 1px solid #444;
}

.results-list li:last-child {
  border-bottom: none;
}

.results-list li:hover,
.results-list li.is-active {
  background-color: #f0f7ff;
}

.theme-dark .results-list li:hover,
.theme-dark .results-list li.is-active {
  background-color: rgba(74, 158, 255, 0.15);
}

.result-info {
  display: flex;
  flex-direction: column;
}

.result-name {
  font-weight: 600;
  color: #333;
  font-size: 14px;
}

.theme-dark .result-name {
  color: #e0e0e0;
}

.result-layer {
  font-size: 11px;
  color: #888;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-top: 2px;
}

.theme-dark .result-layer {
  color: #999;
}

.no-results {
    background: white;
    padding: 15px;
    border-radius: 12px;
    margin-top: 8px;
    text-align: center;
    color: #888;
    box-shadow: 0 4px 15px rgba(0,0,0,0.1);
}

.theme-dark .no-results {
    background: #2a2a2a;
    color: #999;
    box-shadow: 0 4px 15px rgba(0,0,0,0.5);
}
</style>