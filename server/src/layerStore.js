/**
 * layerStore.js — manages the layer registry.
 *
 * Each uploaded file ("layer") lives in its own UUID directory:
 *   data/layers/{uuid}/
 *     {uuid}.{ext}           — main data file (renamed on upload)
 *     {uuid}.meta.json       — sidecar with all metadata
 *     original_{uuid}.{ext}  — backup of the original (if keepOriginal = true)
 *     {subId}.{ext}          — sub-files (CSV, MTL, textures, linked 3D, pointclouds)
 *     {subId}.meta.json      — sub-file metadata (optional, for primary sub-files)
 *
 * Sub-file roles:
 *   attributes   — CSV that gets joined to GeoJSON features
 *   material     — MTL companion for OBJ models
 *   texture      — texture image referenced by an MTL
 *   model        — 3D model linked to GeoJSON features
 *   pointcloud   — point cloud linked to GeoJSON features
 */

import fs   from 'fs/promises';
import path from 'path';

// ── Meta factory ───────────────────────────────────────────────────────────────

export function createLayerMeta({ id, originalName, fileType, options = {} }) {
  return {
    id,
    originalName,
    extension: path.extname(originalName).toLowerCase(),
    fileType,                                          // geojson | geotiff | model | pointcloud
    uploadedAt: new Date().toISOString(),
    status: 'ready',                                   // ready | optimizing | error
    optimized: false,
    optimizationType: null,                            // cog | copc | simplify | decimate
    keepOriginal:   options.keepOriginal   ?? false,
    originalBackup: null,                              // backup filename when keepOriginal=true
    sourceCrs:    null,                                // CRS of the original source file
    targetCrs:    null,                                // CRS stored on disk after reprojection
    featureCount: null,                                // number of features (geojson/csv only)
    featureIndex: null,                                // [{ id, index }] per-feature uuid map (geojson/csv only)
    subFiles: [],
    layerConfig: {
      displayName: options.displayName ?? path.parse(originalName).name,
      visible:     options.visible     ?? true,
      order:       options.order       ?? 0,
      type:        fileTypeToLayerType(fileType),
    },
    processingLog: [],
  };
}

export function createSubFileMeta({ id, originalName, fileType, role }) {
  return {
    id,
    originalName,
    extension: path.extname(originalName).toLowerCase(),
    fileType,
    role,                                              // see roles above
    uploadedAt: new Date().toISOString(),
    companions: [],                                    // e.g. MTL → texture ids
  };
}

export function fileTypeToLayerType(fileType) {
  switch (fileType) {
    case 'geojson':    return 'geojson';
    case 'geotiff':    return 'geotiff';
    case 'model':      return 'model';
    case 'pointcloud': return 'pointcloud';
    case 'csv':        return 'csv';
    default:           return 'unknown';
  }
}

// ── Path helpers ──────────────────────────────────────────────────────────────

const SAFE_LAYER_EXTENSIONS = new Set([
  '.geojson', '.geojsonl',
  '.tif', '.tiff',
  '.obj', '.ply', '.stl',
  '.las', '.laz', '.copc.laz',
  '.mtl', '.csv',
  '.jpg', '.jpeg', '.png', '.bmp', '.tga', '.webp',
]);

export function safeLayerExt(ext) {
  const e = typeof ext === 'string' ? ext.toLowerCase() : '';
  if (!SAFE_LAYER_EXTENSIONS.has(e)) throw new Error(`Disallowed file extension: ${e}`);
  return e;
}

export function resolveInDir(baseDir, ...parts) {
  const base = path.resolve(baseDir);
  const full = path.resolve(base, ...parts);
  if (!full.startsWith(base + path.sep)) throw new Error('Path traversal detected.');
  return full;
}

// ── CRUD ───────────────────────────────────────────────────────────────────────

export async function readLayerMeta(layersDir, id) {
  const metaPath = resolveInDir(layersDir, id, `${id}.meta.json`);
  try {
    const raw = await fs.readFile(metaPath, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`Layer ${id} not found: ${err.message}`);
  }
}

export async function writeLayerMeta(layersDir, id, meta) {
  const metaPath = resolveInDir(layersDir, id, `${id}.meta.json`);
  await fs.writeFile(metaPath, JSON.stringify(meta, null, 2), 'utf8');
}

export async function listLayers(layersDir) {
  try {
    const entries = await fs.readdir(layersDir, { withFileTypes: true });
    const layers = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      try {
        const meta = await readLayerMeta(layersDir, entry.name);
        layers.push(meta);
      } catch { /* skip dirs without valid sidecar */ }
    }
    return layers.sort((a, b) => (a.layerConfig.order ?? 0) - (b.layerConfig.order ?? 0));
  } catch {
    return [];
  }
}

export async function deleteLayer(layersDir, id) {
  validateLayerId(id);
  const layerDir = resolveInDir(layersDir, id);
  await fs.rm(layerDir, { recursive: true, force: true });

  // Scrub the deleted ID from featureLinks and csvLinks of all remaining layers
  let entries;
  try { entries = await fs.readdir(layersDir, { withFileTypes: true }); } catch { return; }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const linksPath = resolveInDir(layersDir, entry.name, `${entry.name}.links.json`);
    let links;
    try { links = JSON.parse(await fs.readFile(linksPath, 'utf8')); } catch { continue; }

    let changed = false;
    if (Array.isArray(links.featureLinks)) {
      for (const fl of links.featureLinks) {
        if (Array.isArray(fl.modelLayerIds) && fl.modelLayerIds.includes(id)) {
          fl.modelLayerIds = fl.modelLayerIds.filter(lid => lid !== id);
          changed = true;
        }
        if (Array.isArray(fl.pointcloudLayerIds) && fl.pointcloudLayerIds.includes(id)) {
          fl.pointcloudLayerIds = fl.pointcloudLayerIds.filter(lid => lid !== id);
          changed = true;
        }
      }
      // Drop feature entries that have no links left
      const before = links.featureLinks.length;
      links.featureLinks = links.featureLinks.filter(
        fl => fl.modelLayerIds.length > 0 || fl.pointcloudLayerIds.length > 0
      );
      if (links.featureLinks.length !== before) changed = true;
    }
    if (Array.isArray(links.csvLinks)) {
      const before = links.csvLinks.length;
      links.csvLinks = links.csvLinks.filter(cl => cl.dataLayerId !== id);
      if (links.csvLinks.length !== before) changed = true;
    }

    if (changed) {
      await fs.writeFile(linksPath, JSON.stringify(links, null, 2), 'utf8');
    }
  }
}

// ── Links sidecar ─────────────────────────────────────────────────────────────
// Each 2D layer can have a {uuid}.links.json that stores references to
// linked 3D layers (per feature) and CSV data layers (per layer).
// The GeoJSON file itself is never modified.

export async function readLinks(layersDir, id) {
  const linksPath = resolveInDir(layersDir, id, `${id}.links.json`);
  try {
    const raw = await fs.readFile(linksPath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return { csvLinks: [], featureLinks: [] };
  }
}

export async function writeLinks(layersDir, id, links) {
  const linksPath = resolveInDir(layersDir, id, `${id}.links.json`);
  await fs.writeFile(linksPath, JSON.stringify(links, null, 2), 'utf8');
}

// ── Config serialisation ───────────────────────────────────────────────────────

/**
 * Convert a layer's sidecar meta into a minimal config.yaml layer entry.
 * The server URL must be passed in so it can be built into the url field.
 */
export function metaToConfigLayer(meta, serverBaseUrl) {
  const url = `${serverBaseUrl}/data/layers/${meta.id}/${meta.id}${meta.extension}`;
  const base = {
    name:    meta.layerConfig.displayName,
    type:    meta.layerConfig.type,
    url,
    visible: meta.layerConfig.visible ?? true,
    order:   meta.layerConfig.order   ?? 0,
    _layerId: meta.id,                         // back-reference kept in YAML for admin re-load
  };
  // Carry over any additional type-specific config fields that were set on this layer
  const extras = { ...meta.layerConfig };
  delete extras.displayName;
  delete extras.visible;
  delete extras.order;
  delete extras.type;
  return { ...base, ...extras };
}

// ── Helpers ────────────────────────────────────────────────────────────────────

export function validateLayerId(id) {
  if (typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    throw new Error('Invalid layer ID format.');
  }
}
