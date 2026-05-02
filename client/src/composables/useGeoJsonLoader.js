import { markRaw } from "vue";
import GeoJSON from "ol/format/GeoJSON";
import VectorLayer from "ol/layer/Vector";
import VectorImageLayer from "ol/layer/VectorImage";
import VectorSource from "ol/source/Vector";
import { generateUUID } from "../utils/helpers";
import { logger } from "../utils/logger";
import { getApiUrl } from "../utils/config";
import {
  buildLayerSharedStyle,
  buildGroupByStyleFunction,
  buildColorByStyleFunction,
} from "../utils/styleFactory";
import {
  Z_INDEX,
  LAYER_STATUS,
  GEOMETRY_TYPE,
  DEFAULT_COLOR,
} from "../constants/layerConstants";

export function useGeoJsonLoader(map, layerStore, activeWorkers, searchIndex) {
  const loadGeoJsonLayer = (layer) => {
    layerStore.setLayerStatus(layer._layerId, LAYER_STATUS.DOWNLOADING);

    const worker = new Worker(
      new URL("../workers/layerWorker.js", import.meta.url),
      { type: "module" },
    );
    activeWorkers.set(layer._layerId, worker);

    worker.onerror = (event) => {
      layerStore.setLayerError(layer._layerId, event.message ?? 'Worker crashed');
      worker.terminate();
      activeWorkers.delete(layer._layerId);
    };

    worker.postMessage({
      url: layer.url,
      layerId: layer._layerId,
      layerName: layer.name,
      featureCount: layer.featureCount ?? null,
      debug: !!(window.__APP_DEBUG__ || import.meta.env.DEV),
    });

    const format = new GeoJSON();
    const layerSearchIndex = new Map();
    let source = null;
    let olLayer = null;
    let detectedGeomType = GEOMETRY_TYPE.POLYGON;
    const groupByValues = new Set();

    worker.onmessage = (e) => {
      const { type, progress, chunkIndex, totalChunks, isFirst, dataProjection, geojsonChunk, metadata, error } = e.data;

      if (type === "PROGRESS") {
        layerStore.setLayerProgress(layer._layerId, progress);
      }

      if (type === "CHUNK") {
        if (isFirst) {
          layerStore.setLayerStatus(layer._layerId, LAYER_STATUS.PROCESSING);
          layerStore.setLayerProgress(layer._layerId, 0);
        }

        const readOptions = { featureProjection: map.getView().getProjection() };
        if (dataProjection) readOptions.dataProjection = dataProjection;

        if (isFirst && (window.__APP_DEBUG__ || import.meta.env.DEV)) {
          console.debug(`=== LAYER DEBUG — ${layer.name} (main thread) ===`);
          console.debug("  dataProjection (from file):",  readOptions.dataProjection ?? "undefined → OL defaults to EPSG:4326");
          console.debug("  featureProjection (map view):", map.getView().getProjection().getCode());
          const sample = geojsonChunk.features[0]?.geometry?.coordinates;
          if (sample) console.debug("  First feature raw coords:", JSON.stringify(sample)?.slice(0, 120));
        }

        const features = format.readFeatures(geojsonChunk, readOptions);

        for (const feature of features) {
          const fid = feature.get("_featureId") || feature.get("id") || generateUUID();
          feature.setId(fid);
          feature.set("_layerId", layer._layerId);
          if (!feature.get("_featureId")) feature.set("_featureId", fid);

          if (!feature.get("_thumbnailUrl") && layer.thumbnailUrl) {
            const resolved = layer.thumbnailUrl.replace(/\$<([^>]+)>/g, (_, expr) => {
              const parts = expr.split(':');
              const val = feature.get(parts[0]);
              if (val == null) return '';
              const str = String(val);
              if (parts.length === 1) return str;
              const start = parts[1] !== '' ? parseInt(parts[1], 10) : 0;
              if (parts.length === 2) return str.slice(start);
              const end = parts[2] !== '' ? parseInt(parts[2], 10) : undefined;
              return str.slice(start, end);
            });
            if (resolved) feature.set("_thumbnailUrl", resolved);
          }

          if (!feature.get("_downloadUrl") && layer.downloadUrl) {
            const resolved = layer.downloadUrl.replace(/\$<([^>]+)>/g, (_, expr) => {
              const parts = expr.split(':');
              const val = feature.get(parts[0]);
              if (val == null) return '';
              const str = String(val);
              if (parts.length === 1) return str;
              const start = parts[1] !== '' ? parseInt(parts[1], 10) : 0;
              if (parts.length === 2) return str.slice(start);
              const end = parts[2] !== '' ? parseInt(parts[2], 10) : undefined;
              return str.slice(start, end);
            });
            if (resolved) feature.set("_downloadUrl", resolved);
          }

          if (layer.groupBy) {
            const val = feature.get(layer.groupBy);
            if (val != null && String(val) !== "") groupByValues.add(String(val));
          }

          if (layer.searchFields?.length) {
            const props = feature.getProperties();
            for (const field of layer.searchFields) {
              const value = props[field];
              if (value != null && String(value) !== '') {
                const key = String(value).toLowerCase();
                const entry = { feature, displayValue: String(value) };
                const existing = layerSearchIndex.get(key);
                if (existing) {
                  existing.push(entry);
                } else {
                  layerSearchIndex.set(key, [entry]);
                }
              }
            }
          }
        }

        if (isFirst) {
          const firstWithGeom = features.find(f => f.getGeometry() != null);
          if (firstWithGeom) {
            const firstType = firstWithGeom.getGeometry().getType();
            if (firstType === GEOMETRY_TYPE.POINT || firstType === GEOMETRY_TYPE.MULTI_POINT) {
              detectedGeomType = GEOMETRY_TYPE.POINT;
            } else if (firstType === GEOMETRY_TYPE.LINE_STRING || firstType === GEOMETRY_TYPE.MULTI_LINE_STRING) {
              detectedGeomType = GEOMETRY_TYPE.LINE;
            }
          }

          const sharedStyle = buildLayerSharedStyle(
            layer.color,
            layer.strokeColor ?? null,
            layer.fillColor ?? null,
            detectedGeomType,
            layer.pointType ?? null,
          );

          source = new VectorSource({ features });
          const LayerClass = layer.renderMode === "image" ? VectorImageLayer : VectorLayer;
          const layerStyle = layer.groupBy
            ? buildGroupByStyleFunction(layer._layerId, layerStore)
            : layer.colorBy
              ? buildColorByStyleFunction(layer.colorBy, layer.pointType ?? null)
              : sharedStyle;

          olLayer = new LayerClass({
            source,
            style: layerStyle,
            visible: layer.active,
            zIndex: Z_INDEX.OVERLAY,
            updateWhileAnimating: false,
            updateWhileInteracting: false,
            properties: { id: layer._layerId },
          });

          const storeLayer = layerStore.layers.find((l) => l._layerId === layer._layerId);
          if (storeLayer) {
            storeLayer.layerInstance = markRaw(olLayer);
            storeLayer.geometryType = detectedGeomType;
          }
          map.addLayer(olLayer);
          layerStore.updateLayerZIndexes();
        } else {
          source.addFeatures(features);
        }

        if (totalChunks > 0) layerStore.setLayerProgress(layer._layerId, Math.round(((chunkIndex + 1) / totalChunks) * 100));
      }

      if (type === "COMPLETE") {
        searchIndex.set(layer._layerId, layerSearchIndex);

        // Resolve links.json sidecar → inject _model3dUrls / _pointcloudUrls into features
        if (layer._layerId && source) {
          applyLinksToFeatures(layer._layerId, source).catch(() => { /* non-fatal */ });
        }

        const storeLayer = layerStore.layers.find((l) => l._layerId === layer._layerId);

        if (layer.groupBy) {
          if (groupByValues.size > 0) {
            const baseColor = layer.strokeColor || layer.color || DEFAULT_COLOR;
            const categories = {};
            for (const val of [...groupByValues].sort()) {
              categories[val] = { color: baseColor, visible: true };
            }
            layerStore.initSubCategories(layer._layerId, categories);
            if (olLayer) olLayer.changed();
          } else {
            const msg = `group_by field "${layer.groupBy}" not found in any feature. Check the spelling in config.yaml.`;
            logger.warn("LayerManager", `Layer "${layer.name}": ${msg}`);
            if (storeLayer) {
              storeLayer.groupByMissing = true;
              storeLayer.warning = msg;
            }
          }
        }

        if (storeLayer) {
          storeLayer.status = LAYER_STATUS.READY;
          storeLayer.metadata = metadata ?? {};
        }

        worker.terminate();
        activeWorkers.delete(layer._layerId);
      }

      if (type === "ERROR") {
        logger.error("LayerManager", "Worker Error:", error);
        layerStore.setLayerError(layer._layerId, error);
        worker.terminate();
        activeWorkers.delete(layer._layerId);
      }
    };
  };

  return { loadGeoJsonLayer };
}

async function applyLinksToFeatures(layerId, source) {
  const linksRes = await fetch(getApiUrl(`/layers/${layerId}/links`));
  if (!linksRes.ok) return;
  const links = await linksRes.json();
  const featureLinks = links.featureLinks ?? [];
  if (!featureLinks.length) return;

  // Collect unique 3D layer IDs to resolve their file extensions
  const allLayerIds = new Set();
  for (const fl of featureLinks) {
    (fl.modelLayerIds ?? []).forEach(id => allLayerIds.add(id));
    (fl.pointcloudLayerIds ?? []).forEach(id => allLayerIds.add(id));
  }
  if (!allLayerIds.size) return;

  // Fetch meta for each 3D layer (parallel), build id→{ url, name } map
  const metaResults = await Promise.allSettled(
    [...allLayerIds].map(async id => {
      const res = await fetch(getApiUrl(`/layers/${id}/meta`));
      if (!res.ok) return null;
      const m = await res.json();
      return { id, url: getApiUrl(`/data/layers/${id}/${id}${m.extension}`), name: m.name };
    })
  );
  const urlMap = new Map();
  for (const r of metaResults) {
    if (r.status === 'fulfilled' && r.value) urlMap.set(r.value.id, r.value);
  }

  // Build featureId → { modelUrls, pcUrls, modelNames, pcNames } lookup
  const linkMap = new Map();
  for (const fl of featureLinks) {
    const modelUrls  = (fl.modelLayerIds ?? []).map(id => urlMap.get(id)?.url).filter(Boolean);
    const pcUrls     = (fl.pointcloudLayerIds ?? []).map(id => urlMap.get(id)?.url).filter(Boolean);
    const modelNames = (fl.modelLayerIds ?? []).map(id => urlMap.get(id)?.name).filter(Boolean);
    const pcNames    = (fl.pointcloudLayerIds ?? []).map(id => urlMap.get(id)?.name).filter(Boolean);
    if (modelUrls.length || pcUrls.length) linkMap.set(fl.featureId, { modelUrls, pcUrls, modelNames, pcNames });
  }
  if (!linkMap.size) return;

  // Inject into OL features
  for (const feature of source.getFeatures()) {
    const fid = feature.get('_featureId');
    if (!fid) continue;
    const entry = linkMap.get(fid);
    if (!entry) continue;
    if (entry.modelUrls.length) {
      feature.set('_model3dUrls', entry.modelUrls);
      if (entry.modelNames.length) feature.set('_model3dNames', entry.modelNames);
    }
    if (entry.pcUrls.length) {
      feature.set('_pointcloudUrls', entry.pcUrls);
      if (entry.pcNames.length) feature.set('_pointcloudNames', entry.pcNames);
    }
  }
}
