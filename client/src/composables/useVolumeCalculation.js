import { ref, markRaw, onUnmounted } from 'vue';
import Draw from 'ol/interaction/Draw';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import { Stroke, Style, Fill } from 'ol/style';
import { transform as olTransform, get as getOlProjection } from 'ol/proj';
import { fromBlob, fromUrl } from 'geotiff';

export function useVolumeCalculation(mapStore, layerStore, layerManagerRef) {
  const isVolumeModalVisible = ref(false);
  const isVolumeDrawing = ref(false);
  const isVolumeLoading = ref(false);
  const volumeResult = ref(null);

  let volumeDrawInteraction = null;
  let volumeDrawLayer = null;
  let volumeDrawSource = null;

  const polygonStyle = new Style({
    stroke: new Stroke({ color: '#a855f7', width: 2, lineDash: [6, 4] }),
    fill: new Fill({ color: 'rgba(168, 85, 247, 0.1)' }),
  });

  const stopVolumeDraw = () => {
    const map = mapStore.getMap();
    if (volumeDrawInteraction && map) {
      map.removeInteraction(volumeDrawInteraction);
      volumeDrawInteraction = null;
    }
    if (volumeDrawLayer && map) {
      map.removeLayer(volumeDrawLayer);
      volumeDrawLayer = null;
      volumeDrawSource = null;
    }
    isVolumeDrawing.value = false;
  };

  const openVolumeModal = () => {
    isVolumeModalVisible.value = true;
  };

  const closeVolumeModal = () => {
    isVolumeModalVisible.value = false;
    stopVolumeDraw();
    volumeResult.value = null;
    layerManagerRef.value?.setSelectionActive(true);
  };

  const onResetVolumeResult = () => {
    stopVolumeDraw();
    volumeResult.value = null;
  };

  const computeVolume = async (layerId, polygonGeom, baselineMode, customBaseline, noDataOverride) => {
    const layerObj = layerStore.getLayerById(layerId);
    if (!layerObj) throw new Error('Layer not found');

    const meta = layerObj.metadata ?? {};
    const { file, extent, tiffProjection, noDataValue } = meta;
    const mapCRS = mapStore.getMap().getView().getProjection().getCode();

    let tiff;
    if (file) {
      tiff = await fromBlob(file);
    } else if (layerObj.url) {
      tiff = await fromUrl(layerObj.url);
    } else {
      throw new Error('No data source available for this layer');
    }

    const image = await tiff.getImage();
    const imgW = image.getWidth();
    const imgH = image.getHeight();

    const gdalNoData = image.getGDALNoData();
    const effectiveNoData = noDataOverride !== undefined ? noDataOverride
      : (noDataValue !== undefined && noDataValue !== null) ? noDataValue
      : gdalNoData;

    const fullExtent = extent ?? image.getBoundingBox();
    const fullW = fullExtent[2] - fullExtent[0];
    const fullH = fullExtent[3] - fullExtent[1];

    // Get polygon ring coordinates in TIFF CRS
    const polyRingMap = polygonGeom.getCoordinates()[0];
    let polyRingTiff = polyRingMap;
    if (tiffProjection && tiffProjection !== mapCRS) {
      const fromProj = getOlProjection(mapCRS);
      const toProj = getOlProjection(tiffProjection);
      if (fromProj && toProj) {
        polyRingTiff = polyRingMap.map(c => olTransform(c, mapCRS, tiffProjection));
      }
    }

    const xs = polyRingTiff.map(c => c[0]);
    const ys = polyRingTiff.map(c => c[1]);
    let bbox = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];

    // Clamp to raster extent
    if (extent) {
      const [ex0, ey0, ex1, ey1] = extent;
      const noOverlap = bbox[0] > ex1 || bbox[2] < ex0 || bbox[1] > ey1 || bbox[3] < ey0;
      if (noOverlap) return { cutVolume: 0, fillVolume: 0, netVolume: 0, cellCount: 0, area: 0 };
      bbox = [
        Math.max(bbox[0], ex0), Math.max(bbox[1], ey0),
        Math.min(bbox[2], ex1), Math.min(bbox[3], ey1),
      ];
    }

    const bboxW = bbox[2] - bbox[0];
    const bboxH = bbox[3] - bbox[1];
    const srcPixelsW = fullW > 0 ? Math.ceil((bboxW / fullW) * imgW) : imgW;
    const srcPixelsH = fullH > 0 ? Math.ceil((bboxH / fullH) * imgH) : imgH;
    const aspect = bboxW > 0 && bboxH > 0 ? bboxW / bboxH : 1;
    const MAX_RES = 2048;
    const readW = Math.max(4, Math.min(MAX_RES, Math.round(aspect >= 1 ? MAX_RES : MAX_RES * aspect), srcPixelsW));
    const readH = Math.max(4, Math.min(MAX_RES, Math.round(aspect >= 1 ? MAX_RES / aspect : MAX_RES), srcPixelsH));

    const [rawRaster] = await tiff.readRasters({
      bbox,
      width: readW,
      height: readH,
      samples: [0],
      resampleMethod: 'nearest',
    });

    const data = new Float64Array(rawRaster);
    const xRes = bboxW / readW;
    const yRes = bboxH / readH;
    const cellArea = xRes * yRes;

    // Collect valid elevations for auto baseline, and build point-in-polygon test
    const validElevations = [];
    for (let j = 0; j < readH; j++) {
      for (let i = 0; i < readW; i++) {
        const val = data[j * readW + i];
        const isNoData = effectiveNoData !== null && effectiveNoData !== undefined
          && Math.abs(val - effectiveNoData) <= Math.max(0.5, Math.abs(effectiveNoData) * 1e-6);
        if (isNoData || !isFinite(val)) continue;
        const cx = bbox[0] + (i + 0.5) * xRes;
        const cy = bbox[1] + (readH - j - 0.5) * yRes;
        if (pointInPolygon(cx, cy, polyRingTiff)) {
          validElevations.push(val);
        }
      }
    }

    if (validElevations.length === 0) {
      return { cutVolume: 0, fillVolume: 0, netVolume: 0, cellCount: 0, area: 0 };
    }

    let baseline;
    if (baselineMode === 'custom') {
      baseline = customBaseline;
    } else if (baselineMode === 'min') {
      baseline = Math.min(...validElevations);
    } else {
      baseline = validElevations.reduce((s, v) => s + v, 0) / validElevations.length;
    }

    let cutVolume = 0;
    let fillVolume = 0;
    for (const elev of validElevations) {
      const delta = elev - baseline;
      if (delta > 0) fillVolume += delta * cellArea;
      else cutVolume += Math.abs(delta) * cellArea;
    }

    return {
      cutVolume,
      fillVolume,
      netVolume: fillVolume - cutVolume,
      cellCount: validElevations.length,
      area: validElevations.length * cellArea,
      baseline,
    };
  };

  const onToggleVolumeDraw = (layerId, baselineMode, customBaseline, noDataOverride) => {
    if (isVolumeDrawing.value) {
      stopVolumeDraw();
      return;
    }
    const map = mapStore.getMap();
    if (!map || !layerId) return;

    isVolumeDrawing.value = true;
    volumeResult.value = null;

    if (volumeDrawLayer) {
      map.removeLayer(volumeDrawLayer);
      volumeDrawLayer = null;
      volumeDrawSource = null;
    }

    volumeDrawSource = new VectorSource();
    volumeDrawLayer = markRaw(new VectorLayer({
      source: volumeDrawSource,
      style: polygonStyle,
      zIndex: 9998,
    }));
    map.addLayer(volumeDrawLayer);

    const draw = new Draw({ source: volumeDrawSource, type: 'Polygon', style: polygonStyle });
    draw.on('drawend', async (evt) => {
      map.removeInteraction(volumeDrawInteraction);
      volumeDrawInteraction = null;
      isVolumeDrawing.value = false;

      const geom = evt.feature.getGeometry();
      isVolumeLoading.value = true;
      try {
        volumeResult.value = await computeVolume(layerId, geom, baselineMode, customBaseline, noDataOverride);
      } catch (e) {
        console.error('Volume calculation failed:', e.message);
      } finally {
        isVolumeLoading.value = false;
      }
    });

    volumeDrawInteraction = draw;
    map.addInteraction(draw);
  };

  const onFinishVolumeDraw = () => {
    if (volumeDrawInteraction) volumeDrawInteraction.finishDrawing();
  };

  onUnmounted(stopVolumeDraw);

  return {
    isVolumeModalVisible,
    isVolumeDrawing,
    isVolumeLoading,
    volumeResult,
    openVolumeModal,
    closeVolumeModal,
    onResetVolumeResult,
    onToggleVolumeDraw,
    onFinishVolumeDraw,
  };
}

// Ray-casting point-in-polygon test
function pointInPolygon(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}
