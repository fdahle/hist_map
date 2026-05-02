/**
 * geotiffProcessor.js — Cloud Optimised GeoTIFF (COG) conversion & metadata extraction.
 *
 * COG conversion requires GDAL's `gdal_translate` to be available on PATH.
 * If GDAL is not installed the conversion is skipped gracefully and the
 * original file is used as-is (still works, just not streaming-optimised).
 *
 * Metadata extraction (CRS, band count, size) uses GDAL if available,
 * otherwise falls back to geotiff.js for reading GeoKeys directly.
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import { randomUUID } from 'crypto';
import fs            from 'fs/promises';
import path          from 'path';
import { fromArrayBuffer } from 'geotiff';

const execFileAsync = promisify(execFile);

// ── Tool availability ──────────────────────────────────────────────────────────

let _gdalAvailable = null;

export async function isGdalAvailable() {
  if (_gdalAvailable !== null) return _gdalAvailable;
  try {
    await execFileAsync('gdal_translate', ['--version']);
    _gdalAvailable = true;
  } catch {
    _gdalAvailable = false;
  }
  return _gdalAvailable;
}

// ── COG conversion ─────────────────────────────────────────────────────────────

/**
 * Convert a GeoTIFF to a Cloud Optimised GeoTIFF in-place (or to a temp file
 * then rename) using gdal_translate.
 *
 * @param {string} inputPath    Absolute path to source .tif
 * @param {object} [options]
 * @param {boolean} [options.keepOriginal=false]  Rename original to `original_<filename>` before replacing.
 * @param {string}  [options.compression='lzw']   GDAL compression: lzw | deflate | zstd | none
 * @param {string}  [options.resampling='nearest'] Overview resampling: nearest | bilinear | cubic
 * @param {number}  [options.tileSize=256]         Internal tile size in pixels.
 * @param {string}  [options.nodata]               No-data pixel value (e.g. '0' or '-9999').
 * @returns {{ success: boolean, step: string, originalBackup: string|null }}
 */
export async function convertToCog(inputPath, options = {}) {
  if (!(await isGdalAvailable())) {
    return {
      success: false,
      step: 'COG: skipped (GDAL unavailable)',
      originalBackup: null,
    };
  }

  const {
    keepOriginal = false,
    compression  = 'lzw',
    resampling   = 'nearest',
    tileSize     = 256,
    nodata,
  } = options;

  const dir      = path.dirname(inputPath);
  const basename = path.basename(inputPath);
  const tmpPath  = path.join(dir, `__cog_tmp_${randomUUID()}_${basename}`);

  const compressionUpper = (compression || 'lzw').toUpperCase();
  const args = [
    '-of', 'COG',
    '-co', `COMPRESS=${compressionUpper}`,
    '-co', `RESAMPLING=${(resampling || 'nearest').toUpperCase()}`,
    '-co', `TILESIZE=${tileSize || 256}`,
    '-co', 'OVERVIEWS=AUTO',
    ...(nodata !== undefined && nodata !== null && nodata !== '' ? ['-a_nodata', String(nodata)] : []),
    inputPath,
    tmpPath,
  ];

  let originalBackup = null;
  try {
    await execFileAsync('gdal_translate', args);
    // Optionally back up the original
    if (keepOriginal) {
      originalBackup = `original_${basename}`;
      await fs.rename(inputPath, path.join(dir, originalBackup));
    }
    await fs.rename(tmpPath, inputPath);
    return {
      success: true,
      step: 'COG: converted',
      originalBackup,
    };
  } catch (err) {
    // Clean up temp file if it was created
    await fs.unlink(tmpPath).catch(() => {});
    return {
      success: false,
      step: `COG: conversion failed`,
      originalBackup: null,
    };
  }
}

// ── GeoTIFF metadata extraction ────────────────────────────────────────────────

/**
 * Extract CRS and basic raster info from a GeoTIFF.
 * Uses GDAL (gdalinfo) if available, otherwise falls back to geotiff.js.
 *
 * @param {string} filePath  Absolute path to the .tif file
 * @returns {{ crs: string|null, size: [number,number]|null, bands: number|null } | null}
 */
export async function extractGeoTiffInfo(filePath) {
  // Try GDAL first (more reliable CRS detection).
  if (await isGdalAvailable()) {
    try {
      const { stdout } = await execFileAsync('gdalinfo', ['-json', filePath]);
      const info = JSON.parse(stdout);

      let crs = null;
      const wkt = info.coordinateSystem?.wkt ?? '';
      // Match the last AUTHORITY["EPSG","<code>"] — that's the top-level CRS code.
      const authorityMatches = [...wkt.matchAll(/AUTHORITY\["EPSG","(\d+)"\]/gi)];
      if (authorityMatches.length > 0) {
        crs = `EPSG:${authorityMatches[authorityMatches.length - 1][1]}`;
      }
      // Fallback: look for ID["EPSG",<code>] (WKT2 format)
      if (!crs) {
        const idMatches = [...wkt.matchAll(/ID\["EPSG",(\d+)\]/gi)];
        if (idMatches.length > 0) {
          crs = `EPSG:${idMatches[idMatches.length - 1][1]}`;
        }
      }

      const size  = info.size ?? null;          // [width, height]
      const bands = info.bands?.length ?? null;

      // Pixel resolution and native bbox from the affine geo-transform.
      // geoTransform = [originX, pixelW, rotX, originY, rotY, pixelH]
      let resolution = null;
      let bbox       = null;
      const gt = info.geoTransform;
      if (gt && size) {
        const [originX, pixelW, , originY, , pixelH] = gt;
        resolution = [Math.abs(pixelW), Math.abs(pixelH)];
        const x0 = originX, x1 = originX + size[0] * pixelW;
        const y0 = originY, y1 = originY + size[1] * pixelH;
        bbox = [Math.min(x0, x1), Math.min(y0, y1), Math.max(x0, x1), Math.max(y0, y1)];
      }

      // Per-band statistics — only populated when already stored in the file's aux metadata.
      // We never force a full scan here (that would be expensive and write side-car files).
      const bandStats = (info.bands ?? []).map(b => {
        const min = b.minimum ?? b.computedMin ?? null;
        const max = b.maximum ?? b.computedMax ?? null;
        return (min !== null && max !== null) ? { min, max } : null;
      }).filter(Boolean);

      return { crs, size, bands, resolution, bbox, bandStats: bandStats.length ? bandStats : null };
    } catch {
      // Fall through to geotiff.js fallback.
    }
  }

  // Fallback: use geotiff.js to read GeoKeys from the file header.
  try {
    const buffer = await fs.readFile(filePath);
    const tiff  = await fromArrayBuffer(buffer.buffer);
    const image = await tiff.getImage();

    let crs = null;
    const geoKeys = image.getGeoKeys();
    if (geoKeys.ProjectedCSTypeGeoKey) {
      crs = `EPSG:${geoKeys.ProjectedCSTypeGeoKey}`;
    } else if (geoKeys.GeographicTypeGeoKey) {
      crs = `EPSG:${geoKeys.GeographicTypeGeoKey}`;
    }

    const size  = [image.getWidth(), image.getHeight()];
    const bands = image.getSamplesPerPixel();

    // getBoundingBox() returns [west, south, east, north] in the native CRS.
    let bbox       = null;
    let resolution = null;
    try {
      const bb = image.getBoundingBox();
      if (bb) bbox = [bb[0], bb[1], bb[2], bb[3]];
      const res = image.getResolution();
      if (res) resolution = [Math.abs(res[0]), Math.abs(res[1])];
    } catch { /* non-fatal */ }

    return { crs, size, bands, resolution, bbox, bandStats: null };
  } catch {
    return null;
  }
}
