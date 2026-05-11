/**
 * tileProcessor.js — Converts a GeoTIFF to an XYZ tile pyramid using gdal2tiles.py.
 *
 * Requires GDAL (gdal_translate + gdal2tiles.py) on PATH.
 * Both are provided by the conda-forge GDAL package in the server Dockerfile.
 */

import { execFile, spawn } from 'child_process';
import { promisify }       from 'util';
import fs                  from 'fs/promises';

const execFileAsync = promisify(execFile);

// ── Tool availability ──────────────────────────────────────────────────────────

let _available = null;

export async function isGdal2TilesAvailable() {
  if (_available !== null) return _available;
  try {
    await execFileAsync('gdal2tiles.py', ['--version']);
    _available = true;
  } catch {
    _available = false;
  }
  return _available;
}

// ── Tile generation ────────────────────────────────────────────────────────────

/**
 * Generate an XYZ tile pyramid from a GeoTIFF.
 *
 * @param {string}   inputPath    Absolute path to source .tif
 * @param {string}   tilesOutDir  Absolute path for tile output ({z}/{x}/{y}.png|jpg)
 * @param {object}   options
 * @param {number}   [options.sourceEpsg]          Override/assign source CRS (EPSG code)
 * @param {number}   [options.minZoom=1]
 * @param {number}   [options.maxZoom=14]
 * @param {string}   [options.resampling='bilinear'] bilinear|nearest|cubic|cubicspline|lanczos
 * @param {string}   [options.format='PNG']          PNG|JPEG
 * @param {function} [onProgress]                   Called with 0–100 as tiles generate
 * @returns {Promise<{ success: boolean, error?: string }>}
 */
export async function generateTiles(inputPath, tilesOutDir, options = {}, onProgress) {
  if (!(await isGdal2TilesAvailable())) {
    return { success: false, error: 'gdal2tiles.py not found — GDAL must be installed' };
  }

  const {
    sourceEpsg,
    minZoom    = 1,
    maxZoom    = 14,
    resampling = 'bilinear',
    format     = 'PNG',
  } = options;

  await fs.mkdir(tilesOutDir, { recursive: true });

  // If a source EPSG override is given, assign it to a temp copy so gdal2tiles can reproject.
  let workingInput = inputPath;
  const tmpPath    = inputPath.replace(/\.tiff?$/i, `__srs_override.tif`);

  if (sourceEpsg) {
    try {
      await execFileAsync('gdal_translate', [
        '-a_srs', `EPSG:${sourceEpsg}`,
        '-of', 'GTiff',
        inputPath,
        tmpPath,
      ]);
      workingInput = tmpPath;
    } catch (err) {
      return { success: false, error: `Source CRS assignment failed: ${err.message}` };
    }
  }

  const args = [
    '-r', resampling,
    '-z', `${minZoom}-${maxZoom}`,
    '--xyz',          // XYZ (Google/OL) convention — y=0 at north
    '-w', 'none',     // skip HTML viewer files
    '-f', format.toUpperCase(),
    '--tilesize=256',
    workingInput,
    tilesOutDir,
  ];

  return new Promise((resolve) => {
    const proc     = spawn('gdal2tiles.py', args);
    let   phase    = 0;   // 0 = base tiles, 1 = overview tiles
    let   lastPct  = -1;

    const parse = (data) => {
      const text = data.toString();
      if (text.toLowerCase().includes('overview')) phase = 1;

      // gdal2tiles progress: "0...10...20...30..." on stdout/stderr
      const matches = [...text.matchAll(/(\d+)\.\.\./g)];
      if (!matches.length) return;

      const pct = parseInt(matches[matches.length - 1][1], 10);
      if (pct === lastPct) return;
      lastPct = pct;

      // Phase 0 = 0–60%, phase 1 = 60–100%
      const overall = phase === 0
        ? Math.round(pct * 0.6)
        : Math.round(60 + pct * 0.4);

      onProgress?.(Math.min(overall, 99));
    };

    proc.stdout.on('data', parse);
    proc.stderr.on('data', parse);

    proc.on('close', async (code) => {
      if (sourceEpsg) await fs.unlink(tmpPath).catch(() => {});
      if (code === 0) {
        onProgress?.(100);
        resolve({ success: true });
      } else {
        resolve({ success: false, error: `gdal2tiles.py exited with code ${code}` });
      }
    });

    proc.on('error', async (err) => {
      if (sourceEpsg) await fs.unlink(tmpPath).catch(() => {});
      resolve({ success: false, error: err.message });
    });
  });
}
