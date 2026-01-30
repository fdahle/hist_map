// client/src/stores/mapStore.js
import { defineStore } from "pinia";
import { ref, markRaw } from "vue";
import { toLonLat } from "ol/proj"; // Helper to convert Meters -> Lat/Lon

export const useMapStore = defineStore("map", () => {
  // --- STATE ---
  const mapInstance = ref(null);
  const zoom = ref(2);
  const center = ref({ lat: 0, lng: 0 }); // Keep structure compatible with your app
  const crsName = ref("");
  const mouseCoords = ref(null); // Lat/Lng
  const projectedCoords = ref(null); // X/Y (Meters)

  // --- ACTIONS ---

  const setMap = (map) => {
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
    map.on("moveend", () => {
      const v = map.getView();
      zoom.value = v.getZoom();
      
      const c = v.getCenter();
      if (c) {
          // Convert Projected Center back to Lat/Lon for display
          const [lon, lat] = toLonLat(c, v.getProjection());
          center.value = { lat, lng: lon };
      }
    });

    // 3. Listen for Mouse Movement ('pointermove' in OpenLayers)
    map.on("pointermove", (e) => {
      if (e.dragging) return;
      
      // e.coordinate is ALREADY in the map's projection (Meters for EPSG:3031)
      const coords = e.coordinate;
      
      // Update Projected (Raw X/Y)
      projectedCoords.value = { x: coords[0], y: coords[1] };

      // Update Geographic (Lat/Lon)
      // We must transform from Map Projection -> Lat/Lon (EPSG:4326)
      const [lon, lat] = toLonLat(coords, map.getView().getProjection());
      
      mouseCoords.value = { lat, lng: lon };
    });
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