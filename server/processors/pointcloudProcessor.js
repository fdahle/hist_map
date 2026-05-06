import fsPromises from "fs/promises";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

// ── Standalone COPC conversion (used by the live upload pipeline) ──────────────

let _pdalAvailable = null;

export async function isPdalAvailable() {
  if (_pdalAvailable !== null) return _pdalAvailable;
  try {
    await execFileAsync('pdal', ['--version']);
    _pdalAvailable = true;
  } catch {
    _pdalAvailable = false;
  }
  return _pdalAvailable;
}

let _untwineAvailable = null;

async function isUntwineAvailable() {
  if (_untwineAvailable !== null) return _untwineAvailable;
  try {
    await execFileAsync('untwine', ['--version']);
    _untwineAvailable = true;
  } catch {
    _untwineAvailable = false;
  }
  return _untwineAvailable;
}

/**
 * Convert a LAS/LAZ file to COPC (Cloud Optimised Point Cloud) in-place using PDAL.
 * Models `convertToCog` from geotiffProcessor.js — gracefully falls back if PDAL
 * is not installed.
 *
 * @param {string} inputPath    Absolute path to source .las/.laz
 * @param {object} [options]
 * @param {boolean} [options.keepOriginal=false]  Rename original before replacing.
 * @param {string}  [options.sourceCrs]           Source CRS (stored as metadata only).
 * @returns {{ success: boolean, step: string, originalBackup: string|null }}
 */
export async function convertToCopc(inputPath, options = {}) {
  const { keepOriginal = false } = options;

  const dir      = path.dirname(inputPath);
  const origExt  = inputPath.toLowerCase().endsWith('.copc.laz') ? '.copc.laz'
                 : path.extname(inputPath).toLowerCase();
  const baseName = path.basename(inputPath, origExt);

  // Already COPC — nothing to do
  if (origExt === '.copc.laz') {
    return { success: true, step: 'COPC: already converted', originalBackup: null };
  }

  const outputPath = path.join(dir, `${baseName}.copc.laz`);

  // ── Helper: swap original for converted output ─────────────────────────────
  async function finalise(tempPath) {
    let originalBackup = null;
    if (keepOriginal) {
      const backupName = `original_${path.basename(inputPath)}`;
      await fsPromises.rename(inputPath, path.join(dir, backupName));
      originalBackup = backupName;
    } else {
      await fsPromises.unlink(inputPath);
    }
    await fsPromises.rename(tempPath, outputPath);
    return originalBackup;
  }

  // ── Strategy 1: untwine (tile-based, bounded memory — scales to any file size) ──
  if (await isUntwineAvailable()) {
    // With --single_file, untwine treats --output_dir as the output FILE path and
    // creates a sibling <output>_tmp/ directory for intermediate tile work.
    // We run entirely inside /tmp (always writable, no volume-mount permission issues)
    // then move the finished file into the target layer directory.
    const tmpOut  = path.join('/tmp', `${baseName}.copc.laz`);
    const tmpWork = tmpOut + '_tmp'; // untwine creates this automatically
    try {
      await execFileAsync(
        'untwine',
        ['--files', inputPath, '--output_dir', tmpOut, '--single_file'],
        { maxBuffer: 64 * 1024 * 1024 },
      );
      // Move result from /tmp to the layer directory. fsPromises.rename fails across
      // filesystems (e.g. /tmp vs a Docker volume mount), so copy then delete instead.
      await fsPromises.copyFile(tmpOut, outputPath + '.untwine_stage');
      await fsPromises.unlink(tmpOut).catch(() => {});
      const originalBackup = await finalise(outputPath + '.untwine_stage');
      return { success: true, step: 'COPC: converted (untwine)', originalBackup };
    } catch (err) {
      await fsPromises.unlink(tmpOut).catch(() => {});
      await fsPromises.rm(tmpWork, { recursive: true, force: true }).catch(() => {});
      await fsPromises.unlink(outputPath + '.untwine_stage').catch(() => {});
      const stderr = (err.stderr || '').toString().trim();
      const signalInfo = err.signal ? ` signal=${err.signal}` : '';
      const codeInfo   = err.code   ? ` exit=${err.code}`     : '';
      console.warn(`[COPC] untwine failed${signalInfo}${codeInfo}, falling back to PDAL.\n  stderr: ${stderr}`);
      // fall through to PDAL
    }
  }

  // ── Strategy 2: PDAL pipeline (fallback) ───────────────────────────────────
  if (!(await isPdalAvailable())) {
    return {
      success: false,
      step: 'COPC: skipped (neither untwine nor PDAL available)',
      originalBackup: null,
    };
  }

  const tempOutput   = outputPath + '.tmp';
  const pipelineFile = path.join(dir, `${baseName}_copc_pipeline.json`);
  const readerType   = ['.las', '.laz'].includes(origExt) ? 'readers.las' : 'readers.ply';
  const pipeline = {
    pipeline: [
      { type: readerType, filename: inputPath },
      { type: 'writers.copc', filename: tempOutput, forward: 'all' },
    ],
  };

  try {
    await fsPromises.writeFile(pipelineFile, JSON.stringify(pipeline));
    await execFileAsync('pdal', ['pipeline', pipelineFile], { maxBuffer: 256 * 1024 * 1024 });
    await fsPromises.unlink(pipelineFile);

    const originalBackup = await finalise(tempOutput);
    return { success: true, step: 'COPC: converted (pdal)', originalBackup };
  } catch (err) {
    await fsPromises.unlink(pipelineFile).catch(() => {});
    await fsPromises.unlink(tempOutput).catch(() => {});
    const stderr = (err.stderr || '').toString().trim();
    const stdout = (err.stdout || '').toString().trim();
    const signalInfo = err.signal ? ` signal=${err.signal}` : '';
    const codeInfo   = err.code   ? ` exit=${err.code}`     : '';
    const detail = (stderr || stdout || err.message || '').slice(0, 1000);
    console.error(`[COPC] pdal pipeline failed.${signalInfo}${codeInfo}\n  stderr: ${stderr}\n  stdout: ${stdout}`);
    return {
      success: false,
      step:    detail ? `COPC: conversion failed — ${detail}` : `COPC: conversion failed`,
      originalBackup: null,
    };
  }
}

/**
 * Extract basic metadata from a LAS/LAZ/COPC file using PDAL.
 * Returns null if PDAL is not available or the file cannot be read.
 *
 * @param {string} filePath  Absolute path to the point cloud file
 * @returns {{ pointCount: number|null, bbox: number[]|null } | null}
 */
export async function extractPointCloudInfo(filePath) {
  if (!(await isPdalAvailable())) return null;
  try {
    const { stdout } = await execFileAsync('pdal', ['info', '--summary', filePath], { maxBuffer: 10 * 1024 * 1024 });
    const info    = JSON.parse(stdout);
    const summary = info.summary ?? {};
    const pointCount = summary.num_points ?? null;
    const b = summary.bounds;
    const bbox = (b && b.minx != null) ? [b.minx, b.miny, b.maxx, b.maxy] : null;
    return { pointCount, bbox };
  } catch {
    return null;
  }
}

