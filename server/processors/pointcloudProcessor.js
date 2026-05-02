import fs from "fs";
import fsPromises from "fs/promises";
import path from "path";
import { execFile, exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);
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

  if (!(await isPdalAvailable())) {
    return {
      success: false,
      step: 'COPC: skipped (PDAL unavailable)',
      originalBackup: null,
    };
  }

  const dir      = path.dirname(inputPath);
  const origExt  = inputPath.toLowerCase().endsWith('.copc.laz') ? '.copc.laz'
                 : path.extname(inputPath).toLowerCase();
  const baseName = path.basename(inputPath, origExt);

  // Already COPC — nothing to do
  if (origExt === '.copc.laz') {
    return { success: true, step: 'COPC: already converted', originalBackup: null };
  }

  const outputPath   = path.join(dir, `${baseName}.copc.laz`);
  const tempOutput   = outputPath + '.tmp';
  const pipelineFile = path.join(dir, `${baseName}_copc_pipeline.json`);

  const readerType = ['.las', '.laz'].includes(origExt) ? 'readers.las' : 'readers.ply';
  const pipeline = {
    pipeline: [
      { type: readerType, filename: inputPath },
      { type: 'writers.copc', filename: tempOutput, forward: 'all' },
    ],
  };

  try {
    await fsPromises.writeFile(pipelineFile, JSON.stringify(pipeline));
    // Use execFile with explicit args array — avoids shell injection via filenames
    await execFileAsync('pdal', ['pipeline', pipelineFile], { maxBuffer: 256 * 1024 * 1024 });
    await fsPromises.unlink(pipelineFile);

    let originalBackup = null;
    if (keepOriginal) {
      const backupName = `original_${path.basename(inputPath)}`;
      await fsPromises.rename(inputPath, path.join(dir, backupName));
      originalBackup = backupName;
    } else {
      await fsPromises.unlink(inputPath);
    }

    await fsPromises.rename(tempOutput, outputPath);

    return {
      success: true,
      step: `COPC: converted`,
      originalBackup,
    };
  } catch (err) {
    await fsPromises.unlink(pipelineFile).catch(() => {});
    await fsPromises.unlink(tempOutput).catch(() => {});
    return {
      success: false,
      step:    `COPC: conversion failed`,
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

class PointCloudProcessor {
  constructor(config) {
    this.config = config;
  }

  /**
   * Check if required tools are installed
   */
  async checkDependencies() {
    const tools = {
      pdal: false,
      entwine: false,
      potree: false
    };

    try {
      await execFileAsync('pdal', ['--version']);
      tools.pdal = true;
    } catch (e) {
      // PDAL not installed
    }

    try {
      await execFileAsync('entwine', ['--version']);
      tools.entwine = true;
    } catch (e) {
      // Entwine not installed
    }

    try {
      await execFileAsync('PotreeConverter', ['--version']);
      tools.potree = true;
    } catch (e) {
      // PotreeConverter not installed
    }

    return tools;
  }

  /**
   * Get file statistics
   */
  getFileStats(filePath) {
    const stats = fs.statSync(filePath);
    const sizeMB = stats.size / (1024 * 1024);
    const sizeGB = stats.size / (1024 * 1024 * 1024);
    
    return {
      sizeBytes: stats.size,
      sizeMB: sizeMB.toFixed(2),
      sizeGB: sizeGB.toFixed(2),
      isLarge: sizeMB > 100
    };
  }

  /**
   * Get the correct PDAL reader type for a given file extension
   */
  getReaderType(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    switch (ext) {
      case '.ply': return 'readers.ply';
      case '.las':
      case '.laz': return 'readers.las';
      default: return 'readers.las';
    }
  }

  /**
   * Convert LAS/LAZ/PLY to COPC using PDAL
   */
  async convertToCOPC(inputPath, outputPath) {
    try {
      const readerType = this.getReaderType(inputPath);

      // PDAL pipeline for COPC conversion
      const pipeline = {
        pipeline: [
          {
            type: readerType,
            filename: inputPath
          },
          {
            type: "filters.reprojection",
            in_srs: this.config.sourceCrs || "EPSG:4326",
            out_srs: this.config.targetCrs || "EPSG:3031"
          },
          {
            type: "writers.copc",
            filename: outputPath,
            forward: "all",
            a_srs: this.config.targetCrs || "EPSG:3031"
          }
        ]
      };

      const pipelineFile = outputPath.replace(/\.copc\.laz$/, ".pipeline.json");
      fs.writeFileSync(pipelineFile, JSON.stringify(pipeline, null, 2));

      console.log(`  - Running PDAL pipeline...`);
      const { stdout, stderr } = await execFileAsync('pdal', ['pipeline', pipelineFile], { maxBuffer: 50 * 1024 * 1024 });
      
      if (stderr && !stderr.includes("Warning")) {
        console.error(`  PDAL stderr: ${stderr}`);
      }

      // Clean up pipeline file
      fs.unlinkSync(pipelineFile);
      
      return true;
    } catch (error) {
      console.error(`  PDAL error: ${error.message}`);
      return false;
    }
  }

  /**
   * Thin point cloud to reduce density
   */
  async thinPointCloud(inputPath, outputPath, keepEveryNth = 2) {
    try {
      const readerType = this.getReaderType(inputPath);
      const pipeline = {
        pipeline: [
          {
            type: readerType,
            filename: inputPath
          },
          {
            type: "filters.sample",
            radius: this.config.thinning?.radius || 0.5  // Keep one point per 0.5m radius
          },
          {
            type: "filters.reprojection",
            in_srs: this.config.sourceCrs || "EPSG:4326",
            out_srs: this.config.targetCrs || "EPSG:3031"
          },
          {
            type: "writers.copc",
            filename: outputPath,
            forward: "all",
            a_srs: this.config.targetCrs || "EPSG:3031"
          }
        ]
      };

      const pipelineFile = outputPath.replace(/\.copc\.laz$/, ".pipeline.json");
      fs.writeFileSync(pipelineFile, JSON.stringify(pipeline, null, 2));

      console.log(`  - Thinning point cloud (radius: ${this.config.thinning?.radius || 0.5}m)...`);
      const { stdout, stderr } = await execFileAsync('pdal', ['pipeline', pipelineFile], { maxBuffer: 50 * 1024 * 1024 });

      fs.unlinkSync(pipelineFile);
      
      return true;
    } catch (error) {
      console.error(`  Thinning error: ${error.message}`);
      return false;
    }
  }

  /**
   * Get point cloud info using PDAL
   */
  async getPointCloudInfo(filePath) {
    try {
      // For PLY files, try pdal info first; if that fails, estimate from file size
      const { stdout } = await execFileAsync('pdal', ['info', '--summary', filePath], { maxBuffer: 10 * 1024 * 1024 });
      const info = JSON.parse(stdout);
      
      const summary = info.summary || {};
      const pointCount = summary.num_points || 0;
      const bounds = summary.bounds || {};
      
      return {
        pointCount,
        bounds,
        dimensions: summary.dimensions || []
      };
    } catch (error) {
      // PLY files: estimate point count from file size (rough: ~15-30 bytes/point for ASCII, ~12-24 for binary)
      const ext = path.extname(filePath).toLowerCase();
      if (ext === '.ply') {
        try {
          const stats = this.getFileStats(filePath);
          const estimatedPoints = Math.round(stats.sizeBytes / 20); // rough estimate
          console.log(`  - Could not read PLY metadata via PDAL, estimating ~${estimatedPoints.toLocaleString()} points from file size`);
          return { pointCount: estimatedPoints, bounds: {}, dimensions: [] };
        } catch (e) {
          // fall through
        }
      }
      console.error(`  Error getting point cloud info: ${error.message}`);
      return null;
    }
  }

  /**
   * Process a single point cloud file
   */
  async processPointCloud(inputPath, outputDir) {
    // Strip double extensions like .copc.laz
    let basename = path.basename(inputPath);
    // Remove known compound extensions first
    basename = basename.replace(/\.copc\.laz$/i, '');
    // Then remove remaining simple extension
    if (basename === path.basename(inputPath)) {
      basename = path.basename(inputPath, path.extname(inputPath));
    }
    const ext = path.extname(inputPath).toLowerCase();
    const isPLY = ext === '.ply';
    
    console.log(`\nProcessing point cloud: ${path.basename(inputPath)}`);
    
    // Get file stats
    const stats = this.getFileStats(inputPath);
    console.log(`  - Size: ${stats.sizeGB > 1 ? stats.sizeGB + ' GB' : stats.sizeMB + ' MB'}`);

    // Check available tools
    const tools = await this.checkDependencies();
    
    if (!tools.pdal) {
      console.warn(`  ! PDAL not installed - copying file as-is`);
      const outputPath = path.join(outputDir, path.basename(inputPath));
      fs.copyFileSync(inputPath, outputPath);
      return path.basename(inputPath);
    }

    console.log(`  - Available tools: PDAL=${tools.pdal}`);

    // Get point cloud info
    console.log(`  - Reading point cloud metadata...`);
    const info = await this.getPointCloudInfo(inputPath);
    if (info) {
      console.log(`    Points: ${info.pointCount.toLocaleString()}`);
      console.log(`    Dimensions: ${info.dimensions.length}`);
    }

    // Determine if we need to process
    const isCOPC = inputPath.endsWith('.copc.laz');
    const needsThinning = this.config.thinning?.enabled && 
                          info && 
                          info.pointCount > (this.config.thinning?.maxPoints || 10000000);

    let outputFilename;
    let outputPath;

    if (isCOPC && !needsThinning) {
      console.log(`  - Already in COPC format and within size limits, copying...`);
      outputFilename = path.basename(inputPath);
      outputPath = path.join(outputDir, outputFilename);
      fs.copyFileSync(inputPath, outputPath);
      return outputFilename;
    }

    // Process the point cloud
    if (needsThinning) {
      console.log(`  - Point cloud exceeds ${(this.config.thinning?.maxPoints || 10000000).toLocaleString()} points, thinning...`);
      outputFilename = `${basename}_thinned.copc.laz`;
      outputPath = path.join(outputDir, outputFilename);
      const success = await this.thinPointCloud(inputPath, outputPath);
      
      if (!success) {
        console.warn(`  ! Thinning failed, converting to COPC without thinning...`);
        outputFilename = `${basename}.copc.laz`;
        outputPath = path.join(outputDir, outputFilename);
        await this.convertToCOPC(inputPath, outputPath);
      }
    } else if (!isCOPC) {
      console.log(`  - Converting to COPC format...`);
      outputFilename = `${basename}.copc.laz`;
      outputPath = path.join(outputDir, outputFilename);
      const success = await this.convertToCOPC(inputPath, outputPath);
      
      if (!success) {
        console.warn(`  ! Conversion failed, copying original...`);
        outputFilename = path.basename(inputPath);
        outputPath = path.join(outputDir, outputFilename);
        fs.copyFileSync(inputPath, outputPath);
      }
    }

    if (fs.existsSync(outputPath)) {
      const newStats = this.getFileStats(outputPath);
      const newInfo = await this.getPointCloudInfo(outputPath);
      
      console.log(`  ✓ Processing complete!`);
      console.log(`    Original: ${stats.sizeGB > 1 ? stats.sizeGB + ' GB' : stats.sizeMB + ' MB'}${info ? ', ' + info.pointCount.toLocaleString() + ' points' : ''}`);
      console.log(`    Processed: ${newStats.sizeGB > 1 ? newStats.sizeGB + ' GB' : newStats.sizeMB + ' MB'}${newInfo ? ', ' + newInfo.pointCount.toLocaleString() + ' points' : ''}`);
      
      if (info && newInfo && info.pointCount > 0) {
        const reduction = ((1 - newInfo.pointCount / info.pointCount) * 100).toFixed(1);
        if (reduction > 0) {
          console.log(`    Point reduction: ${reduction}%`);
        }
      }
      
      return outputFilename;
    }

    return path.basename(inputPath);
  }
}

/**
 * Batch process all point clouds in input directory
 */
export async function processAllPointClouds(inputDir, outputDir, config) {
  if (!config.pointclouds.enabled) {
    console.log("Point cloud processing is disabled in config.");
    return;
  }

  if (!fs.existsSync(inputDir)) {
    console.log(`Input directory does not exist: ${inputDir}`);
    return;
  }

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const processor = new PointCloudProcessor(config.pointclouds);
  
  // Show installation instructions if tools are missing
  const tools = await processor.checkDependencies();
  if (!tools.pdal) {
    console.log("\n⚠️  PDAL not detected!");
    console.log("\nTo enable point cloud processing (COPC conversion), install PDAL:");
    console.log("\n  macOS:");
    console.log("    brew install pdal");
    console.log("\n  Ubuntu/Debian:");
    console.log("    sudo apt-get install pdal libpdal-dev");
    console.log("\n  Windows:");
    console.log("    conda install -c conda-forge pdal");
    console.log("    # OR download from https://pdal.io/");
    console.log("\n  Point clouds will be copied without processing.\n");
  }

  const files = fs.readdirSync(inputDir).filter(f => 
    f.endsWith('.las') || f.endsWith('.laz') || f.endsWith('.copc.laz') || f.endsWith('.ply')
  );

  console.log(`\nFound ${files.length} point cloud(s) to process\n`);

  for (const file of files) {
    const inputPath = path.join(inputDir, file);
    try {
      await processor.processPointCloud(inputPath, outputDir);
    } catch (error) {
      console.error(`Error processing ${file}:`, error.message);
    }
  }

  console.log("\n✓ Point cloud processing complete!\n");
}
