import { defineStore } from "pinia";
import { ref } from "vue";

export const useMapStore = defineStore("map", () => {
  // --- STATE ---
  const mapInstance = ref(null); // The raw Leaflet object
  const zoom = ref(2);
  const center = ref({ lat: 0, lng: 0 });
  const crsName = ref("");
  const mouseCoords = ref(null); // LatLng object from Leaflet mousemove event
  const projectedCoords = ref(null);

  // --- ACTIONS ---

  // Called by MapWidget.vue on mount
  const setMap = (map) => {
    // We don't make the entire Leaflet object reactive (performance optimization)
    // We just store it in a standard variable if possible,
    // but using ref(null) and marking it raw is also fine.
    // For simplicity in Pinia setup stores, a raw variable outside is tricky,
    // so we often just use a standard let or a shallowRef.
    // Here we use a closure variable for the raw instance to avoid Proxy overhead:
    mapInstance.value = map;

    // Initialize state
    zoom.value = map.getZoom();
    center.value = map.getCenter();
    crsName.value = map.options.crs.code || "Unknown";

    // Listen for moves
    map.on("moveend", () => {
      zoom.value = map.getZoom();
      center.value = map.getCenter();
    });

    map.on("mousemove", (e) => {
      mouseCoords.value = e.latlng;
      // Projected coordinates
      if (map.options.crs && map.options.crs.project) {
        projectedCoords.value = map.options.crs.project(e.latlng);
      }
    });
  };

  // Helper to access the raw map safely
  const getMap = () => {
    return mapInstance.value;
  };

  return {
    zoom,
    center,
    crsName,
    mouseCoords,
    projectedCoords,
    setMap,
    getMap: () => mapInstance.value,
  };
});
