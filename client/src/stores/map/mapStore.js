// client/src/stores/mapStore.js
import { defineStore } from "pinia";
import { ref, markRaw } from "vue";
import { toLonLat } from "ol/proj"; // Helper to convert Meters -> Lat/Lon
import { MAP_POINTER_THROTTLE_MS } from "../../constants/layerConstants";

export const useMapStore = defineStore("map", () => {
  // --- STATE ---
  const mapInstance = ref(null);
  const zoom = ref(2);
  const center = ref({ lat: 0, lng: 0 }); // Keep structure compatible with your app
  const crsName = ref("");
  const mouseCoords = ref(null); // Lat/Lng
  const projectedCoords = ref(null); // X/Y (Meters)

  // EventsKey handles for cleanup when setMap is called again
  let _moveendKey = null;
  let _pointermoveKey = null;

  // --- ACTIONS ---

  const setMap = (map) => {
    // Remove listeners from previous map instance before registering new ones
    if (mapInstance.value) {
      if (_moveendKey) mapInstance.value.un("moveend", _moveendKey);
      if (_pointermoveKey) mapInstance.value.un("pointermove", _pointermoveKey);
    }

    // Store raw OpenLayers map instance
    mapInstance.value = markRaw(map);

    const view = map.getView();
    const projection = view.getProjection();

    // 1. Initialize State (OpenLayers getters)
    zoom.value = view.getZoom();
    crsName.value = projection.getCode();

    const initialCenter = view.getCenter(); // Returns [x, y]
    if (initialCenter) {
        const [lon, lat] = toLonLat(initialCenter, projection);
        center.value = { lat, lng: lon };
    }

    // 2. Listen for Move Events
    _moveendKey = map.on("moveend", () => {
      const v = map.getView();
      zoom.value = v.getZoom();

      const c = v.getCenter();
      if (c) {
          // Convert Projected Center back to Lat/Lon for display
          const [lon, lat] = toLonLat(c, v.getProjection());
          center.value = { lat, lng: lon };
      }
    });

    // 3. Throttled Mouse Movement tracking (reduce CPU during zoom/pan)
    let lastPointerUpdate = 0;

    _pointermoveKey = map.on("pointermove", (e) => {
      if (e.dragging) return;

      const now = Date.now();
      if (now - lastPointerUpdate < MAP_POINTER_THROTTLE_MS) return;
      lastPointerUpdate = now;

      const coords = e.coordinate;

      // Update Projected (Raw X/Y)
      projectedCoords.value = { x: coords[0], y: coords[1] };

      // Update Geographic (Lat/Lon)
      const [lon, lat] = toLonLat(coords, map.getView().getProjection());
      mouseCoords.value = { lat, lng: lon };
    });
  };

  return {
    map: mapInstance,
    zoom,
    center,
    crsName,
    mouseCoords,
    projectedCoords,
    setMap,
    getMap: () => mapInstance.value,
  };
});