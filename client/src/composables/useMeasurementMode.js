import { ref, markRaw, onUnmounted } from 'vue';
import Draw from 'ol/interaction/Draw';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import { getLength, getArea } from 'ol/sphere';
import { Stroke, Style, Fill, Circle as CircleStyle } from 'ol/style';
import { unByKey } from 'ol/Observable';

export function useMeasurementMode(mapStore, layerManagerRef) {
  const isMeasurementModalVisible = ref(false);
  const activeMeasurementType = ref('distance');
  const measurements = ref([]);
  const measurementPointsCount = ref(0);
  const currentMeasurementValue = ref(null);

  let measureSource = null;
  let measureLayer = null;
  let measureDraw = null;
  let measureGeomKey = null;

  const measureStyle = new Style({
    fill: new Fill({ color: 'rgba(59, 130, 246, 0.12)' }),
    stroke: new Stroke({ color: '#3b82f6', width: 2, lineDash: [6, 4] }),
    image: new CircleStyle({
      radius: 5,
      fill: new Fill({ color: '#3b82f6' }),
      stroke: new Stroke({ color: '#fff', width: 1.5 }),
    }),
  });

  const formatLength = (geom, projection) => {
    const len = getLength(geom, { projection });
    return len >= 1000 ? (len / 1000).toFixed(2) + ' km' : Math.round(len) + ' m';
  };

  const formatArea = (geom, projection) => {
    const area = getArea(geom, { projection });
    return area >= 1_000_000
      ? (area / 1_000_000).toFixed(2) + ' km²'
      : Math.round(area) + ' m²';
  };

  const stopMeasureMode = () => {
    const map = mapStore.getMap();
    if (measureGeomKey) { unByKey(measureGeomKey); measureGeomKey = null; }
    if (measureDraw && map) { map.removeInteraction(measureDraw); measureDraw = null; }
    if (measureLayer && map) { map.removeLayer(measureLayer); measureLayer = null; }
    measureSource = null;
    measurements.value = [];
    measurementPointsCount.value = 0;
    currentMeasurementValue.value = null;
  };

  const startMeasureMode = (type) => {
    const map = mapStore.getMap();
    if (!map) return;
    if (measureGeomKey) { unByKey(measureGeomKey); measureGeomKey = null; }
    if (measureDraw) { map.removeInteraction(measureDraw); measureDraw = null; }
    if (!measureLayer) {
      const source = new VectorSource();
      measureSource = source;
      measureLayer = markRaw(new VectorLayer({ source, style: measureStyle, zIndex: 9999 }));
      map.addLayer(measureLayer);
    }
    const projection = map.getView().getProjection();
    const geomType = type === 'distance' ? 'LineString' : 'Polygon';
    const draw = new Draw({ source: measureSource, type: geomType, style: measureStyle });

    draw.on('drawstart', (evt) => {
      measurementPointsCount.value = 0;
      currentMeasurementValue.value = null;
      measureGeomKey = evt.feature.getGeometry().on('change', (e) => {
        const geom = e.target;
        if (type === 'distance') {
          const coords = geom.getCoordinates();
          const count = Math.max(0, coords.length - 1);
          measurementPointsCount.value = count;
          if (coords.length >= 2) currentMeasurementValue.value = formatLength(geom, projection);
        } else {
          const ring = geom.getCoordinates()[0];
          const count = Math.max(0, ring.length - 2);
          measurementPointsCount.value = count;
          if (count >= 3) currentMeasurementValue.value = formatArea(geom, projection);
        }
      });
    });

    draw.on('drawend', (evt) => {
      if (measureGeomKey) { unByKey(measureGeomKey); measureGeomKey = null; }
      const geom = evt.feature.getGeometry();
      const value = type === 'distance'
        ? formatLength(geom, projection)
        : formatArea(geom, projection);
      measurements.value.push({
        type,
        value,
        feature: markRaw(evt.feature),
        timestamp: new Date().toISOString(),
      });
      measurementPointsCount.value = 0;
      currentMeasurementValue.value = null;
    });

    measureDraw = draw;
    map.addInteraction(draw);
  };

  const openMeasurementMode = (type) => {
    activeMeasurementType.value = type;
    isMeasurementModalVisible.value = true;
    startMeasureMode(type);
  };

  const closeMeasurementModal = () => {
    isMeasurementModalVisible.value = false;
    stopMeasureMode();
    layerManagerRef.value?.setSelectionActive(true);
  };

  const resetMeasurements = () => {
    measurements.value = [];
    if (measureSource) measureSource.clear();
    measurementPointsCount.value = 0;
    currentMeasurementValue.value = null;
    if (measureDraw) measureDraw.abortDrawing();
  };

  const removeMeasurement = (index) => {
    const m = measurements.value[index];
    if (m?.feature && measureSource) measureSource.removeFeature(m.feature);
    measurements.value.splice(index, 1);
  };

  const saveCurrentMeasurement = () => {
    const minPts = activeMeasurementType.value === 'distance' ? 2 : 3;
    if (measureDraw && measurementPointsCount.value >= minPts) {
      measureDraw.finishDrawing();
    }
  };

  const undoLastPoint = () => {
    if (measureDraw) measureDraw.removeLastPoint();
  };

  const cancelCurrentMeasurement = () => {
    if (measureDraw) measureDraw.abortDrawing();
    measurementPointsCount.value = 0;
    currentMeasurementValue.value = null;
  };

  onUnmounted(stopMeasureMode);

  return {
    isMeasurementModalVisible,
    activeMeasurementType,
    measurements,
    measurementPointsCount,
    currentMeasurementValue,
    openMeasurementMode,
    closeMeasurementModal,
    resetMeasurements,
    removeMeasurement,
    saveCurrentMeasurement,
    undoLastPoint,
    cancelCurrentMeasurement,
  };
}
