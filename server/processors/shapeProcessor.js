/**
 * shapeProcessor.js — shared GeoJSON processing logic.
 * Used by both preprocess.js (batch mode) and uploadProcessor.js (per-upload).
 *
 * Exported functions work with in-memory GeoJSON objects so they can be called
 * from any context (file-system batch or memory-buffer upload).
 */
import path from 'path';
import * as turf from '@turf/turf';
import { reproject } from 'reproject';
import epsg from 'epsg-index/all.json' with { type: 'json' };
import { v4 as uuidv4 } from 'uuid';

// ── CRS detection ──────────────────────────────────────────────────────────────

export function detectCrsFromGeojson(geojson) {
  const name = geojson?.crs?.properties?.name ?? '';
  if (!name) return 'EPSG:4326';
  if (name.includes('CRS84')) return 'EPSG:4326';
  // "EPSG:4326" or "urn:ogc:def:crs:EPSG::4326"
  const colonMatch = name.match(/EPSG::?(\d+)/i);
  if (colonMatch) return `EPSG:${colonMatch[1]}`;
  // "http://www.opengis.net/def/crs/EPSG/0/4326"
  const slashMatch = name.match(/\/EPSG\/\d+\/(\d+)/i);
  if (slashMatch) return `EPSG:${slashMatch[1]}`;
  return 'EPSG:4326';
}

// ── Normalise any GeoJSON to FeatureCollection ─────────────────────────────────

export function normaliseFeatureCollection(geojson) {
  if (geojson.type === 'Feature') {
    return { type: 'FeatureCollection', features: [geojson] };
  }
  return geojson;
}

// ── Reproject ──────────────────────────────────────────────────────────────────

/** Normalise user-supplied CRS strings: "25832" → "EPSG:25832", "epsg:25832" → "EPSG:25832" */
function normaliseEpsg(code) {
  if (!code) return null;
  const s = String(code).trim();
  if (/^\d+$/.test(s)) return `EPSG:${s}`;                  // bare number
  if (/^EPSG:\d+$/i.test(s)) return `EPSG:${s.split(':')[1]}`; // case-normalise
  return s;
}

/**
 * Reproject a FeatureCollection to targetCrs.
 * Returns { geojson, step, sourceCrs, targetCrs } — step is a human-readable description.
 * @param {string|null} overrideSourceCrs — override auto-detected source CRS
 */
export function reprojectGeojson(geojson, targetCrs, overrideSourceCrs = null) {
  const sourceCrs = normaliseEpsg(overrideSourceCrs) ?? detectCrsFromGeojson(geojson);
  const normTarget = normaliseEpsg(targetCrs) ?? targetCrs;
  if (sourceCrs === normTarget) {
    return { geojson, step: `CRS already ${normTarget} — no reprojection needed`, sourceCrs, targetCrs: normTarget };
  }

  const fromDef = epsg[sourceCrs.split(':')[1]]?.proj4;
  const toDef   = epsg[normTarget.split(':')[1]]?.proj4;

  if (!fromDef || !toDef) {
    return {
      geojson,
      step: `Reprojection skipped — unknown CRS definition for ${sourceCrs} or ${normTarget}`,
      sourceCrs,
      targetCrs: sourceCrs,
    };
  }

  try {
    const reprojected = reproject(geojson, fromDef, toDef);
    return { geojson: reprojected, step: `Reprojected ${sourceCrs} → ${normTarget}`, sourceCrs, targetCrs: normTarget };
  } catch (err) {
    return { geojson, step: `Reprojection failed: ${err.message} — data kept in ${sourceCrs}`, sourceCrs, targetCrs: sourceCrs };
  }
}

// ── Simplify ───────────────────────────────────────────────────────────────────

export function simplifyGeojson(geojson, tolerance) {
  if (!tolerance || tolerance <= 0) return geojson;
  try {
    return turf.simplify(geojson, { tolerance, highQuality: false, mutate: false });
  } catch {
    return geojson; // Points or mixed geometry — ignore
  }
}

// ── Truncate ───────────────────────────────────────────────────────────────────

export function truncateGeojson(geojson, precision) {
  try {
    return turf.truncate(geojson, { precision, coordinates: 2, mutate: false });
  } catch {
    return geojson;
  }
}

// ── Feature ID stamping ────────────────────────────────────────────────────────

export function stampFeatureIds(geojson) {
  geojson.features = geojson.features.map((f) => {
    if (!f.properties) f.properties = {};
    if (!f.properties._featureId) f.properties._featureId = uuidv4();
    return f;
  });
  return geojson;
}

// ── Link 3D assets to features ─────────────────────────────────────────────────
/**
 * Given a FeatureCollection and a map of { basename → serverUrl } for 3D models
 * and point clouds, try to match them to features by comparing property values.
 *
 * Matching strategy (in order):
 *  1. Feature property value equals the file's stem (case-insensitive)
 *  2. Any property value is contained in the filename stem (substring)
 *
 * Matched files are written to feature.properties._model3dUrls /
 * feature.properties._pointcloudUrls so the client can open them.
 */
export function linkAssetsToFeatures(geojson, modelMap, pointcloudMap) {
  if (!modelMap.size && !pointcloudMap.size) return { geojson, linkedCount: 0, linkedAssets: { models: {}, pointclouds: {} } };

  let linkedCount = 0;
  const modelCounts = {};
  const pointcloudCounts = {};

  geojson.features = geojson.features.map((feature) => {
    if (!feature.properties) feature.properties = {};
    const propValues = Object.values(feature.properties).map((v) =>
      String(v ?? '').toLowerCase()
    );

    // Models
    const models = [];
    for (const [stem, url] of modelMap) {
      const stemLower = stem.toLowerCase();
      // Require exact match OR: the stem contains the property value, but only
      // if the value is at least 4 characters (avoids over-matching on 'a', 'id', etc.)
      if (propValues.some((v) => v === stemLower || (v.length >= 4 && stemLower.includes(v)))) {
        models.push(url);
        modelCounts[stem] = (modelCounts[stem] ?? 0) + 1;
      }
    }
    if (models.length) {
      feature.properties._model3dUrls = [
        ...(feature.properties._model3dUrls ?? []),
        ...models,
      ];
      linkedCount++;
    }

    // Point clouds
    const clouds = [];
    for (const [stem, url] of pointcloudMap) {
      const stemLower = stem.toLowerCase();
      if (propValues.some((v) => v === stemLower || (v.length >= 4 && stemLower.includes(v)))) {
        clouds.push(url);
        pointcloudCounts[stem] = (pointcloudCounts[stem] ?? 0) + 1;
      }
    }
    if (clouds.length) {
      feature.properties._pointcloudUrls = [
        ...(feature.properties._pointcloudUrls ?? []),
        ...clouds,
      ];
      linkedCount++;
    }

    return feature;
  });

  return { geojson, linkedCount, linkedAssets: { models: modelCounts, pointclouds: pointcloudCounts } };
}

// ── Full pipeline ──────────────────────────────────────────────────────────────

/**
 * Run the full shape processing pipeline on a parsed GeoJSON object.
 * Returns { geojson, steps, sourceCrs, targetCrs }.
 * @param {string|null} sourceCrs — override auto-detected source CRS
 */
export function processGeoJsonObject(geojson, { targetCrs, simplifyTolerance, coordinatePrecision, modelMap, pointcloudMap, sourceCrs: overrideSourceCrs = null }) {
  const steps = [];

  geojson = normaliseFeatureCollection(geojson);
  geojson = stampFeatureIds(geojson);

  const { geojson: reprojected, step: reprojectStep, sourceCrs, targetCrs: actualTargetCrs } = reprojectGeojson(geojson, targetCrs ?? 'EPSG:3031', overrideSourceCrs);
  geojson = reprojected;
  steps.push(reprojectStep);

  geojson = simplifyGeojson(geojson, simplifyTolerance ?? 50);
  if (simplifyTolerance > 0) steps.push(`Simplified (tolerance ${simplifyTolerance} m)`);

  const prec = coordinatePrecision ?? 0;
  geojson = truncateGeojson(geojson, prec);
  steps.push(prec === 0
    ? 'Coordinates rounded to whole units (precision 0)'
    : `Coordinates truncated to ${prec} decimal place${prec === 1 ? '' : 's'}`);

  if (modelMap?.size || pointcloudMap?.size) {
    const { geojson: linked, linkedCount } = linkAssetsToFeatures(geojson, modelMap ?? new Map(), pointcloudMap ?? new Map());
    geojson = linked;
    if (linkedCount > 0) steps.push(`Linked assets to ${linkedCount} feature(s)`);
    else steps.push('No automatic asset–feature matches found (you can link manually via URL fields)');
  }

  // Stamp the output CRS so the client (layerWorker) can set dataProjection correctly.
  // Without this, OpenLayers defaults to EPSG:4326 and double-reprojects the coordinates.
  const epsgNum = actualTargetCrs?.split(':')[1];
  if (epsgNum) {
    geojson.crs = { type: 'name', properties: { name: `urn:ogc:def:crs:EPSG::${epsgNum}` } };
  } else {
    delete geojson.crs;
  }

  return { geojson, steps, sourceCrs, targetCrs: actualTargetCrs };
}
