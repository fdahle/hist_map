/**
 * uploadProcessor.js — handles incoming admin file uploads.
 *
 * Each uploaded primary file gets its own UUID directory under data/layers/:
 *   data/layers/{uuid}/
 *     {uuid}.{ext}           — main data file (original name preserved in meta)
 *     {uuid}.meta.json       — sidecar with all metadata
 *     {subId}.{ext}          — sub-files (MTL, textures, linked 3D, pointclouds, CSV)
 *
 * Grouping rules when multiple files are uploaded at once:
 *   • A GeoJSON is the primary; .obj/.ply/.stl/.las/.laz uploaded together become
 *     sub-files of that GeoJSON and are auto-linked into matching features.
 *   • If no GeoJSON is present, each model / pointcloud becomes its own layer.
 *   • GeoTIFFs are always standalone layers.
 *   • MTL and texture files are companions of the OBJ in the same upload.
 *
 * Per-file settings are passed from the client upload modal as a JSON field
 * keyed by original filename.
 */
import path   from 'path';
import fs     from 'fs/promises';
import { v4 as uuidv4 } from 'uuid';
import { parse as csvParse } from 'csv-parse/sync';

import { normalizeFilename }     from '../src/utils.js';
import { processGeoJsonObject, linkAssetsToFeatures, computeGeojsonStats } from './shapeProcessor.js';
import { convertToCopc, extractPointCloudInfo } from './pointcloudProcessor.js';
import { extractGeoTiffInfo } from './geotiffProcessor.js';
import epsg from 'epsg-index/all.json' with { type: 'json' };
import {
  createLayerMeta,
  createSubFileMeta,
  writeLayerMeta,
  writeFeatureIndex,
  readLayerMeta,
  resolveInDir,
  safeLayerExt,
} from '../src/layerStore.js';

// ── File-type helpers ──────────────────────────────────────────────────────────

const GEOJSON_EXTS    = new Set(['.geojson', '.json']);
const GEOTIFF_EXTS    = new Set(['.tif', '.tiff']);
const MODEL_EXTS      = new Set(['.obj', '.ply', '.stl']);
const POINTCLOUD_EXTS = new Set(['.las', '.laz']);

const TEXTURE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.bmp', '.tga', '.gif', '.webp']);

export function classifyExt(filename) {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.copc.laz')) return 'pointcloud';
  const ext = path.extname(lower);
  if (GEOJSON_EXTS.has(ext))    return 'geojson';
  if (GEOTIFF_EXTS.has(ext))    return 'geotiff';
  if (MODEL_EXTS.has(ext))      return 'model';
  if (POINTCLOUD_EXTS.has(ext)) return 'pointcloud';
  if (ext === '.csv')           return 'csv';
  return 'unknown';
}

function countModelElements(buffer, ext) {
  try {
    if (ext === '.ply') {
      const header = buffer.slice(0, Math.min(4096, buffer.length)).toString('utf8');
      const vertMatch = header.match(/element vertex\s+(\d+)/);
      const faceMatch = header.match(/element face\s+(\d+)/);
      return {
        vertices: vertMatch ? parseInt(vertMatch[1], 10) : null,
        faces:    faceMatch ? parseInt(faceMatch[1], 10) : null,
      };
    }
    if (ext === '.obj') {
      let vertices = 0, faces = 0, lineStart = true;
      for (let i = 0; i < buffer.length; i++) {
        const b = buffer[i];
        if (lineStart) {
          const next = buffer[i + 1];
          if      (b === 0x76 && (next === 0x20 || next === 0x09)) vertices++; // 'v '
          else if (b === 0x66 && (next === 0x20 || next === 0x09)) faces++;    // 'f '
        }
        lineStart = (b === 0x0a); // '\n'
      }
      return { vertices: vertices || null, faces: faces || null };
    }
    if (ext === '.stl') {
      // Binary STL: bytes 0-79 header, bytes 80-83 uint32 face count
      if (buffer.length > 84) {
        const faces = buffer.readUInt32LE(80);
        return { vertices: null, faces };
      }
    }
  } catch { /* ignore parse errors */ }
  return { vertices: null, faces: null };
}

function isCompanion(filename) {
  const ext = path.extname(filename).toLowerCase();
  return ext === '.mtl' || TEXTURE_EXTS.has(ext);
}

function pointcloudExt(filename) {
  return filename.toLowerCase().endsWith('.copc.laz') ? '.copc.laz'
       : path.extname(filename).toLowerCase();
}

function extractTextureRefs(mtlContent) {
  return (mtlContent.match(/(?:map_Kd|map_Ka|map_Ks|map_Ns|map_d|map_bump|bump)\s+(\S+)/gi) ?? [])
    .map(m => m.split(/\s+/)[1]);
}

// ── GeoJSON / NDJSON file I/O ─────────────────────────────────────────────────

export function parseGeoFile(raw, filePath) {
  if (filePath.endsWith('.geojsonl')) {
    const lines = raw.split('\n').filter(Boolean);
    const header = lines.length > 0 ? JSON.parse(lines[0]) : {};
    const features = lines.slice(1).map((l, i) => {
      try { return JSON.parse(l); }
      catch { console.warn(`[parseGeoFile] Skipping malformed NDJSON line ${i + 2} in ${filePath}`); return null; }
    }).filter(Boolean);
    return { features, header };
  }
  const { features = [], ...rest } = JSON.parse(raw);
  return { features, header: rest };
}

export function serializeGeoFile(features, header, filePath) {
  if (filePath.endsWith('.geojsonl')) {
    const body = features.map(f => JSON.stringify(f)).join('\n');
    return `${JSON.stringify(header)}\n${body}`;
  }
  return JSON.stringify({ ...header, type: 'FeatureCollection', features });
}

// ── Main batch processor ───────────────────────────────────────────────────────

/**
 * Process an array of uploaded files into UUID-based layer storage.
 *
 * New behaviour (v2): every file type becomes a standalone layer.
 * Models and point clouds are no longer grouped as sub-files of a GeoJSON.
 * Linking is now managed separately via the links.json sidecar.
 *
 * @param {Array<{originalname:string,buffer:Buffer}>} files
 * @param {string} layersDir  — absolute path to data/layers/
 * @param {Object} allSettings — per-filename settings from the upload modal
 */
export async function processUploadBatch(files, layersDir, allSettings = {}) {
  await fs.mkdir(layersDir, { recursive: true });

  const fileMap = new Map(files.map(f => [f.originalname, f.buffer]));

  const byType = { geojson: [], geotiff: [], model: [], pointcloud: [], companion: [], csv: [] };
  for (const f of files) {
    if (isCompanion(f.originalname)) byType.companion.push(f);
    else {
      let kind = classifyExt(f.originalname);
      // A PLY with no faces is a point cloud, not a mesh
      if (kind === 'model' && path.extname(f.originalname).toLowerCase() === '.ply') {
        const { faces } = countModelElements(f.buffer, '.ply');
        if (faces === null || faces === 0) kind = 'pointcloud';
      }
      if (kind !== 'unknown') byType[kind].push(f);
    }
  }

  const results = [];

  for (const geoFile of byType.geojson) {
    results.push(await _processGeoJsonLayer(geoFile, fileMap, layersDir, allSettings));
  }

  for (const modelFile of byType.model) {
    results.push(await _processStandaloneModel(modelFile, fileMap, layersDir, allSettings));
  }

  for (const pcFile of byType.pointcloud) {
    results.push(await _processStandalonePointcloud(pcFile, layersDir, allSettings));
  }

  for (const tifFile of byType.geotiff) {
    results.push(await _processGeoTiffLayer(tifFile, layersDir, allSettings));
  }

  for (const csvFile of byType.csv) {
    results.push(await _processCsvDataLayer(csvFile, layersDir, allSettings));
  }

  return results;
}

// ── GeoJSON layer ──────────────────────────────────────────────────────────────

async function _processGeoJsonLayer(geoFile, fileMap, layersDir, allSettings) {
  const id       = uuidv4();
  const layerDir = path.join(layersDir, id);
  await fs.mkdir(layerDir, { recursive: true });

  const settings = allSettings[geoFile.originalname] ?? {};
  const meta     = createLayerMeta({ id, originalName: geoFile.originalname, fileType: 'geojson', options: settings });

  let geojson;
  try {
    geojson = JSON.parse(geoFile.buffer.toString('utf8'));
  } catch {
    throw new Error(`${geoFile.originalname} is not valid JSON.`);
  }
  if (!geojson || (geojson.type !== 'Feature' && geojson.type !== 'FeatureCollection')) {
    throw new Error(`${geoFile.originalname} does not appear to be valid GeoJSON.`);
  }

  const shapeCfg = settings.shapeSettings ?? {};
  const { geojson: processed, steps, sourceCrs, targetCrs } = processGeoJsonObject(geojson, {
    targetCrs:           shapeCfg.targetCrs           ?? 'EPSG:3031',
    simplifyTolerance:   shapeCfg.simplifyTolerance   ?? 50,
    coordinatePrecision: shapeCfg.coordinatePrecision ?? 0,
    sourceCrs:           shapeCfg.sourceCrs           ?? null,
  });

  if (settings.keepOriginal) {
    const backupName = `original_${id}.geojson`;
    await fs.writeFile(path.join(layerDir, backupName), geoFile.buffer);
    meta.originalBackup = backupName;
  }

  const features = processed.features ?? [];

  const saveAsNdjson = settings.optimize === 'ndjson';
  let fileSizeBytes = 0;
  if (saveAsNdjson) {
    const ndjsonHeader = JSON.stringify({ _crs: targetCrs ?? null });
    const ndjsonBody   = features.map(f => JSON.stringify(f)).join('\n');
    const ndjsonStr    = `${ndjsonHeader}\n${ndjsonBody}`;
    await fs.writeFile(path.join(layerDir, `${id}.geojsonl`), ndjsonStr, 'utf8');
    fileSizeBytes      = Buffer.byteLength(ndjsonStr, 'utf8');
    meta.extension     = '.geojsonl';
    meta.optimized     = true;
    steps.push('Saved as optimized NDJSON (line-delimited GeoJSON).');
  } else {
    const geojsonStr = JSON.stringify(processed);
    await fs.writeFile(path.join(layerDir, `${id}.geojson`), geojsonStr, 'utf8');
    fileSizeBytes    = Buffer.byteLength(geojsonStr, 'utf8');
    steps.push('Saved as GeoJSON.');
  }

  const { bbox, propertySchema } = computeGeojsonStats(features);

  meta.processingLog  = steps;
  meta.sourceCrs      = sourceCrs ?? null;
  meta.targetCrs      = targetCrs ?? null;
  meta.bbox           = bbox;
  meta.fileSizeBytes  = fileSizeBytes;
  meta.featureCount   = features.length;
  meta.propertySchema = propertySchema;

  // Detect dominant geometry type from features
  const geomTypes = new Set(features.map(f => f.geometry?.type).filter(Boolean));
  meta.geometryType = (
    geomTypes.has('Point')      || geomTypes.has('MultiPoint')      ? 'Point' :
    geomTypes.has('LineString') || geomTypes.has('MultiLineString') ? 'LineString' :
    geomTypes.has('Polygon')    || geomTypes.has('MultiPolygon')    ? 'Polygon' :
    null
  );

  await writeLayerMeta(layersDir, id, meta);

  // Feature index is written to a separate sidecar to keep meta.json small.
  const featureIndex = features.map((f, i) => ({ id: f.properties?._featureId ?? null, index: i }));
  await writeFeatureIndex(layersDir, id, featureIndex);

  return {
    id,
    type:         'geojson',
    originalName: geoFile.originalname,
    displayName:  meta.layerConfig.displayName,
    dataPath:     `data/layers/${id}/${id}${saveAsNdjson ? '.geojsonl' : '.geojson'}`,
    featureCount: processed.features?.length ?? 0,
    sourceCrs,
    targetCrs,
    steps,
    status:       'ready',
  };
}

// ── OBJ/MTL/texture sub-file helper ───────────────────────────────────────────

async function _saveModelSubFile(modelFile, fileMap, parentLayerId, layerDir) {
  const subId   = uuidv4();
  const ext     = path.extname(modelFile.originalname).toLowerCase();
  const outFile = `${subId}${ext}`;
  const url     = `data/layers/${parentLayerId}/${outFile}`;
  const subMeta = createSubFileMeta({ id: subId, originalName: modelFile.originalname, fileType: 'model', role: 'model' });

  if (ext === '.obj') {
    const mtlOrigName = path.parse(modelFile.originalname).name + '.mtl';
    const mtlBuf      = fileMap.get(mtlOrigName) ?? fileMap.get(normalizeFilename(mtlOrigName));

    if (mtlBuf) {
      const mtlSubId = uuidv4();
      const mtlFile  = `${mtlSubId}.mtl`;

      // mtllib is always near the top — only stringify the first 8 KB to patch it
      const SCAN = Math.min(8192, modelFile.buffer.length);
      let header = modelFile.buffer.slice(0, SCAN).toString('utf8');
      header = header.replace(/^mtllib\s+.+$/m, `mtllib ${mtlFile}`);
      const objBuf = Buffer.concat([Buffer.from(header, 'utf8'), modelFile.buffer.slice(SCAN)]);

      const textureRefs = extractTextureRefs(mtlBuf.toString('utf8'));
      let mtlContent    = mtlBuf.toString('utf8');
      const texMeta     = [];

      for (const texRef of textureRefs) {
        const texBuf = fileMap.get(texRef) ?? fileMap.get(normalizeFilename(texRef));
        if (texBuf) {
          const texExt   = path.extname(texRef).toLowerCase();
          const texSubId = uuidv4();
          const texFile  = `${texSubId}${texExt}`;
          await fs.writeFile(path.join(layerDir, texFile), texBuf);
          mtlContent = mtlContent.replace(
            new RegExp(texRef.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), texFile
          );
          texMeta.push(createSubFileMeta({ id: texSubId, originalName: texRef, fileType: 'texture', role: 'texture' }));
        }
      }

      await fs.writeFile(path.join(layerDir, mtlFile), mtlContent, 'utf8');
      subMeta.companions = [
        createSubFileMeta({ id: mtlSubId, originalName: mtlOrigName, fileType: 'material', role: 'material' }),
        ...texMeta,
      ];
      await fs.writeFile(path.join(layerDir, outFile), objBuf);
    } else {
      await fs.writeFile(path.join(layerDir, outFile), modelFile.buffer);
    }
  } else {
    await fs.writeFile(path.join(layerDir, outFile), modelFile.buffer);
  }

  return { subMeta, url };
}

// ── Standalone model layer ─────────────────────────────────────────────────────

async function _processStandaloneModel(modelFile, fileMap, layersDir, allSettings) {
  const id       = uuidv4();
  const layerDir = path.join(layersDir, id);
  await fs.mkdir(layerDir, { recursive: true });

  const settings = allSettings[modelFile.originalname] ?? {};
  const meta     = createLayerMeta({ id, originalName: modelFile.originalname, fileType: 'model', options: settings });

  const ext     = path.extname(modelFile.originalname).toLowerCase();
  const outFile = `${id}${ext}`;

  // Use a temp id for sub-file helper then rename to main id
  const subRes  = await _saveModelSubFile(modelFile, fileMap, id, layerDir);
  const tmpFile = path.join(layerDir, `${subRes.subMeta.id}${ext}`);
  await fs.rename(tmpFile, path.join(layerDir, outFile)).catch(() => {});
  if (subRes.subMeta.companions) meta.subFiles.push(...subRes.subMeta.companions);

  meta.fileSizeBytes = modelFile.buffer.length;
  const { vertices: vertexCount, faces: faceCount } = countModelElements(modelFile.buffer, ext);
  if (vertexCount != null) meta.vertexCount = vertexCount;
  if (faceCount   != null) meta.faceCount   = faceCount;
  meta.processingLog = [`Saved as ${ext.replace('.', '').toUpperCase()} model.`];
  await writeLayerMeta(layersDir, id, meta);

  return {
    id,
    type:         'model',
    originalName: modelFile.originalname,
    displayName:  meta.layerConfig.displayName,
    dataPath:     `data/layers/${id}/${outFile}`,
    steps:        meta.processingLog,
    status:       'ready',
  };
}

// ── Standalone pointcloud layer ────────────────────────────────────────────────

async function _processStandalonePointcloud(pcFile, layersDir, allSettings) {
  const id       = uuidv4();
  const layerDir = path.join(layersDir, id);
  await fs.mkdir(layerDir, { recursive: true });

  const settings = allSettings[pcFile.originalname] ?? {};
  const meta     = createLayerMeta({ id, originalName: pcFile.originalname, fileType: 'pointcloud', options: settings });

  const ext      = pointcloudExt(pcFile.originalname);
  const mainFile = `${id}${ext}`;
  await fs.writeFile(path.join(layerDir, mainFile), pcFile.buffer);

  if (settings.keepOriginal) {
    const backupName = `original_${id}${ext}`;
    await fs.writeFile(path.join(layerDir, backupName), pcFile.buffer);
    meta.originalBackup = backupName;
  }

  const isCOPC = ext.endsWith('.copc.laz');
  const wantsCOPC = settings.optimize === 'copc';
  const extLabel = ext.replace(/^\./, '').toUpperCase();
  const step = `Saved as ${extLabel} point cloud.`;

  meta.fileSizeBytes = pcFile.buffer.length;
  if (wantsCOPC && !isCOPC) meta.originalSizeBytes = pcFile.buffer.length;
  meta.processingLog = [step];
  meta.status        = wantsCOPC && !isCOPC ? 'optimizing' : 'ready';
  if (wantsCOPC && !isCOPC) meta.optimizationType = 'copc';

  // Extract point count and bbox from the file header (requires PDAL).
  const pcInfo = await extractPointCloudInfo(path.join(layerDir, mainFile));
  if (pcInfo) {
    if (pcInfo.pointCount != null) meta.pointCount = pcInfo.pointCount;
    if (pcInfo.bbox)               meta.bbox       = pcInfo.bbox;
  }

  await writeLayerMeta(layersDir, id, meta);

  return {
    id,
    type:              'pointcloud',
    originalName:      pcFile.originalname,
    displayName:       meta.layerConfig.displayName,
    dataPath:          `data/layers/${id}/${mainFile}`,
    steps:             meta.processingLog,
    status:            meta.status,
    optimizationType:  meta.optimizationType ?? null,
  };
}

// ── GeoTIFF layer ──────────────────────────────────────────────────────────────

async function _processGeoTiffLayer(tifFile, layersDir, allSettings) {
  const id       = uuidv4();
  const layerDir = path.join(layersDir, id);
  await fs.mkdir(layerDir, { recursive: true });

  const settings = allSettings[tifFile.originalname] ?? {};
  const meta     = createLayerMeta({ id, originalName: tifFile.originalname, fileType: 'geotiff', options: settings });

  const ext      = path.extname(tifFile.originalname).toLowerCase() || '.tif';
  const mainFile = `${id}${ext}`;
  await fs.writeFile(path.join(layerDir, mainFile), tifFile.buffer);

  if (settings.keepOriginal) {
    const backupName = `original_${id}${ext}`;
    await fs.writeFile(path.join(layerDir, backupName), tifFile.buffer);
    meta.originalBackup = backupName;
  }

  const wantsCOG = settings.optimize === 'cog';
  const extLabel = ext.replace('.', '').toUpperCase();
  const step = `Saved as ${extLabel} raster.`;

  meta.processingLog = [step];
  meta.status        = wantsCOG ? 'optimizing' : 'ready';
  if (wantsCOG) {
    meta.optimizationType = 'cog';
    if (settings.cogOptions) meta.cogOptions = settings.cogOptions;
  }
  if (settings.keepOriginal) meta.keepOriginal = true;

  // Extract CRS and raster info from the file using GDAL (if available).
  // This populates sourceCrs in the meta and tiffProjection in layerConfig
  // so the client can pre-register the projection before rendering.
  meta.fileSizeBytes = tifFile.buffer.length;
  if (wantsCOG) meta.originalSizeBytes = tifFile.buffer.length;

  const mainFilePath = path.join(layerDir, mainFile);
  const gdalInfo = await extractGeoTiffInfo(mainFilePath);
  if (gdalInfo?.crs) {
    meta.sourceCrs = gdalInfo.crs;
    meta.layerConfig.tiffProjection = gdalInfo.crs;
    // Look up the proj4 string so the client can register the CRS without
    // a network round-trip to epsg.io.
    const epsgNum = gdalInfo.crs.split(':')[1];
    const proj4Str = epsg[epsgNum]?.proj4 ?? null;
    if (proj4Str) meta.layerConfig.tiffProj4 = proj4Str;
    meta.processingLog.push(`Coordinate reference system detected: ${gdalInfo.crs}.`);
  }
  if (gdalInfo?.bands    != null) meta.layerConfig.bandCount = gdalInfo.bands;
  if (gdalInfo?.size     != null) meta.rasterSize  = gdalInfo.size;
  if (gdalInfo?.resolution)       meta.resolution  = gdalInfo.resolution;
  if (gdalInfo?.bbox)             meta.bbox        = gdalInfo.bbox;
  if (gdalInfo?.bandStats)        meta.bandStats   = gdalInfo.bandStats;

  // User-supplied CRS override (from upload modal settings) takes precedence.
  const sourceCrs = settings.cogOptions?.sourceCrs ?? null;
  if (sourceCrs) {
    meta.sourceCrs = sourceCrs;
    meta.layerConfig.tiffProjection = sourceCrs;
    const epsgNum = sourceCrs.split(':')[1];
    const proj4Str = epsg[epsgNum]?.proj4 ?? null;
    if (proj4Str) meta.layerConfig.tiffProj4 = proj4Str;
  }

  await writeLayerMeta(layersDir, id, meta);

  return {
    id,
    type:             'geotiff',
    originalName:     tifFile.originalname,
    displayName:      meta.layerConfig.displayName,
    dataPath:         `data/layers/${id}/${mainFile}`,
    steps:            meta.processingLog,
    status:           meta.status,
    optimizationType: meta.optimizationType ?? null,
  };
}

// ── CSV data layer ─────────────────────────────────────────────────────────────
// CSV files are stored as-is and treated as attribute data to be linked to
// GeoJSON layers via the links.json sidecar. No coordinate conversion is done.

async function _processCsvDataLayer(csvFile, layersDir, allSettings) {
  const id       = uuidv4();
  const layerDir = path.join(layersDir, id);
  await fs.mkdir(layerDir, { recursive: true });

  const settings = allSettings[csvFile.originalname] ?? {};
  const meta     = createLayerMeta({ id, originalName: csvFile.originalname, fileType: 'csv', options: settings });
  meta.extension = '.csv';

  await fs.writeFile(path.join(layerDir, `${id}.csv`), csvFile.buffer);

  const text = csvFile.buffer.toString('utf8');
  const firstNewline = text.indexOf('\n');
  const headerLine   = firstNewline !== -1 ? text.slice(0, firstNewline).trim() : text.trim();
  const delimiter    = detectCsvDelimiter(headerLine);
  try {
    const records = csvParse(text, { columns: true, skip_empty_lines: true, trim: true, relax_quotes: true, to: 1, delimiter });
    if (records.length > 0) meta.csvColumns = Object.keys(records[0]);
  } catch { /* non-fatal — columns will be detected on demand */ }

  meta.fileSizeBytes = csvFile.buffer.length;
  meta.csvDelimiter  = delimiter;
  meta.rowCount      = Math.max(0, text.split('\n').filter(l => l.trim()).length - 1);
  meta.processingLog = ['Saved as CSV.'];
  await writeLayerMeta(layersDir, id, meta);

  return {
    id,
    type:        'csv',
    originalName: csvFile.originalname,
    displayName:  meta.layerConfig.displayName,
    dataPath:    `data/layers/${id}/${id}.csv`,
    steps:       meta.processingLog,
    status:      'ready',
  };
}

// ── Sub-file addition (for POST /admin/layers/:id/subfiles) ───────────────────

export async function addSubFile(layerId, file, role, layersDir, settings = {}) {
  const meta     = await readLayerMeta(layersDir, layerId);
  const layerDir = resolveInDir(layersDir, layerId);
  const subId    = uuidv4();
  const origExt  = path.extname(file.originalname).toLowerCase() || '';
  const rawFile  = `${subId}${origExt}`;
  const rawPath  = resolveInDir(layerDir, rawFile);
  await fs.writeFile(rawPath, file.buffer);

  let finalExt = origExt;
  let conversionNote = null;

  // Optional COPC conversion for point clouds
  if (role === 'pointcloud' && settings.optimize === 'copc') {
    const res = await convertToCopc(rawPath, {
      keepOriginal: settings.keepOriginal ?? false,
      sourceCrs:    settings.sourceCrs   || null,
    });
    conversionNote = res.step;
    if (res.success) {
      finalExt = '.copc.laz';
    }
  }

  const subMeta = createSubFileMeta({
    id:           subId,
    originalName: file.originalname,
    fileType:     classifyExt(file.originalname) !== 'unknown' ? classifyExt(file.originalname) : origExt.slice(1) || 'binary',
    role,
  });
  // Persist any extra settings into the sub-file meta
  if (finalExt !== origExt)   subMeta.extension     = finalExt;
  if (conversionNote)         subMeta.processingNote = conversionNote;
  if (settings.sourceCrs)     subMeta.sourceCrs      = settings.sourceCrs;
  if (settings.keepOriginal)  subMeta.keepOriginal   = true;

  meta.subFiles.push(subMeta);
  await writeLayerMeta(layersDir, layerId, meta);

  const finalFile = `${subId}${finalExt}`;
  return { subId, filename: finalFile, dataPath: `data/layers/${layerId}/${finalFile}`, role, meta: subMeta };
}

// ── Sub-file batch addition ────────────────────────────────────────────────────

/**
 * Add multiple files as sub-files of an existing layer.
 * Handles OBJ+MTL+texture grouping the same way as processUploadBatch:
 *   • Each .obj is paired with a same-stem .mtl from the batch, mtllib reference patched.
 *   • Textures referenced by the MTL are saved and patched too.
 *   • Orphan MTL / texture files (no matching OBJ in this batch) are saved as-is.
 *   • .las/.laz are added as pointcloud sub-files.
 */
export async function addSubFileBatch(layerId, files, layersDir, allSettings = {}) {
  const meta     = await readLayerMeta(layersDir, layerId);
  const layerDir = resolveInDir(layersDir, layerId);

  // Build fileMap so _saveModelSubFile can find companion MTL / textures
  const fileMap = new Map();
  for (const f of files) {
    fileMap.set(f.originalname, f.buffer);
    fileMap.set(normalizeFilename(f.originalname), f.buffer);
  }

  // Track which original filenames were consumed as companions so we don't double-add them
  const consumedNames = new Set();
  const newSubFiles   = [];

  // 1. Process model files (OBJ/PLY/STL) — each may absorb its MTL + textures
  for (const file of files) {
    if (classifyExt(file.originalname) !== 'model') continue;
    // Vertex-only PLY → point cloud, handled in step 2
    if (path.extname(file.originalname).toLowerCase() === '.ply') {
      const { faces } = countModelElements(file.buffer, '.ply');
      if (faces === null || faces === 0) continue;
    }
    const subRes = await _saveModelSubFile(file, fileMap, layerId, layerDir);
    consumedNames.add(file.originalname);
    consumedNames.add(normalizeFilename(file.originalname));
    meta.subFiles.push(subRes.subMeta);
    // Flatten companions into meta.subFiles (consistent with standalone model behaviour)
    if (subRes.subMeta.companions?.length) {
      meta.subFiles.push(...subRes.subMeta.companions);
      for (const c of subRes.subMeta.companions) {
        consumedNames.add(c.originalName);
        consumedNames.add(normalizeFilename(c.originalName));
      }
    }
    newSubFiles.push(subRes.subMeta);
  }

  // 2. Process point cloud files (including vertex-only PLY)
  for (const file of files) {
    if (consumedNames.has(file.originalname) || consumedNames.has(normalizeFilename(file.originalname))) continue;
    const fileKind = classifyExt(file.originalname);
    if (fileKind === 'model' && path.extname(file.originalname).toLowerCase() === '.ply') {
      const { faces } = countModelElements(file.buffer, '.ply');
      if (faces !== null && faces > 0) continue; // mesh PLY — skip, already handled above
    } else if (fileKind !== 'pointcloud') {
      continue;
    }
    const pcSettings = allSettings[file.originalname] ?? {};
    const subId = uuidv4();
    const ext   = pointcloudExt(file.originalname);
    await fs.writeFile(path.join(layerDir, `${subId}${ext}`), file.buffer);
    let finalExt = ext;
    if (pcSettings.optimize === 'copc') {
      try {
        const res = await convertToCopc(path.join(layerDir, `${subId}${ext}`), {
          keepOriginal: pcSettings.keepOriginal ?? false,
          sourceCrs:    pcSettings.sourceCrs    || null,
        });
        if (res.success) finalExt = '.copc.laz';
      } catch { /* copc failure is non-fatal; keep original */ }
    }
    const subMeta = createSubFileMeta({ id: subId, originalName: file.originalname, fileType: 'pointcloud', role: 'pointcloud' });
    if (finalExt !== ext) subMeta.extension = finalExt;
    meta.subFiles.push(subMeta);
    consumedNames.add(file.originalname);
    consumedNames.add(normalizeFilename(file.originalname));
    newSubFiles.push(subMeta);
  }

  // 3. Orphan MTL / texture files not consumed by a model above
  for (const file of files) {
    if (consumedNames.has(file.originalname) || consumedNames.has(normalizeFilename(file.originalname))) continue;
    const ext = path.extname(file.originalname).toLowerCase();
    const subId = uuidv4();
    const outFile = `${subId}${ext}`;
    await fs.writeFile(path.join(layerDir, outFile), file.buffer);
    const role     = ext === '.mtl' ? 'material' : TEXTURE_EXTS.has(ext) ? 'texture' : 'unknown';
    const fileType = ext === '.mtl' ? 'material' : TEXTURE_EXTS.has(ext) ? 'texture' : 'unknown';
    const subMeta  = createSubFileMeta({ id: subId, originalName: file.originalname, fileType, role });
    meta.subFiles.push(subMeta);
    newSubFiles.push(subMeta);
  }

  await writeLayerMeta(layersDir, layerId, meta);
  return { subFiles: newSubFiles, meta };
}

// ── Legacy re-link helper (kept for backward compatibility) ───────────────────

export async function relinkGeojson(filePath, layersDir) {
  const raw = await fs.readFile(filePath, 'utf8');
  let features, header;
  try {
    ({ features, header } = parseGeoFile(raw, filePath));
  } catch {
    throw new Error(`Could not parse ${path.basename(filePath)}.`);
  }

  const modelMap      = new Map();
  const pointcloudMap = new Map();

  try {
    const layerDirs = await fs.readdir(layersDir, { withFileTypes: true });
    for (const entry of layerDirs) {
      if (!entry.isDirectory()) continue;
      const files = await fs.readdir(path.join(layersDir, entry.name)).catch(() => []);
      for (const f of files) {
        if (/\.(obj|ply|stl)$/i.test(f)) modelMap.set(path.parse(f).name, `data/layers/${entry.name}/${f}`);
        if (/\.(las|laz)$/i.test(f))     pointcloudMap.set(path.parse(f).name, `data/layers/${entry.name}/${f}`);
      }
    }
  } catch { /* no layers dir yet */ }

  const fc = { type: 'FeatureCollection', features };
  const { geojson: linked, linkedCount, linkedAssets } = linkAssetsToFeatures(fc, modelMap, pointcloudMap);
  await fs.writeFile(filePath, serializeGeoFile(linked.features, header, filePath), 'utf8');

  return {
    filename:             path.basename(filePath),
    linkedCount,
    linkedAssets,
    availableModels:      modelMap.size,
    availablePointclouds: pointcloudMap.size,
  };
}

// ── CSV attribute join ─────────────────────────────────────────────────────────

/**
 * Detect the delimiter used in a CSV header line.
 * Mirrors the same heuristic used on the client side.
 */
function detectCsvDelimiter(line) {
  const t = (line.match(/\t/g) || []).length;
  const c = (line.match(/,/g)  || []).length;
  const s = (line.match(/;/g)  || []).length;
  if (t > c && t > s) return '\t';
  if (s > c)          return ';';
  return ',';
}

/**
 * Apply a CSV attribute join to an existing GeoJSON layer.
 *
 * Reads the CSV sub-file identified by `csvLink.subFileId`, auto-detects its
 * delimiter, builds a lookup keyed by `csvLink.csvJoinColumn`, then enriches
 * each GeoJSON feature whose `csvLink.featureJoinProperty` matches a row key.
 *
 * If `oldJoinedCols` is provided those columns are stripped from every feature
 * first so that a re-apply doesn't accumulate stale data.
 *
 * @param {string}   layerId         Layer UUID
 * @param {string}   layersDir       Absolute path to the layers root directory
 * @param {object}   csvLink         { subFileId, csvJoinColumn, featureJoinProperty }
 * @param {string[]} [oldJoinedCols] Column names previously joined (to remove before re-joining)
 * @returns {Promise<string[]>} Names of the columns that were added to features
 */
export async function applyCsvLink(layerId, layersDir, csvLink, oldJoinedCols = []) {
  const { subFileId, csvJoinColumn, featureJoinProperty } = csvLink;

  const meta = await readLayerMeta(layersDir, layerId);

  // Locate the sub-file entry in the layer metadata
  const subFile = meta.subFiles.find((sf) => sf.id === subFileId);
  if (!subFile) throw new Error(`Sub-file ${subFileId} not found on layer ${layerId}.`);

  // Read the CSV from disk
  const csvExt  = safeLayerExt(subFile.extension || '.csv');
  const csvPath = resolveInDir(layersDir, layerId, `${subFileId}${csvExt}`);
  const csvText = await fs.readFile(csvPath, 'utf8');

  // Detect delimiter from the first line
  const firstNewline = csvText.indexOf('\n');
  const headerLine   = firstNewline !== -1 ? csvText.slice(0, firstNewline) : csvText;
  const delimiter    = detectCsvDelimiter(headerLine);

  // Parse CSV
  let records;
  try {
    records = csvParse(csvText, {
      columns:          true,
      skip_empty_lines: true,
      trim:             true,
      relax_quotes:     true,
      delimiter,
    });
  } catch (err) {
    throw new Error(`CSV parse error: ${err.message}`);
  }
  if (records.length === 0) throw new Error('CSV has no data rows.');

  // Validate that the configured join column exists
  const csvColumns = Object.keys(records[0]);
  if (!csvColumns.includes(csvJoinColumn)) {
    throw new Error(`CSV join column "${csvJoinColumn}" not found. Available: ${csvColumns.join(', ')}`);
  }

  // Build lookup: value of csvJoinColumn → full row
  const lookup = new Map();
  for (const row of records) {
    const key = String(row[csvJoinColumn] ?? '');
    if (key !== '') lookup.set(key, row);
  }

  // The new columns we will write to each feature (all CSV columns except the join key itself,
  // to avoid overwriting the feature's original join property with an identical-but-stringified copy)
  const newCols = csvColumns.filter((c) => c !== csvJoinColumn);

  // Read the GeoJSON / NDJSON file
  const ext         = safeLayerExt(meta.extension || '.geojson');
  const geojsonPath = resolveInDir(layersDir, layerId, `${layerId}${ext}`);
  const raw         = await fs.readFile(geojsonPath, 'utf8');
  const { features: featuresList, header } = parseGeoFile(raw, geojsonPath);

  // Apply the join
  const colsToRemove = new Set(oldJoinedCols);
  let matchCount = 0;
  const enriched = featuresList.map((feature) => {
    if (!feature.properties) feature.properties = {};

    // Remove stale columns from a previous join before adding fresh ones
    for (const col of colsToRemove) {
      delete feature.properties[col];
    }

    const featureVal = String(feature.properties[featureJoinProperty] ?? '');
    const match      = lookup.get(featureVal);
    if (match) {
      for (const col of newCols) {
        feature.properties[col] = match[col];
      }
      matchCount++;
    }

    return feature;
  });

  // Write the enriched file back to disk
  await fs.writeFile(geojsonPath, serializeGeoFile(enriched, header, geojsonPath), 'utf8');

  return newCols;
}

