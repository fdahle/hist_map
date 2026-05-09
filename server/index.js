/**
 * Express server for serving geospatial data
 * Provides static file serving with CORS support and proper error handling
 */
import 'dotenv/config';   // loads server/.env before anything else
import express from 'express';
import path from 'path';
import os from 'os';
import fs from 'fs/promises';
import { execFile } from 'child_process';
import crypto from 'crypto';
import cors from 'cors';
import compression from 'compression';
import helmet from 'helmet';
import yaml from 'js-yaml';
import multer from 'multer';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { fileURLToPath } from 'url';
import config, { isDevelopment, isProduction } from './src/config.js';
import logger from './src/logger.js';
import { listLayers, readLayerMeta, writeLayerMeta, deleteLayer, readLinks, writeLinks, validateLayerId, resolveInDir, safeLayerExt, scanOrphans } from './src/layerStore.js';
import { jobQueue } from './src/jobQueue.js';
import { processUploadBatch, addSubFile, addSubFileBatch, classifyExt, relinkGeojson, applyCsvLink, applyCsvLayerLink, parseGeoFile, serializeGeoFile } from './processors/uploadProcessor.js';
import { stampFeatureIds } from './processors/shapeProcessor.js';
import { convertToCog, isGdalAvailable } from './processors/geotiffProcessor.js';
import { convertToCopc, isPdalAvailable } from './processors/pointcloudProcessor.js';
import { parse as csvParse } from 'csv-parse/sync';

const app = express();

// Convert import.meta.url to __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── Runtime admin password ─────────────────────────────────────
// Stored in data/.credentials (plain text, 0o600). Set via the first-run wizard.
// Reset by deleting the file (e.g. via the Danger Zone "Reset Config" action).
const credentialsFilePath = path.join(__dirname, config.dataPath, '.credentials');

// runtimeAdminPassword stores the bcrypt hash of the admin password.
let runtimeAdminPassword = null;
try {
  const stored = (await fs.readFile(credentialsFilePath, 'utf8').catch(() => null))?.trim();
  if (stored) runtimeAdminPassword = stored;
} catch (err) { logger.warn('Could not load stored credentials:', err.message); }

function getAdminPassword() { return runtimeAdminPassword; }

// ── Runtime user password ──────────────────────────────────────
// Stored in data/.user-credentials. Optional — when absent the app is public.
const userCredentialsFilePath = path.join(__dirname, config.dataPath, '.user-credentials');
let runtimeUserPassword = null;
try {
  const stored = (await fs.readFile(userCredentialsFilePath, 'utf8').catch(() => null))?.trim();
  if (stored) runtimeUserPassword = stored;
} catch (err) { logger.warn('Could not load user credentials:', err.message); }

function getUserPassword() { return runtimeUserPassword; }

// CORS configuration
const corsOptions = {
  origin: (origin, callback) => {
    // In development, allow any origin for local tooling
    if (isDevelopment) return callback(null, true);
    // In production, require a valid Origin that matches the whitelist.
    // Requests without an Origin header (e.g. server-to-server, curl) are
    // allowed only when they come from the same host (handled by the
    // browser — non-browser clients don't send Origin at all).
    if (!origin) return callback(null, true);
    if (config.corsOrigins.includes(origin)) {
      callback(null, true);
    } else {
      logger.warn(`CORS blocked request from: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization'],
  // Range-request headers must be explicitly exposed for cross-origin clients
  // (dev: client on :5173, server on :3000). Without this, geotiff.js cannot
  // read Content-Range responses and every tile fetch fails with AggregateError.
  exposedHeaders: ['Content-Range', 'Accept-Ranges', 'Content-Length'],
};

// Middleware
app.use(cors(corsOptions));

// Security headers via helmet
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc:  ["'self'", "'wasm-unsafe-eval'"],
      styleSrc:   ["'self'", "'unsafe-inline'"],   // Three.js / Cesium may inject inline styles
      imgSrc:     ["'self'", 'data:', 'blob:', 'https:'],
      connectSrc: ["'self'", 'https:', 'blob:'],
      workerSrc:  ["'self'", 'blob:'],
      objectSrc:  ["'none'"],
      baseUri:    ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
    },
  },
  // Enable HSTS so browsers always use HTTPS after the first visit
  hsts: isProduction ? { maxAge: 31536000, includeSubDomains: true } : false,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  crossOriginEmbedderPolicy: false,  // required for cross-origin tile/model loads
  crossOriginResourcePolicy: false,  // allow sub-resources from other origins
}));

// Compress text-based API responses. The /data route is excluded entirely
// so that HTTP range requests (geotiff.js tile reads, point-cloud streaming)
// work correctly — gzip wrapping destroys byte offsets and strips Content-Range.
app.use(compression());
app.use(express.json());

// Request logging in development
if (isDevelopment) {
  app.use((req, res, next) => {
    logger.debug(`${req.method} ${req.path}`);
    next();
  });
}

// Path to the config file served to clients
const configFilePath = path.join(__dirname, config.dataPath, 'config.yaml');

// Admin authentication middleware — compares submitted password against the stored bcrypt hash.
async function requireAdminAuth(req, res, next) {
  const hash = getAdminPassword();
  if (!hash) {
    return res.status(503).json({ error: 'Admin access not configured. Use the setup wizard to set a password.' });
  }
  const auth = req.headers['authorization'];
  if (!auth || !auth.startsWith('Basic ')) {
    res.setHeader('WWW-Authenticate', 'Basic realm="Admin panel"');
    return res.status(401).json({ error: 'Authentication required' });
  }
  const decoded = Buffer.from(auth.slice(6), 'base64').toString('utf8');
  const colonIndex = decoded.indexOf(':');
  const password = colonIndex >= 0 ? decoded.slice(colonIndex + 1) : '';
  try {
    // bcrypt.compare is timing-safe and handles both hash format validation and comparison.
    const match = await bcrypt.compare(password, hash);
    if (!match) return res.status(403).json({ error: 'Invalid credentials' });
    next();
  } catch {
    return res.status(500).json({ error: 'Authentication error' });
  }
}

// Rate limiting for auth endpoints — prevents brute-force attacks.
const authRateLimit = rateLimit({
  windowMs: config.rateLimitWindow,
  max: config.rateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});

// General rate limit for public data endpoints — prevents abuse / DoS.
// GeoTIFF files served from /data are fetched via many HTTP range requests
// (one per internal tile / overview level), so the limit must be high enough
// to accommodate a full COG read session without throttling.
const dataRateLimit = rateLimit({
  windowMs: 60_000,       // 1 minute window
  max: 2000,              // 2000 requests per minute per IP (COG range reads are chatty)
  standardHeaders: true,
  legacyHeaders: false,
  // Skip the limiter entirely for range requests — they are file reads, not API calls.
  skip: (req) => !!(req.headers.range),
  message: { error: 'Too many requests, please try again later.' },
});

// Rate limit for public endpoints that perform filesystem operations.
const generalRateLimit = rateLimit({
  windowMs: 60_000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});

// Rate limit for all admin endpoints — prevents resource exhaustion even when authenticated.
const adminRateLimit = rateLimit({
  windowMs: 60_000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});

// Strict rate limit for conversion downloads — CPU/disk-intensive operations.
const conversionRateLimit = rateLimit({
  windowMs: 60_000,
  max: 6,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many conversion requests, please wait a moment.' },
});

// Apply rate limits to route groups before any route handler is registered.
app.use('/admin', adminRateLimit);
app.use(['/config', '/viewer', '/health', '/user'], generalRateLimit);

// Shared catch-block helper — centralises the not-found / server-error pattern
// repeated across route handlers. Use `status` to override the default 500.
function handleRouteError(res, err, status = 500) {
  if (err.message?.includes('not found') || err.code === 'ENOENT') {
    return res.status(404).json({ error: err.message });
  }
  const message = (status < 500 || isDevelopment) ? err.message : 'Internal Server Error';
  return res.status(status).json({ error: message });
}

// ── Admin disabled guard ───────────────────────────────────────────────────────
// When ADMIN_ENABLED=false all /admin/* routes return 404 — the panel does not
// exist at the network level. setup-status is kept alive so the client can
// discover the flag and adapt its UI without making guesses.
if (!config.adminEnabled) {
  app.get('/admin/setup-status', (_req, res) => res.json({ adminEnabled: false }));
  app.use('/admin', (_req, res) => res.status(404).json({ error: 'Not found.' }));
  logger.info('Admin panel disabled (ADMIN_ENABLED=false) — all /admin/* routes removed.');
}

// Setup status — public, tells the client what first-run steps remain
app.get('/admin/setup-status', async (req, res) => {
  const hasPassword = !!getAdminPassword();
  let hasConfig = false;
  try { await fs.access(configFilePath); hasConfig = true; } catch { /* no config */ }
  res.json({ adminEnabled: true, hasPassword, hasConfig });
});

// Set admin password — usable during initial setup OR after a config reset (no .credentials file)
app.post('/admin/set-password', authRateLimit, express.json(), async (req, res) => {
  // Allow only if no .credentials file exists (env-var-only installs still block this)
  const fileExists = await fs.access(credentialsFilePath).then(() => true).catch(() => false);
  if (fileExists) {
    return res.status(409).json({ error: 'A password is already set. Use change-password to update it.' });
  }
  const { password } = req.body ?? {};
  if (!password || typeof password !== 'string' || password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  }
  try {
    const hash = await bcrypt.hash(password, 12);
    await fs.writeFile(credentialsFilePath, hash, { mode: 0o600 });
    runtimeAdminPassword = hash;
    logger.info('Admin password set via setup wizard');
    res.json({ success: true });
  } catch (err) {
    logger.error('Failed to save credentials:', err.message);
    res.status(500).json({ error: 'Failed to save password.' });
  }
});

// Change admin password — requires current credentials (header) + explicit old password in body
app.post('/admin/change-password', authRateLimit, requireAdminAuth, express.json(), async (req, res) => {
  const { oldPassword, newPassword } = req.body ?? {};
  if (!oldPassword || typeof oldPassword !== 'string') {
    return res.status(400).json({ error: 'Current password is required.' });
  }
  if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 8) {
    return res.status(400).json({ error: 'New password must be at least 8 characters.' });
  }
  const hash = getAdminPassword();
  const match = await bcrypt.compare(oldPassword, hash).catch(() => false);
  if (!match) {
    return res.status(403).json({ error: 'Current password is incorrect.' });
  }
  try {
    const newHash = await bcrypt.hash(newPassword, 12);
    await fs.writeFile(credentialsFilePath, newHash, { mode: 0o600 });
    runtimeAdminPassword = newHash;
    logger.info('Admin password changed');
    res.json({ success: true });
  } catch (err) {
    logger.error('Failed to update credentials:', err.message);
    res.status(500).json({ error: 'Failed to save new password.' });
  }
});

// Verify admin credentials — used by the client login form
app.get('/admin/verify', authRateLimit, requireAdminAuth, (req, res) => {
  res.json({ ok: true });
});

// ── User access password ───────────────────────────────────────────────────────

// Public: tells the client whether a user password gate is active
app.get('/user/auth-status', (req, res) => {
  res.json({ hasUserPassword: !!getUserPassword() });
});

// Public: verify the user password (rate-limited)
app.post('/user/verify', authRateLimit, express.json(), async (req, res) => {
  const hash = getUserPassword();
  if (!hash) return res.json({ ok: true });
  const { password } = req.body ?? {};
  if (!password || typeof password !== 'string') {
    return res.status(400).json({ error: 'Password required.' });
  }
  try {
    const match = await bcrypt.compare(password, hash);
    if (!match) return res.status(403).json({ error: 'Incorrect password.' });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Authentication error.' });
  }
});

// Admin: set or clear the user access password
app.post('/admin/user-password', authRateLimit, requireAdminAuth, express.json(), async (req, res) => {
  const { password, clear } = req.body ?? {};
  if (clear) {
    await fs.unlink(userCredentialsFilePath).catch(() => {});
    runtimeUserPassword = null;
    logger.info('User access password cleared');
    return res.json({ success: true });
  }
  if (!password || typeof password !== 'string' || password.length < 4) {
    return res.status(400).json({ error: 'Password must be at least 4 characters.' });
  }
  try {
    const hash = await bcrypt.hash(password, 12);
    await fs.writeFile(userCredentialsFilePath, hash, { mode: 0o600 });
    runtimeUserPassword = hash;
    logger.info('User access password set');
    res.json({ success: true });
  } catch (err) {
    logger.error('Failed to save user credentials:', err.message);
    res.status(500).json({ error: 'Failed to save password.' });
  }
});

// Viewer access status — public, tells the client whether the 3D viewer is accessible
app.get('/viewer/access-status', async (req, res) => {
  try {
    const yamlText = await fs.readFile(configFilePath, 'utf8');
    const parsed = yaml.load(yamlText, { schema: yaml.CORE_SCHEMA });
    const viewerEnabled = parsed?.ui?.viewer_access !== false;
    res.json({ viewerEnabled });
  } catch {
    // No config yet or unreadable — allow access by default
    res.json({ viewerEnabled: true });
  }
});

// Map access status — public, tells the client whether the map viewer is accessible
app.get('/map/access-status', async (req, res) => {
  try {
    const yamlText = await fs.readFile(configFilePath, 'utf8');
    const parsed = yaml.load(yamlText, { schema: yaml.CORE_SCHEMA });
    const mapEnabled = parsed?.ui?.map_access !== false;
    res.json({ mapEnabled });
  } catch {
    res.json({ mapEnabled: true });
  }
});

// Public GeoJSON → Shapefile conversion — no auth required (source data is already public)
app.get('/layers/:id/convert', generalRateLimit, conversionRateLimit, async (req, res) => {
  let tmpDir = null;
  try {
    const yamlText = await fs.readFile(configFilePath, 'utf8');
    const cfg = yaml.load(yamlText, { schema: yaml.CORE_SCHEMA });
    if (cfg?.ui?.map_download === false)          return res.status(403).json({ error: 'Downloads are disabled.' });
    if (cfg?.ui?.download_conversions === false)  return res.status(403).json({ error: 'Format conversions are disabled.' });

    const format = req.query.format;
    if (format !== 'shapefile') return res.status(400).json({ error: 'Only shapefile conversion is available on public layers.' });

    validateLayerId(req.params.id);
    const meta = await readLayerMeta(layersDir, req.params.id);
    if (meta.fileType !== 'geojson') return res.status(400).json({ error: 'Shapefile conversion is only available for GeoJSON layers.' });

    const srcExt  = safeLayerExt(meta.extension);
    const srcPath = resolveInDir(layersDir, req.params.id, `${req.params.id}${srcExt}`);
    const baseName = path.parse(meta.originalName ?? req.params.id).name;

    tmpDir = path.join(os.tmpdir(), `s3d-pub-convert-${crypto.randomUUID()}`);
    await fs.mkdir(tmpDir, { recursive: true });

    const outZip = path.join(tmpDir, `${baseName}.zip`);
    await new Promise((resolve, reject) => {
      execFile('ogr2ogr', ['-f', 'ESRI Shapefile', `/vsizip/${outZip}`, srcPath], (err) => {
        if (err) reject(new Error(`ogr2ogr failed: ${err.message}`));
        else resolve();
      });
    });
    res.download(outZip, `${baseName}.zip`, () => fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {}));
  } catch (err) {
    if (tmpDir) fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    return handleRouteError(res, err);
  }
});

// Health check endpoint — minimal response to avoid information disclosure
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Serve the app config (read by the client on startup)
app.get('/config', async (req, res) => {
  try {
    const yamlText = await fs.readFile(configFilePath, 'utf8');
    res.setHeader('Content-Type', 'text/yaml; charset=utf-8');
    res.send(yamlText);
  } catch (err) {
    if (err.code === 'ENOENT') {
      return res.status(404).json({ error: 'No configuration found. Use the admin panel to create one.' });
    }
    logger.error('Failed to read config file:', err.message);
    res.status(500).json({ error: 'Failed to read configuration' });
  }
});

// Update the app config (admin only)
app.put('/config', requireAdminAuth, express.text({ type: 'text/yaml', limit: '256kb' }), async (req, res) => {
  try {
    // Use SAFE_SCHEMA to prevent instantiation of JS objects from YAML tags
    const parsed = yaml.load(req.body, { schema: yaml.CORE_SCHEMA });
    if (parsed == null || typeof parsed !== 'object') {
      return res.status(400).json({ error: 'Config must be a YAML mapping.' });
    }
    await fs.writeFile(configFilePath, req.body, 'utf8');
    logger.info('Config updated via admin API');
    res.json({ success: true });
  } catch (err) {
    if (err.name === 'YAMLException') {
      return res.status(400).json({ error: `Invalid YAML: ${err.message}` });
    }
    logger.error('Failed to write config file:', err.message);
    res.status(500).json({ error: 'Failed to save configuration' });
  }
});

// Delete the app config (admin only) — also clears .credentials so a new password can be chosen
app.delete('/config', requireAdminAuth, async (req, res) => {
  const errors = [];
  try {
    await fs.unlink(configFilePath);
    logger.info('Config deleted via admin API');
  } catch (err) {
    if (err.code !== 'ENOENT') errors.push(`config: ${err.message}`);
  }
  // Clear .credentials so the next visitor can set a fresh password.
  try {
    await fs.unlink(credentialsFilePath);
    runtimeAdminPassword = null;
    logger.info('Credentials cleared on config reset');
  } catch (err) {
    if (err.code !== 'ENOENT') errors.push(`credentials: ${err.message}`);
  }
  // Clear user access password as well.
  await fs.unlink(userCredentialsFilePath).catch(() => {});
  runtimeUserPassword = null;
  if (errors.length) return res.status(500).json({ error: errors.join('; ') });
  res.json({ success: true });
});

// ── Data directory ───────────────────────────────────────────────────────────
const dataDir       = path.join(__dirname, config.dataPath);
const layersDir     = path.join(dataDir, 'layers');
const tmpUploadsDir = path.join(__dirname, 'tmp-uploads');
await fs.mkdir(tmpUploadsDir, { recursive: true });

// ── Multer setup ──────────────────────────────────────────────────────────────
const ALLOWED_UPLOAD_EXTS = new Set(['.geojson', '.json', '.tif', '.tiff', '.obj', '.ply', '.stl',
  '.las', '.laz', '.mtl', '.jpg', '.jpeg', '.png', '.bmp', '.tga', '.webp', '.csv']);

function makeUploadInstance() {
  return multer({
    storage: multer.diskStorage({
      destination: (_req, _file, cb) => cb(null, tmpUploadsDir),
      filename:    (_req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, `${crypto.randomUUID()}${ext}`);
      },
    }),
    limits: { fileSize: config.uploadLimitMb * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      if (ALLOWED_UPLOAD_EXTS.has(ext)) cb(null, true);
      else cb(new Error(`Unsupported file type: ${ext}`));
    },
  });
}

function runUploadMiddleware(req, res, next) {
  makeUploadInstance().array('files', 30)(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ error: `Upload error: ${err.message}` });
    }
    if (err) {
      return res.status(400).json({ error: err.message });
    }
    next();
  });
}

function runSubfileMiddleware(req, res, next) {
  makeUploadInstance().single('file')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ error: `Upload error: ${err.message}` });
    }
    if (err) return res.status(400).json({ error: err.message });
    next();
  });
}

// ── Upload files ──────────────────────────────────────────────────────────────
app.post('/admin/upload', requireAdminAuth, runUploadMiddleware, async (req, res) => {
  if (!req.files || req.files.length === 0) return res.status(400).json({ error: 'No files provided.' });

  // Per-file settings from the client upload modal, keyed by original filename
  let allSettings = {};
  try {
    if (req.body?.settings) allSettings = JSON.parse(req.body.settings);
  } catch { /* ignore malformed settings */ }

  try {
    await fs.mkdir(layersDir, { recursive: true });
    const results = await processUploadBatch(req.files, layersDir, allSettings);
    for (const r of results) logger.info(`Upload processed: ${r.dataPath} (${r.type})`);

    // Kick off background optimisation for any layers that need it
    for (const r of results) {
      if (r.optimizationType) {
        _startOptimizationJob(r.id, r.optimizationType, r.dataPath);
      }
    }
    res.json(results);
  } catch (err) {
    logger.error('Upload processing error:', err.message);
    res.status(500).json({ error: isProduction ? 'Upload processing failed. Check server logs for details.' : err.message });
  }
});

// ── Layer CRUD ───────────────────────────────────────────────────────────────

/**
 * Cross-platform disk space helper.
 * - Linux / macOS (including Docker on Mac): uses `df -B1`
 * - Windows (native dev without Docker):    uses PowerShell Get-PSDrive
 * Returns { free: number, total: number } in bytes.
 */
async function getDiskSpace(targetPath) {
  if (os.platform() === 'win32') {
    // Resolve the drive letter from the path (e.g. "C")
    const drive = path.resolve(targetPath).split(path.sep)[0].replace(':', '');
    const ps = `$d=(Get-PSDrive -Name '${drive}' -PSProvider FileSystem);` +
               `Write-Output "$($d.Used+$d.Free) $($d.Free)"`;
    const stdout = await new Promise((resolve, reject) =>
      execFile('powershell', ['-NoProfile', '-Command', ps], (err, out) =>
        err ? reject(err) : resolve(out)));
    const [total, free] = stdout.trim().split(/\s+/).map(Number);
    return { free, total };
  }
  // Linux / macOS
  const stdout = await new Promise((resolve, reject) =>
    execFile('df', ['-B1', targetPath], (err, out) =>
      err ? reject(err) : resolve(out)));
  // df output line: Filesystem  1B-blocks  Used  Available  Use%  Mounted
  const parts = stdout.trim().split('\n')[1].trim().split(/\s+/);
  return { total: parseInt(parts[1], 10), free: parseInt(parts[3], 10) };
}

// Storage info — total size of the data directory + upload limit
app.get('/admin/storage', requireAdminAuth, async (req, res) => {
  async function dirSize(dir) {
    let total = 0;
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      await Promise.all(entries.map(async (e) => {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) { total += await dirSize(full); }
        else { try { const s = await fs.stat(full); total += s.size; } catch { /* skip */ } }
      }));
    } catch { /* dir may not exist yet */ }
    return total;
  }
  const usedBytes = await dirSize(dataDir);

  const typeBytes = { geojson: 0, geotiff: 0, model: 0, pointcloud: 0, csv: 0 };
  try {
    const layers = await listLayers(layersDir);
    await Promise.all(layers.map(async (layer) => {
      if (layer.fileType in typeBytes) {
        typeBytes[layer.fileType] += await dirSize(resolveInDir(layersDir, layer.id));
      }
    }));
  } catch { /* non-fatal */ }

  let diskFreeBytes  = null;
  let diskTotalBytes = null;
  try {
    const { free, total } = await getDiskSpace(dataDir);
    diskFreeBytes  = free;
    diskTotalBytes = total;
  } catch { /* disk info unavailable */ }
  res.json({ usedBytes, typeBytes, uploadLimitMb: config.uploadLimitMb, diskFreeBytes, diskTotalBytes });
});

// System library availability check
app.get('/admin/system-libraries', requireAdminAuth, async (_req, res) => {
  const [gdal, pdal] = await Promise.all([isGdalAvailable(), isPdalAvailable()]);
  res.json([
    { name: 'GDAL', description: 'GeoTIFF → COG conversion & CRS detection', available: gdal },
    { name: 'PDAL', description: 'Point cloud → COPC conversion',            available: pdal },
  ]);
});

// List all layers (reads sidecar files)
app.get('/admin/layers', requireAdminAuth, async (req, res) => {
  try {
    const layers = await listLayers(layersDir);
    res.json(layers);
  } catch (err) {
    return handleRouteError(res, err);
  }
});

// Get single layer meta
app.get('/admin/layers/:id', requireAdminAuth, async (req, res) => {
  try {
    validateLayerId(req.params.id);
    const meta = await readLayerMeta(layersDir, req.params.id);
    res.json(meta);
  } catch (err) {
    return handleRouteError(res, err, 400);
  }
});

// Update layer config (display name, visibility, order, extra fields)
app.patch('/admin/layers/:id', requireAdminAuth, async (req, res) => {
  try {
    validateLayerId(req.params.id);
    const meta = await readLayerMeta(layersDir, req.params.id);
    const { displayName, visible, order, opacity, noDataValue, normalize, color, stroke_color, fill_color, attribution, search_fields, thumbnail_url, download_url, pointType, group_by, csvLink, description, notes } = req.body ?? {};
    if (displayName  != null && String(displayName).length  > 200)  return res.status(400).json({ error: 'displayName too long (max 200)' });
    if (color        != null && String(color).length        > 100)  return res.status(400).json({ error: 'color too long (max 100)' });
    if (stroke_color != null && String(stroke_color).length > 100)  return res.status(400).json({ error: 'stroke_color too long (max 100)' });
    if (fill_color   != null && String(fill_color).length   > 100)  return res.status(400).json({ error: 'fill_color too long (max 100)' });
    if (attribution  != null && String(attribution).length  > 1000) return res.status(400).json({ error: 'attribution too long (max 1000)' });
    if (description  != null && String(description).length  > 2000) return res.status(400).json({ error: 'description too long (max 2000)' });
    if (notes        != null && String(notes).length        > 5000) return res.status(400).json({ error: 'notes too long (max 5000)' });
    if (displayName  != null) meta.layerConfig.displayName  = String(displayName);
    if (visible      != null) meta.layerConfig.visible      = Boolean(visible);
    if (order        != null) meta.layerConfig.order        = Number(order);
    // GeoTIFF-specific fields
    if (opacity      != null) meta.layerConfig.opacity      = Number(opacity);
    if (noDataValue  != null) meta.layerConfig.noDataValue  = Number(noDataValue);
    if (normalize    != null) meta.layerConfig.normalize    = Boolean(normalize);
    // GeoJSON / shared fields
    if (color        != null) meta.layerConfig.color        = String(color);
    if (stroke_color != null) meta.layerConfig.stroke_color = String(stroke_color);
    if (fill_color   != null) meta.layerConfig.fill_color   = String(fill_color);
    if (attribution  != null) meta.layerConfig.attribution  = String(attribution);
    if (Array.isArray(search_fields)) meta.layerConfig.search_fields = search_fields.map(String);
    if ('thumbnail_url' in (req.body ?? {})) meta.layerConfig.thumbnail_url = thumbnail_url ? String(thumbnail_url) : null;
    if ('download_url'  in (req.body ?? {})) meta.layerConfig.download_url  = download_url  ? String(download_url)  : null;
    if ('pointType'     in (req.body ?? {})) meta.layerConfig.pointType     = pointType ? String(pointType) : null;
    if ('group_by'      in (req.body ?? {})) meta.layerConfig.group_by      = group_by  ? String(group_by)  : null;
    if ('description'   in (req.body ?? {})) meta.layerConfig.description   = description ? String(description) : null;
    if ('notes'         in (req.body ?? {})) meta.layerConfig.notes         = notes       ? String(notes)       : null;
    // CRS override (any layer type)
    const { sourceCrs, tiffProjection } = req.body ?? {};
    if (sourceCrs != null) meta.layerConfig.sourceCrs = String(sourceCrs);
    if ('tiffProjection' in (req.body ?? {}) && meta.fileType === 'geotiff') {
      meta.layerConfig.tiffProjection = tiffProjection ? String(tiffProjection) : null;
    }
    // CSV attribute join
    if ('csvLink' in (req.body ?? {})) {
      const oldJoinedCols = meta.layerConfig.csvLink?.joinedColumns ?? [];
      if (csvLink === null) {
        // Clear the link and strip previously joined columns from features
        if (oldJoinedCols.length > 0 && meta.fileType === 'geojson') {
          try {
            const ext         = safeLayerExt(meta.extension || '.geojson');
            const geojsonPath = resolveInDir(layersDir, req.params.id, `${req.params.id}${ext}`);
            const raw         = await fs.readFile(geojsonPath, 'utf8');
            const { features, header } = parseGeoFile(raw, geojsonPath);
            const colsToRemove = new Set(oldJoinedCols);
            const updated = features.map((f) => {
              for (const col of colsToRemove) delete f.properties?.[col];
              return f;
            });
            await fs.writeFile(geojsonPath, serializeGeoFile(updated, header, geojsonPath), 'utf8');
          } catch { /* best-effort — meta still cleared */ }
        }
        meta.layerConfig.csvLink = null;
      } else if (csvLink && typeof csvLink === 'object') {
        const { subFileId, csvJoinColumn, featureJoinProperty } = csvLink;
        if (typeof subFileId !== 'string' || !subFileId ||
            typeof csvJoinColumn !== 'string' || !csvJoinColumn ||
            typeof featureJoinProperty !== 'string' || !featureJoinProperty) {
          return res.status(400).json({ error: 'csvLink requires non-empty subFileId, csvJoinColumn, and featureJoinProperty.' });
        }
        if (meta.fileType !== 'geojson') {
          return res.status(400).json({ error: 'CSV linking is only supported for GeoJSON layers.' });
        }
        const joinedColumns = await applyCsvLink(
          req.params.id, layersDir,
          { subFileId, csvJoinColumn, featureJoinProperty },
          oldJoinedCols,
        );
        meta.layerConfig.csvLink = { subFileId, csvJoinColumn, featureJoinProperty, joinedColumns };
      }
    }
    await writeLayerMeta(layersDir, req.params.id, meta);
    res.json(meta);
  } catch (err) {
    return handleRouteError(res, err, 400);
  }
});

// Preview first N rows of a GeoJSON or CSV layer
app.get('/admin/layers/:id/preview', requireAdminAuth, async (req, res) => {
  try {
    validateLayerId(req.params.id);
    const meta = await readLayerMeta(layersDir, req.params.id);
    const n = Math.min(Math.max(1, parseInt(req.query.n ?? '10', 10)), 200);
    const filePath = resolveInDir(layersDir, req.params.id, `${req.params.id}${safeLayerExt(meta.extension)}`);
    const raw = await fs.readFile(filePath, 'utf8');

    if (meta.fileType === 'csv') {
      const records = csvParse(raw, { columns: true, skip_empty_lines: true, relax_column_count: true });
      const columns = records.length > 0 ? Object.keys(records[0]) : (meta.csvColumns ?? []);
      const rows = records.slice(0, n).map(r => columns.map(c => r[c] ?? ''));
      const totalLines = raw.split('\n').filter(l => l.trim()).length - 1;
      return res.json({ columns, rows, total: Math.max(totalLines, records.length) });
    }

    if (meta.fileType === 'geojson') {
      let allFeatures;
      if (meta.extension === '.geojsonl') {
        const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
        allFeatures = lines.slice(1).flatMap(l => { try { return [JSON.parse(l)]; } catch { return []; } });
      } else {
        allFeatures = JSON.parse(raw).features ?? [];
      }
      const features = allFeatures.slice(0, n);
      const columnSet = new Set();
      for (const f of features) {
        for (const k of Object.keys(f.properties ?? {})) columnSet.add(k);
      }
      const isUrl = v => typeof v === 'string' && /^https?:\/\//i.test(v.trim());
      const columns = [...columnSet].filter(col => {
        if (col.startsWith('_')) return false;
        const vals = features.map(f => f.properties?.[col]).filter(v => v != null && String(v) !== '');
        if (vals.length > 0 && vals.every(v => isUrl(v))) return false;
        return true;
      });
      const rows = features.map(f => columns.map(c => {
        const v = f.properties?.[c];
        return v == null ? '' : String(v);
      }));
      return res.json({ columns, rows, total: allFeatures.length });
    }

    return res.status(400).json({ error: 'Preview not available for this layer type.' });
  } catch (err) {
    return handleRouteError(res, err);
  }
});

// List feature IDs with display labels (used by the Linking tab)
app.get('/admin/layers/:id/features', requireAdminAuth, async (req, res) => {
  try {
    validateLayerId(req.params.id);
    const meta = await readLayerMeta(layersDir, req.params.id);
    if (meta.fileType !== 'geojson') return res.status(400).json({ error: 'Only GeoJSON layers have features.' });
    const filePath = resolveInDir(layersDir, req.params.id, `${req.params.id}${safeLayerExt(meta.extension)}`);
    const raw = await fs.readFile(filePath, 'utf8');
    const { features: parsedFeatures, header } = parseGeoFile(raw, filePath);

    // If any features are missing _featureId (e.g. layers created before stamping
    // was introduced), stamp them now and write the file back so IDs are stable.
    const needsStamp = (parsedFeatures ?? []).some(f => !f.properties?._featureId);
    if (needsStamp) {
      const fc = { type: 'FeatureCollection', features: parsedFeatures ?? [] };
      stampFeatureIds(fc);
      await fs.writeFile(filePath, serializeGeoFile(fc.features, header, filePath), 'utf8');
    }

    const searchFields = meta.layerConfig?.search_fields ?? [];
    let features = (parsedFeatures ?? []).map(f => {
      const props = f.properties ?? {};
      const id = props._featureId ?? null;
      let label = null;
      for (const field of searchFields) {
        if (props[field] != null && String(props[field]).trim()) { label = String(props[field]); break; }
      }
      if (!label) {
        for (const [k, v] of Object.entries(props)) {
          if (k.startsWith('_')) continue;
          if (typeof v === 'string' && /^https?:\/\//i.test(v)) continue;
          if (v != null && String(v).trim()) { label = String(v); break; }
        }
      }
      return { id, label: label ?? id?.slice(0, 8) ?? '?' };
    }).filter(f => f.id);

    const total = features.length;

    // Optional server-side search filter
    const searchQ = (req.query.search ?? '').trim().toLowerCase();
    if (searchQ) {
      features = features.filter(f =>
        f.label?.toLowerCase().includes(searchQ) || f.id?.toLowerCase().includes(searchQ)
      );
    }
    const filtered = features.length;

    // Pagination
    const pageSize = Math.min(Math.max(parseInt(req.query.pageSize) || 100, 1), 1000);
    const page     = Math.max(parseInt(req.query.page) || 1, 1);
    const offset   = (page - 1) * pageSize;
    features = features.slice(offset, offset + pageSize);

    res.json({ features, total, filtered, page, pageSize });
  } catch (err) {
    return handleRouteError(res, err);
  }
});

// Delete a layer and its entire folder
app.delete('/admin/layers/:id', requireAdminAuth, async (req, res) => {
  try {
    validateLayerId(req.params.id);
    await deleteLayer(layersDir, req.params.id);
    logger.info(`Deleted layer: ${req.params.id}`);
    res.json({ success: true, deleted: req.params.id });
  } catch (err) {
    return handleRouteError(res, err, 400);
  }
});

// ── Orphan cleanup ────────────────────────────────────────────────────────────

// Scan for unreferenced layers, stale config refs, and broken links
app.get('/admin/cleanup/scan', requireAdminAuth, async (_req, res) => {
  try {
    const report = await scanOrphans(layersDir, configFilePath);
    res.json(report);
  } catch (err) {
    return handleRouteError(res, err);
  }
});

// Execute cleanup actions
app.post('/admin/cleanup/execute', requireAdminAuth, express.json({ limit: '64kb' }), async (req, res) => {
  try {
    const { layerIds = [], fixStaleRefs = false, fixBrokenLinks = false } = req.body ?? {};
    const results = { deletedLayers: [], fixedConfigRefs: 0, fixedBrokenLinks: 0 };

    // Delete unreferenced layer directories
    for (const id of layerIds) {
      validateLayerId(id);
      await deleteLayer(layersDir, id);
      results.deletedLayers.push(id);
      logger.info(`Cleanup: deleted unreferenced layer ${id}`);
    }

    // Remove stale _layerId entries from config.yaml
    if (fixStaleRefs) {
      const raw = await fs.readFile(configFilePath, 'utf8');
      const cfg = yaml.load(raw) ?? {};
      const entries = await fs.readdir(layersDir, { withFileTypes: true });
      const diskIds = new Set(entries.filter(e => e.isDirectory()).map(e => e.name));
      const before = (cfg.data_layers ?? []).length;
      cfg.data_layers = (cfg.data_layers ?? []).filter(l => !l._layerId || diskIds.has(l._layerId));
      results.fixedConfigRefs = before - cfg.data_layers.length;
      if (results.fixedConfigRefs > 0) {
        await fs.writeFile(configFilePath, yaml.dump(cfg, { lineWidth: -1 }), 'utf8');
        logger.info(`Cleanup: removed ${results.fixedConfigRefs} stale config reference(s)`);
      }
    }

    // Scrub broken link references from all .links.json files
    if (fixBrokenLinks) {
      const entries = await fs.readdir(layersDir, { withFileTypes: true }).catch(() => []);
      const diskIds = new Set(entries.filter(e => e.isDirectory()).map(e => e.name));
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const linksPath = resolveInDir(layersDir, entry.name, `${entry.name}.links.json`);
        let links;
        try { links = JSON.parse(await fs.readFile(linksPath, 'utf8')); } catch { continue; }
        let changed = false;
        if (Array.isArray(links.featureLinks)) {
          for (const fl of links.featureLinks) {
            const mBefore = (fl.modelLayerIds ?? []).length;
            fl.modelLayerIds = (fl.modelLayerIds ?? []).filter(id => diskIds.has(id));
            const pBefore = (fl.pointcloudLayerIds ?? []).length;
            fl.pointcloudLayerIds = (fl.pointcloudLayerIds ?? []).filter(id => diskIds.has(id));
            if (fl.modelLayerIds.length !== mBefore || fl.pointcloudLayerIds.length !== pBefore) changed = true;
          }
          const fBefore = links.featureLinks.length;
          links.featureLinks = links.featureLinks.filter(fl => fl.modelLayerIds.length > 0 || fl.pointcloudLayerIds.length > 0);
          if (links.featureLinks.length !== fBefore) changed = true;
        }
        if (Array.isArray(links.csvLinks)) {
          const cBefore = links.csvLinks.length;
          links.csvLinks = links.csvLinks.filter(cl => !cl.dataLayerId || diskIds.has(cl.dataLayerId));
          if (links.csvLinks.length !== cBefore) changed = true;
        }
        if (changed) {
          await fs.writeFile(linksPath, JSON.stringify(links, null, 2), 'utf8');
          results.fixedBrokenLinks++;
        }
      }
      if (results.fixedBrokenLinks > 0)
        logger.info(`Cleanup: fixed broken links in ${results.fixedBrokenLinks} layer(s)`);
    }

    res.json({ success: true, ...results });
  } catch (err) {
    return handleRouteError(res, err, 400);
  }
});

// ── Layer links (2D ↔ 3D per-feature, 2D ↔ CSV per-layer) ───────────────────

// Get links for a layer (admin)
app.get('/admin/layers/:id/links', requireAdminAuth, async (req, res) => {
  try {
    validateLayerId(req.params.id);
    const links = await readLinks(layersDir, req.params.id);
    res.json(links);
  } catch (err) {
    return handleRouteError(res, err);
  }
});

// Replace all links for a layer (admin)
app.put('/admin/layers/:id/links', requireAdminAuth, express.json({ limit: '1mb' }), async (req, res) => {
  try {
    validateLayerId(req.params.id);
    const { csvLinks, featureLinks } = req.body ?? {};
    if (!Array.isArray(csvLinks) || !Array.isArray(featureLinks)) {
      return res.status(400).json({ error: 'links body must have csvLinks[] and featureLinks[] arrays.' });
    }
    // Validate featureLink entries
    for (const fl of featureLinks) {
      if (typeof fl.featureId !== 'string') return res.status(400).json({ error: 'featureLink.featureId must be a string.' });
      if (!Array.isArray(fl.modelLayerIds))      fl.modelLayerIds      = [];
      if (!Array.isArray(fl.pointcloudLayerIds))  fl.pointcloudLayerIds = [];
      for (const lid of [...fl.modelLayerIds, ...fl.pointcloudLayerIds]) {
        try { validateLayerId(lid); } catch {
          return res.status(400).json({ error: `Invalid layer ID in featureLinks: ${lid}` });
        }
      }
    }
    // Validate csvLink entries
    for (const cl of csvLinks) {
      try { validateLayerId(cl.dataLayerId); } catch {
        return res.status(400).json({ error: `Invalid dataLayerId in csvLinks: ${cl.dataLayerId}` });
      }
      if (typeof cl.csvJoinColumn !== 'string' || !cl.csvJoinColumn)
        return res.status(400).json({ error: 'csvLink.csvJoinColumn must be a non-empty string.' });
      if (typeof cl.featureJoinProperty !== 'string' || !cl.featureJoinProperty)
        return res.status(400).json({ error: 'csvLink.featureJoinProperty must be a non-empty string.' });
    }

    // Apply CSV joins to the GeoJSON layer so the merged columns are available
    // for group-by, search fields, and extended search.
    const targetMeta = await readLayerMeta(layersDir, req.params.id);
    if (targetMeta.fileType === 'geojson') {
      // Collect all columns that were previously joined (to strip before re-applying)
      const oldLinks = await readLinks(layersDir, req.params.id);
      const allOldJoinedCols = (oldLinks.csvLinks ?? []).flatMap(cl => cl.joinedColumns ?? []);

      // For each incoming csvLink, apply the join and record which columns were added
      for (const cl of csvLinks) {
        // Columns from other links that are still active (don't strip them)
        const otherActiveJoined = csvLinks
          .filter(other => other !== cl)
          .flatMap(other => other.joinedColumns ?? []);
        const oldJoinedForThisLink = allOldJoinedCols.filter(c => !otherActiveJoined.includes(c));
        try {
          cl.joinedColumns = await applyCsvLayerLink(
            req.params.id,
            cl.dataLayerId,
            layersDir,
            { csvJoinColumn: cl.csvJoinColumn, featureJoinProperty: cl.featureJoinProperty },
            oldJoinedForThisLink,
          );
        } catch (joinErr) {
          logger.warn(`CSV join failed for link ${cl.dataLayerId} → ${req.params.id}: ${joinErr.message}`);
          cl.joinedColumns = [];
        }
      }

      // Strip joined columns from any csvLinks that were removed
      const removedCols = allOldJoinedCols.filter(c =>
        !csvLinks.some(cl => (cl.joinedColumns ?? []).includes(c))
      );
      if (removedCols.length > 0) {
        try {
          // Re-read after joins were written, then strip removed columns
          const ext         = safeLayerExt(targetMeta.extension || '.geojson');
          const geojsonPath = resolveInDir(layersDir, req.params.id, `${req.params.id}${ext}`);
          const raw         = await fs.readFile(geojsonPath, 'utf8');
          const { features: featuresList, header } = parseGeoFile(raw, geojsonPath);
          const colSet = new Set(removedCols);
          const cleaned = featuresList.map(f => {
            for (const col of colSet) delete f.properties?.[col];
            return f;
          });
          await fs.writeFile(geojsonPath, serializeGeoFile(cleaned, header, geojsonPath), 'utf8');
        } catch (stripErr) {
          logger.warn(`Failed to strip removed CSV columns: ${stripErr.message}`);
        }
      }
    }

    const links = { csvLinks, featureLinks };
    await writeLinks(layersDir, req.params.id, links);
    res.json(links);
  } catch (err) {
    return handleRouteError(res, err, 400);
  }
});

// Public endpoint — viewer uses this to resolve 3D URLs and CSV joins at load time
app.get('/layers/:id/links', dataRateLimit, async (req, res) => {
  try {
    validateLayerId(req.params.id);
    const links = await readLinks(layersDir, req.params.id);
    res.json(links);
  } catch (err) {
    return handleRouteError(res, err);
  }
});

// Public layer meta — viewer uses this to resolve linked 3D layer file URLs
app.get('/layers/:id/meta', dataRateLimit, async (req, res) => {
  try {
    validateLayerId(req.params.id);
    const meta = await readLayerMeta(layersDir, req.params.id);
    res.json({ id: meta.id, name: meta.layerConfig?.displayName || meta.originalName, fileType: meta.fileType, extension: meta.extension, description: meta.layerConfig?.description || null });
  } catch (err) {
    return handleRouteError(res, err);
  }
});

// ── Sub-files (legacy, kept for OBJ companion management) ────────────────────

// Add sub-file to an existing layer
app.post('/admin/layers/:id/subfiles', requireAdminAuth, runSubfileMiddleware, async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file provided.' });
  const role = req.body?.role ?? 'unknown';
  let settings = {};
  try { settings = JSON.parse(req.body?.settings ?? '{}'); } catch { /* malformed JSON — ignore */ }
  try {
    validateLayerId(req.params.id);
    const result = await addSubFile(req.params.id, req.file, role, layersDir, settings);
    res.json(result);
  } catch (err) {
    return handleRouteError(res, err);
  }
});

// Add multiple sub-files to an existing layer (batch; handles OBJ+MTL+texture grouping)
app.post('/admin/layers/:id/subfiles/batch', requireAdminAuth, runUploadMiddleware, async (req, res) => {
  if (!req.files?.length) return res.status(400).json({ error: 'No files provided.' });
  let allSettings = {};
  try { allSettings = JSON.parse(req.body?.settings ?? '{}'); } catch { /* ignore */ }
  try {
    validateLayerId(req.params.id);
    const result = await addSubFileBatch(req.params.id, req.files, layersDir, allSettings);
    res.json(result);
  } catch (err) {
    return handleRouteError(res, err);
  }
});

// Delete a single sub-file (and its companions) from an existing layer
app.delete('/admin/layers/:id/subfiles/:subId', requireAdminAuth, async (req, res) => {
  const { id, subId } = req.params;
  try {
    validateLayerId(id);
    validateLayerId(subId);
    const meta     = await readLayerMeta(layersDir, id);
    const layerDir = resolveInDir(layersDir, id);

    const subIdx = meta.subFiles.findIndex(sf => sf.id === subId);
    if (subIdx === -1) return res.status(404).json({ error: 'Sub-file not found.' });

    const subFile = meta.subFiles[subIdx];

    // Collect all IDs to delete: the sub-file itself plus any companions it owns
    const toDelete = [{ id: subFile.id, ext: subFile.extension }];
    for (const c of subFile.companions ?? []) {
      toDelete.push({ id: c.id, ext: c.extension });
    }

    // Delete physical files (silently ignore missing files)
    for (const entry of toDelete) {
      await fs.unlink(resolveInDir(layerDir, `${entry.id}${safeLayerExt(entry.ext)}`)).catch(() => {});
    }

    // Remove the sub-file and its companions from meta.subFiles
    const toDeleteIds = new Set(toDelete.map(e => e.id));
    meta.subFiles = meta.subFiles.filter(sf => !toDeleteIds.has(sf.id));

    // If the parent layer is GeoJSON and the deleted sub-file was a model/pointcloud,
    // remove dangling URL references from the links sidecar (GeoJSON is never modified).
    if (meta.fileType === 'geojson' && (subFile.role === 'model' || subFile.role === 'pointcloud')) {
      const urlToRemove = `data/layers/${id}/${subFile.id}${subFile.extension}`;
      try {
        const links = await readLinks(layersDir, id);
        if (Array.isArray(links.featureUrls)) {
          let modified = false;
          for (const fu of links.featureUrls) {
            if (subFile.role === 'model' && fu.modelUrls?.includes(urlToRemove)) {
              const idx = fu.modelUrls.indexOf(urlToRemove);
              fu.modelUrls.splice(idx, 1);
              fu.modelNames?.splice(idx, 1);
              modified = true;
            }
            if (subFile.role === 'pointcloud' && fu.pointcloudUrls?.includes(urlToRemove)) {
              const idx = fu.pointcloudUrls.indexOf(urlToRemove);
              fu.pointcloudUrls.splice(idx, 1);
              fu.pointcloudNames?.splice(idx, 1);
              modified = true;
            }
          }
          links.featureUrls = links.featureUrls.filter(
            fu => (fu.modelUrls?.length ?? 0) > 0 || (fu.pointcloudUrls?.length ?? 0) > 0
          );
          if (modified) {
            await writeLinks(layersDir, id, links);
            meta.linkedModelCount      = new Set(links.featureUrls.flatMap(fu => fu.modelUrls ?? [])).size;
            meta.linkedPointcloudCount = new Set(links.featureUrls.flatMap(fu => fu.pointcloudUrls ?? [])).size;
          }
        }
      } catch { /* links sidecar update is non-fatal */ }
    }

    await writeLayerMeta(layersDir, id, meta);
    logger.info(`Deleted sub-file ${subId} from layer ${id}`);
    res.json({ success: true, deleted: subId });
  } catch (err) {
    return handleRouteError(res, err, 400);
  }
});

// ── Background optimisation jobs ─────────────────────────────────────────────

function _startOptimizationJob(layerId, type, dataPath) {
  const job    = jobQueue.add(layerId, type);
  const absPath = path.join(__dirname, dataPath);

  setImmediate(async () => {
    jobQueue.markStarted(job.id);
    try {
      let meta = await readLayerMeta(layersDir, layerId);
      if (type === 'cog') {
        const { success, step, originalBackup } = await convertToCog(absPath, {
          keepOriginal: meta.keepOriginal,
          ...(meta.cogOptions ?? {}),
        });
        meta = await readLayerMeta(layersDir, layerId);
        meta.processingLog.push(step);
        if (success) {
          meta.status    = 'ready';
          meta.optimized = true;
          if (originalBackup) meta.originalBackup = originalBackup;
          const { size: cogSize } = await fs.stat(absPath).catch(() => ({}));
          if (cogSize) meta.fileSizeBytes = cogSize;
        } else {
          meta.status = 'ready'; // usable even without COG
        }
        await writeLayerMeta(layersDir, layerId, meta);
      } else if (type === 'copc') {
        const { success, step, originalBackup } = await convertToCopc(absPath, {
          keepOriginal: meta.keepOriginal ?? false,
        });
        meta = await readLayerMeta(layersDir, layerId);
        meta.processingLog.push(step);
        if (success) {
          meta.status   = 'ready';
          meta.optimized = true;
          meta.dataPath  = dataPath.replace(/\.(las|laz)$/i, '.copc.laz');
          meta.extension = '.copc.laz';
          if (originalBackup) meta.originalBackup = originalBackup;
          const copcAbsPath = absPath.replace(/\.(las|laz)$/i, '.copc.laz');
          const { size: copcSize } = await fs.stat(copcAbsPath).catch(() => ({}));
          if (copcSize) meta.fileSizeBytes = copcSize;
        } else {
          meta.status = 'ready'; // usable even without COPC
        }
        await writeLayerMeta(layersDir, layerId, meta);
      }
      jobQueue.markDone(job.id);
      logger.info(`Optimisation job ${job.id} (${type}) done for layer ${layerId}`);
    } catch (err) {
      jobQueue.markError(job.id, err);
      const meta = await readLayerMeta(layersDir, layerId).catch(() => null);
      if (meta) {
        meta.status = 'error';
        meta.processingLog.push(`${type.toUpperCase()}: error`);
        await writeLayerMeta(layersDir, layerId, meta).catch(() => {});
      }
      logger.error(`Optimisation job ${job.id} failed:`, err.message);
    }
  });
}

// Job status endpoints
app.get('/admin/jobs', requireAdminAuth, (req, res) => {
  res.json(jobQueue.getAll());
});

app.get('/admin/jobs/layer/:id', requireAdminAuth, (req, res) => {
  try { validateLayerId(req.params.id); } catch { return res.status(400).json({ error: 'Invalid layer ID.' }); }
  res.json(jobQueue.getActiveForLayer(req.params.id));
});

// ── Feature-level linking for new-style layers ────────────────────────────────

// Manually assign 3D sub-file assets to specific features by feature ID.
// Writes to the links sidecar ({id}.links.json) — the GeoJSON is never modified.
app.post('/admin/layers/:id/link', requireAdminAuth, express.json(), async (req, res) => {
  const { id } = req.params;
  const { assignments } = req.body ?? {};

  if (!assignments || typeof assignments !== 'object' || Array.isArray(assignments)) {
    return res.status(400).json({ error: 'assignments must be a plain object.' });
  }

  try {
    validateLayerId(id);
    const meta = await readLayerMeta(layersDir, id);
    if (meta.fileType !== 'geojson') {
      return res.status(400).json({ error: 'Only GeoJSON layers support feature linking.' });
    }

    // Validate that every asset URL lives under data/layers/<id>/
    const allowedPrefix = `data/layers/${id}/`;
    for (const assign of Object.values(assignments)) {
      for (const url of [...(assign.models ?? []), ...(assign.pointclouds ?? [])]) {
        if (typeof url !== 'string' || !url.startsWith(allowedPrefix)) {
          return res.status(400).json({ error: `Invalid asset URL: ${url}` });
        }
        const rel = url.slice('data/'.length);
        if (rel.includes('..') || rel.includes('//') || path.isAbsolute(rel)) {
          return res.status(400).json({ error: `Invalid asset URL: ${url}` });
        }
      }
    }

    // Build sub-file ID → display name lookup
    const subFileNameMap = new Map((meta.subFiles ?? []).map(sf => [sf.id, path.parse(sf.originalName).name]));

    // Convert assignments → featureUrls entries and write to links sidecar
    let linkedCount = 0;
    const featureUrls = [];
    for (const [featureId, assign] of Object.entries(assignments)) {
      const modelUrls       = Array.isArray(assign.models)      ? assign.models      : [];
      const pointcloudUrls  = Array.isArray(assign.pointclouds) ? assign.pointclouds : [];
      const modelNames      = modelUrls.map(u => subFileNameMap.get(path.parse(u).name)).filter(Boolean);
      const pointcloudNames = pointcloudUrls.map(u => subFileNameMap.get(path.parse(u).name)).filter(Boolean);
      if (modelUrls.length || pointcloudUrls.length) {
        featureUrls.push({ featureId, modelUrls, pointcloudUrls, modelNames, pointcloudNames });
        linkedCount++;
      }
    }

    const links = await readLinks(layersDir, id);
    links.featureUrls = featureUrls;
    await writeLinks(layersDir, id, links);

    // Update linked counts in meta so layer cards can show them
    meta.linkedModelCount      = new Set(featureUrls.flatMap(fu => fu.modelUrls)).size;
    meta.linkedPointcloudCount = new Set(featureUrls.flatMap(fu => fu.pointcloudUrls)).size;
    await writeLayerMeta(layersDir, id, meta);

    logger.info(`Layer link: ${id} — ${linkedCount} feature(s) with assets`);
    res.json({ success: true, layerId: id, linkedCount });
  } catch (err) {
    logger.error('Layer link error:', err.message);
    return handleRouteError(res, err);
  }
});

// ── Legacy manual-link (kept for back-compat) ─────────────────────────────────

// Manually assign 3D assets to specific features by feature ID (admin only)
app.post('/admin/manual-link', requireAdminAuth, async (req, res) => {
  const { filename, assignments } = req.body ?? {};

  if (!filename || typeof filename !== 'string') {
    return res.status(400).json({ error: 'filename is required.' });
  }
  if (!filename.endsWith('.geojson') && !filename.endsWith('.geojsonl')) {
    return res.status(400).json({ error: 'Only .geojson/.geojsonl files can be linked.' });
  }
  if (!assignments || typeof assignments !== 'object' || Array.isArray(assignments)) {
    return res.status(400).json({ error: 'assignments must be a plain object.' });
  }

  // Validate that every asset URL is under an allowed data directory
  const allowedPrefixes = ['data/3D/', 'data/pointclouds/'];
  for (const assign of Object.values(assignments)) {
    for (const url of [...(assign.models ?? []), ...(assign.pointclouds ?? [])]) {
      if (typeof url !== 'string' || !allowedPrefixes.some(p => url.startsWith(p))) {
        return res.status(400).json({ error: `Invalid asset URL: ${url}` });
      }
      // Prevent path traversal
      const rel = url.slice('data/'.length);
      if (rel.includes('..') || rel.includes('//') || path.isAbsolute(rel)) {
        return res.status(400).json({ error: `Invalid asset URL: ${url}` });
      }
    }
  }

  const safe = path.basename(filename);
  const filePath = path.join(dataDir, 'shapes', safe);

  let geojson;
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    geojson = JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT') return res.status(404).json({ error: 'File not found.' });
    return res.status(400).json({ error: 'Could not parse GeoJSON.' });
  }

  let linkedCount = 0;
  geojson.features = geojson.features.map((feature) => {
    if (!feature.properties) feature.properties = {};
    const fid = feature.properties._featureId;
    if (fid && Object.prototype.hasOwnProperty.call(assignments, fid)) {
      const assign = assignments[fid];
      feature.properties._model3dUrls   = Array.isArray(assign.models)      ? assign.models      : [];
      feature.properties._pointcloudUrls = Array.isArray(assign.pointclouds) ? assign.pointclouds : [];
      if (feature.properties._model3dUrls.length + feature.properties._pointcloudUrls.length > 0) {
        linkedCount++;
      }
    }
    return feature;
  });

  await fs.writeFile(filePath, JSON.stringify(geojson), 'utf8');
  logger.info(`Manual link: ${safe} — ${linkedCount} feature(s) with assets`);
  res.json({ success: true, filename: safe, linkedCount });
});

// Re-link a GeoJSON layer against all stored 3D/pointcloud assets (admin only)
app.post('/admin/relink', requireAdminAuth, async (req, res) => {
  const { layerId } = req.body;
  if (!layerId || typeof layerId !== 'string') {
    return res.status(400).json({ error: 'layerId is required.' });
  }
  try {
    validateLayerId(layerId);
    const meta = await readLayerMeta(layersDir, layerId);
    if (meta.fileType !== 'geojson') return res.status(400).json({ error: 'Only GeoJSON layers can be re-linked.' });
    const ext     = safeLayerExt(meta.extension || '.geojson');
    const filePath = resolveInDir(layersDir, layerId, `${layerId}${ext}`);
    const result  = await relinkGeojson(filePath, layersDir);
    logger.info(`Re-linked layer ${layerId}: ${result.linkedCount} feature(s) linked`);
    res.json(result);
  } catch (err) {
    logger.error('Re-link error:', err.message);
    return handleRouteError(res, err);
  }
});

// Download the original file for a layer (if keepOriginal was set)
app.get('/admin/layers/:id/original', requireAdminAuth, async (req, res) => {
  try {
    const yamlText = await fs.readFile(configFilePath, 'utf8');
    const cfg = yaml.load(yamlText, { schema: yaml.CORE_SCHEMA });
    if (cfg?.ui?.admin_download === false) return res.status(403).json({ error: 'Downloads are disabled.' });
    validateLayerId(req.params.id);
    const meta = await readLayerMeta(layersDir, req.params.id);
    if (!meta.originalBackup) return res.status(404).json({ error: 'No original backup for this layer.' });
    if (!/^[a-zA-Z0-9._-]+$/.test(meta.originalBackup)) {
      return res.status(500).json({ error: 'Invalid backup filename in layer metadata.' });
    }
    const backupPath = resolveInDir(layersDir, req.params.id, path.basename(meta.originalBackup));
    res.download(backupPath, meta.originalName);
  } catch (err) {
    return handleRouteError(res, err);
  }
});

// Convert and download a layer file in a different format
const ALLOWED_CONVERT_FORMATS = new Set(['shapefile', 'laz', 'las', 'ply']);
app.get('/admin/layers/:id/convert', requireAdminAuth, conversionRateLimit, async (req, res) => {
  let tmpDir = null;
  try {
    const yamlText = await fs.readFile(configFilePath, 'utf8');
    const cfg = yaml.load(yamlText, { schema: yaml.CORE_SCHEMA });
    if (cfg?.ui?.admin_download === false) return res.status(403).json({ error: 'Downloads are disabled.' });
    if (cfg?.ui?.download_conversions === false) return res.status(403).json({ error: 'Format conversions are disabled.' });

    const format = req.query.format;
    if (!ALLOWED_CONVERT_FORMATS.has(format)) return res.status(400).json({ error: `Unsupported format: ${format}` });

    validateLayerId(req.params.id);
    const meta = await readLayerMeta(layersDir, req.params.id);
    const srcExt  = safeLayerExt(meta.extension);
    const srcPath = resolveInDir(layersDir, req.params.id, `${req.params.id}${srcExt}`);
    const baseName = path.parse(meta.originalName ?? req.params.id).name;

    tmpDir = path.join(os.tmpdir(), `s3d-convert-${crypto.randomUUID()}`);
    await fs.mkdir(tmpDir, { recursive: true });

    if (format === 'shapefile') {
      if (meta.fileType !== 'geojson') return res.status(400).json({ error: 'Shapefile conversion is only available for GeoJSON layers.' });
      const outZip = path.join(tmpDir, `${baseName}.zip`);
      await new Promise((resolve, reject) => {
        execFile('ogr2ogr', ['-f', 'ESRI Shapefile', `/vsizip/${outZip}`, srcPath], (err) => {
          if (err) reject(new Error(`ogr2ogr failed: ${err.message}`));
          else resolve();
        });
      });
      res.download(outZip, `${baseName}.zip`, () => fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {}));
    } else {
      // LAZ / LAS / PLY — PDAL translate
      if (meta.fileType !== 'pointcloud') return res.status(400).json({ error: 'This conversion is only available for point cloud layers.' });
      const outFile = path.join(tmpDir, `${baseName}.${format}`);
      await new Promise((resolve, reject) => {
        execFile('pdal', ['translate', srcPath, outFile], (err) => {
          if (err) reject(new Error(`pdal failed: ${err.message}`));
          else resolve();
        });
      });
      res.download(outFile, `${baseName}.${format}`, () => fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {}));
    }
  } catch (err) {
    if (tmpDir) fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    return handleRouteError(res, err);
  }
});

// Serve static data files
// Compression is intentionally disabled for /data: gzip encoding destroys the
// byte offsets that HTTP range requests rely on, breaking geotiff.js tile reads
// (it issues Range: bytes= requests to stream individual tiles from COG files).
app.use('/data', dataRateLimit, (req, res, next) => {
  res.set('Cache-Control', isDevelopment ? 'no-store' : 'public, max-age=86400');
  // Tell clients (and geotiff.js) that we support byte-range requests.
  res.set('Accept-Ranges', 'bytes');
  // Disable the compression middleware for this sub-tree.
  res.set('Content-Encoding', 'identity');
  next();
}, express.static(path.join(__dirname, config.dataPath), {
  maxAge: 0,      // controlled by the Cache-Control header above
  etag: true,
  lastModified: true,
  acceptRanges: true,
}));

// 404 handler
const SILENT_404_PATHS = new Set(['/favicon.ico', '/robots.txt', '/sitemap.xml']);
app.use((req, res) => {
  if (SILENT_404_PATHS.has(req.path)) {
    logger.debug(`404 Not Found: ${req.method} ${req.path}`);
  } else {
    logger.warn(`404 Not Found: ${req.method} ${req.path}`);
  }
  res.status(404).json({ error: 'Not Found' });
});

// Error handler
app.use((err, req, res, next) => {
  logger.error('Server error:', err.message);
  
  res.status(err.status || 500).json({
    error: isDevelopment ? err.message : 'Internal Server Error',
  });
});

// Ensure a default config.yaml exists so the client can always start cleanly
const DEFAULT_CONFIG_YAML = `# Stratum3D map configuration
# Edit via the Admin panel or directly in this file.

view:
  center: [0, 0]
  zoom: 4
  minZoom: 0
  maxZoom: 20

# Coordinate reference system used by the map.
# Common values: "EPSG:4326" (WGS84), "EPSG:3031" (Antarctic), "EPSG:3413" (Arctic)
crs: "EPSG:4326"

# Show the OpenStreetMap base layer
osm_background: true

# Additional basemap tile layers (optional)
basemaps: []

# Data layers added via the Admin panel will appear here
data_layers: []

ui:
  map_access: true
  map_download: true
  map_upload: true
  viewer_access: true
  viewer_download: true
  viewer_upload: true
  admin_download: true
  download_conversions: true
`;

try {
  await fs.access(configFilePath);
} catch {
  await fs.writeFile(configFilePath, DEFAULT_CONFIG_YAML, 'utf8');
  logger.info('No config.yaml found — created a default one at', configFilePath);
}

// Warn about orphaned data at startup
try {
  const orphans = await scanOrphans(layersDir, configFilePath);
  if (orphans.unreferencedLayers.length)
    logger.warn(`Found ${orphans.unreferencedLayers.length} unreferenced layer(s) on disk — visit Admin → Maintenance to review.`);
  if (orphans.staleConfigRefs.length)
    logger.warn(`Found ${orphans.staleConfigRefs.length} stale config reference(s) — visit Admin → Maintenance to fix.`);
  if (orphans.brokenLinks.length)
    logger.warn(`Found broken cross-layer links in ${orphans.brokenLinks.length} layer(s) — visit Admin → Maintenance to fix.`);
} catch { /* non-fatal */ }

// Start server
app.listen(config.port, config.host, () => {
  logger.info('================================================');
  logger.info(`Server is running in ${config.nodeEnv} mode`);
  logger.info(`Listening on http://${config.host}:${config.port}`);
  logger.info(`Data directory: ${config.dataPath}`);
  logger.info(`CORS origins: ${config.corsOrigins.join(', ')}`);
  logger.info('================================================');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, closing server gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, closing server gracefully...');
  process.exit(0);
});
