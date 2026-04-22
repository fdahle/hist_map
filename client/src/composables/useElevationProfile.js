import { ref, markRaw, onUnmounted } from 'vue';
import Feature from 'ol/Feature';
import { Point } from 'ol/geom';
import Draw from 'ol/interaction/Draw';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import { getLength } from 'ol/sphere';
import { Stroke, Style, Fill, Circle as CircleStyle } from 'ol/style';
import { transform as olTransform, get as getOlProjection } from 'ol/proj';
import { fromBlob, fromUrl } from 'geotiff';
import { sampleLinePoints, bilinear } from '../utils/elevationSampling';

export function useElevationProfile(mapStore, layerStore, layerManagerRef) {
  const isElevationModalVisible = ref(false);
  const isElevationDrawing = ref(false);
  const isElevationLoading = ref(false);
  const elevationProfile = ref(null);

  let elevationDrawInteraction = null;
  let elevationDrawLayer = null;
  let elevationDrawSource = null;
  let elevationDrawGeom = null;
  let elevationHoverFeature = null;

  const elevationLineStyle = new Style({
    stroke: new Stroke({ color: '#f59e0b', width: 2, lineDash: [6, 4] }),
    image: new CircleStyle({
      radius: 4,
      fill: new Fill({ color: '#f59e0b' }),
      stroke: new Stroke({ color: '#fff', width: 1.5 }),
    }),
  });

  const elevationHoverStyle = new Style({
    image: new CircleStyle({
      radius: 7,
      fill: new Fill({ color: '#f59e0b' }),
      stroke: new Stroke({ color: '#fff', width: 2.5 }),
    }),
  });

  const stopElevationDraw = () => {
    const map = mapStore.getMap();
    if (elevationDrawInteraction && map) {
      map.removeInteraction(elevationDrawInteraction);
      elevationDrawInteraction = null;
    }
    if (elevationDrawLayer && map) {
      map.removeLayer(elevationDrawLayer);
      elevationDrawLayer = null;
      elevationDrawSource = null;
    }
    elevationDrawGeom = null;
    elevationHoverFeature = null;
    isElevationDrawing.value = false;
  };

  const openElevationModal = () => {
    isElevationModalVisible.value = true;
  };

  const closeElevationModal = () => {
    isElevationModalVisible.value = false;
    stopElevationDraw();
    elevationProfile.value = null;
    layerManagerRef.value?.setSelectionActive(true);
  };

  const onResetElevationProfile = () => {
    stopElevationDraw();
    elevationProfile.value = null;
  };

  const computeElevationProfile = async (layerId, lineGeom, noDataOverride) => {
    const layerObj = layerStore.getLayerById(layerId);
    if (!layerObj) throw new Error('Layer not found');

    const meta = layerObj.metadata ?? {};
    const { file, extent, tiffProjection, noDataValue } = meta;
    const mapCRS = mapStore.getMap().getView().getProjection().getCode();
    const totalLength = getLength(lineGeom, { projection: mapCRS });

    const NUM_SAMPLES = 300;
    const mapCoords = lineGeom.getCoordinates();
    const samplePts = sampleLinePoints(mapCoords, NUM_SAMPLES);

    let tiffPts = samplePts;
    if (tiffProjection && tiffProjection !== mapCRS) {
      const fromProj = getOlProjection(mapCRS);
      const toProj   = getOlProjection(tiffProjection);
      if (fromProj && toProj) {
        tiffPts = samplePts.map(pt => olTransform(pt, mapCRS, tiffProjection));
      }
    }

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

    const pixelSizeX = imgW > 0 ? fullW / imgW : 1;
    const pixelSizeY = imgH > 0 ? fullH / imgH : 1;
    const pad = Math.max(pixelSizeX, pixelSizeY) * 2;

    const xs = tiffPts.map(p => p[0]);
    const ys = tiffPts.map(p => p[1]);
    let bbox = [
      Math.min(...xs) - pad, Math.min(...ys) - pad,
      Math.max(...xs) + pad, Math.max(...ys) + pad,
    ];

    if (extent) {
      const [ex0, ey0, ex1, ey1] = extent;
      const noOverlap = bbox[0] > ex1 || bbox[2] < ex0 || bbox[1] > ey1 || bbox[3] < ey0;
      if (noOverlap) {
        return { elevations: new Array(samplePts.length).fill(NaN), totalLength };
      }
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
    const MAX_RES = 1024;
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

    if (effectiveNoData !== null && effectiveNoData !== undefined) {
      const tol = Math.max(0.5, Math.abs(effectiveNoData) * 1e-6);
      for (let i = 0; i < data.length; i++) {
        if (Math.abs(data[i] - effectiveNoData) <= tol) data[i] = NaN;
      }
    }

    const [ex0, ey0, ex1, ey1] = extent ?? [];
    const xTol = extent ? (ex1 - ex0) * 1e-4 : 0;
    const yTol = extent ? (ey1 - ey0) * 1e-4 : 0;
    const elevations = tiffPts.map(([x, y]) => {
      if (extent && (x < ex0 - xTol || x > ex1 + xTol || y < ey0 - yTol || y > ey1 + yTol)) return NaN;
      const fx = ((x - bbox[0]) / bboxW) * readW - 0.5;
      const fy = ((bbox[3] - y) / bboxH) * readH - 0.5;
      if (fx < -0.5 || fx > readW - 0.5 || fy < -0.5 || fy > readH - 0.5) return NaN;
      return bilinear(data, readW, readH, fx, fy);
    });

    return { elevations, totalLength };
  };

  const onToggleElevationDraw = (layerId, noDataOverride) => {
    if (isElevationDrawing.value) {
      stopElevationDraw();
      return;
    }
    const map = mapStore.getMap();
    if (!map || !layerId) return;

    isElevationDrawing.value = true;
    elevationProfile.value = null;

    if (elevationDrawLayer) {
      map.removeLayer(elevationDrawLayer);
      elevationDrawLayer = null;
      elevationDrawSource = null;
    }
    elevationDrawGeom = null;
    elevationHoverFeature = null;

    elevationDrawSource = new VectorSource();
    elevationDrawLayer = markRaw(new VectorLayer({
      source: elevationDrawSource,
      style: elevationLineStyle,
      zIndex: 9998,
    }));
    map.addLayer(elevationDrawLayer);

    const draw = new Draw({ source: elevationDrawSource, type: 'LineString', style: elevationLineStyle, maxPoints: 50 });
    draw.on('drawend', async (evt) => {
      map.removeInteraction(elevationDrawInteraction);
      elevationDrawInteraction = null;
      isElevationDrawing.value = false;

      const geom = evt.feature.getGeometry();
      elevationDrawGeom = geom;
      isElevationLoading.value = true;
      try {
        elevationProfile.value = await computeElevationProfile(layerId, geom, noDataOverride);
        if (elevationDrawSource) {
          const hoverPt = markRaw(new Feature(new Point([0, 0])));
          hoverPt.setStyle([]);
          elevationDrawSource.addFeature(hoverPt);
          elevationHoverFeature = hoverPt;
        }
      } catch (e) {
        console.error('Elevation profile failed:', e.message);
      } finally {
        isElevationLoading.value = false;
      }
    });

    elevationDrawInteraction = draw;
    map.addInteraction(draw);
  };

  const onFinishElevationDraw = () => {
    if (elevationDrawInteraction) elevationDrawInteraction.finishDrawing();
  };

  const onElevationHoverProfile = (fraction) => {
    if (!elevationHoverFeature || !elevationDrawGeom) return;
    if (fraction === null) {
      elevationHoverFeature.setStyle([]);
      return;
    }
    const coord = elevationDrawGeom.getCoordinateAt(fraction);
    if (!coord) return;
    elevationHoverFeature.getGeometry().setCoordinates(coord);
    elevationHoverFeature.setStyle(elevationHoverStyle);
  };

  onUnmounted(stopElevationDraw);

  return {
    isElevationModalVisible,
    isElevationDrawing,
    isElevationLoading,
    elevationProfile,
    openElevationModal,
    closeElevationModal,
    stopElevationDraw,
    onResetElevationProfile,
    onToggleElevationDraw,
    onFinishElevationDraw,
    onElevationHoverProfile,
  };
}
