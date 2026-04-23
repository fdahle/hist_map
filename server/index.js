/**
 * Express server for serving geospatial data
 * Provides static file serving with CORS support and proper error handling
 */
import 'dotenv/config';   // loads server/.env before anything else
import express from 'express';
import path from 'path';
import fs from 'fs/promises';
import { statfs as statfsCallback } from 'fs';
import { promisify } from 'util';
import crypto from 'crypto';
import cors from 'cors';
const statfsAsync = promisify(statfsCallback);
import compression from 'compression';
import helmet from 'helmet';
import yaml from 'js-yaml';
import multer from 'multer';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { fileURLToPath } from 'url';
import config, { isDevelopment, isProduction } from './src/config.js';
import logger from './src/logger.js';
import { listLayers, readLayerMeta, writeLayerMeta, deleteLayer, metaToConfigLayer, validateLayerId, resolveInDir, safeLayerExt } from './src/layerStore.js';
import { jobQueue } from './src/jobQueue.js';
import { processUploadBatch, addSubFile, addSubFileBatch, classifyExt, relinkGeojson, applyCsvLink, parseGeoFile, serializeGeoFile } from './processors/uploadProcessor.js';
import { convertToCog, isGdalAvailable } from './processors/geotiffProcessor.js';
import { convertToCopc, isPdalAvailable } from './processors/pointcloudProcessor.js';

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
function requireAdminAuth(req, res, next) {
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
  // bcrypt.compare is timing-safe and handles both hash format validation and comparison.
  bcrypt.compare(password, hash)
    .then(match => {
      if (!match) return res.status(403).json({ error: 'Invalid credentials' });
      next();
    })
    .catch(() => res.status(500).json({ error: 'Authentication error' }));
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

// Apply rate limits to route groups before any route handler is registered.
app.use('/admin', adminRateLimit);
app.use(['/config', '/viewer', '/health'], generalRateLimit);

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

// Change admin password — requires current credentials, updates .credentials file
app.post('/admin/change-password', authRateLimit, requireAdminAuth, express.json(), async (req, res) => {
  const { newPassword } = req.body ?? {};
  if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 8) {
    return res.status(400).json({ error: 'New password must be at least 8 characters.' });
  }
  try {
    const hash = await bcrypt.hash(newPassword, 12);
    await fs.writeFile(credentialsFilePath, hash, { mode: 0o600 });
    runtimeAdminPassword = hash;
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
  if (errors.length) return res.status(500).json({ error: errors.join('; ') });
  res.json({ success: true });
});

// ── Data directory ───────────────────────────────────────────────────────────
const dataDir   = path.join(__dirname, config.dataPath);
const layersDir = path.join(dataDir, 'layers');

// ── Multer setup ──────────────────────────────────────────────────────────────
const ALLOWED_UPLOAD_EXTS = new Set(['.geojson', '.json', '.tif', '.tiff', '.obj', '.ply', '.stl',
  '.las', '.laz', '.mtl', '.jpg', '.jpeg', '.png', '.bmp', '.tga', '.webp', '.csv']);

function makeUploadInstance() {
  return multer({
    storage: multer.memoryStorage(),
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
  let diskFreeBytes  = null;
  let diskTotalBytes = null;
  try {
    const st = await statfsAsync(dataDir);
    diskFreeBytes  = st.bavail * st.bsize;
    diskTotalBytes = st.blocks * st.bsize;
  } catch { /* statfs not available on this platform/Node version */ }
  res.json({ usedBytes, uploadLimitMb: config.uploadLimitMb, diskFreeBytes, diskTotalBytes });
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
    res.status(500).json({ error: err.message });
  }
});

// Get single layer meta
app.get('/admin/layers/:id', requireAdminAuth, async (req, res) => {
  try {
    validateLayerId(req.params.id);
    const meta = await readLayerMeta(layersDir, req.params.id);
    res.json(meta);
  } catch (err) {
    if (err.message.includes('not found')) return res.status(404).json({ error: err.message });
    res.status(400).json({ error: err.message });
  }
});

// Update layer config (display name, visibility, order, extra fields)
app.patch('/admin/layers/:id', requireAdminAuth, async (req, res) => {
  try {
    validateLayerId(req.params.id);
    const meta = await readLayerMeta(layersDir, req.params.id);
    const { displayName, visible, order, opacity, noDataValue, normalize, color, stroke_color, fill_color, attribution, search_fields, thumbnail_url, download_url, pointType, csvLink } = req.body ?? {};
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
    if (err.message.includes('not found')) return res.status(404).json({ error: err.message });
    res.status(400).json({ error: err.message });
  }
});

// Preview first N features of a GeoJSON layer (pandas.head-style)
app.get('/admin/layers/:id/preview', requireAdminAuth, async (req, res) => {
  try {
    validateLayerId(req.params.id);
    const meta = await readLayerMeta(layersDir, req.params.id);
    if (meta.fileType !== 'geojson') return res.status(400).json({ error: 'Preview only available for GeoJSON layers.' });
    const filePath = resolveInDir(layersDir, req.params.id, `${req.params.id}${safeLayerExt(meta.extension)}`);
    const raw = await fs.readFile(filePath, 'utf8');
    const geojson = JSON.parse(raw);
    const n = Math.min(parseInt(req.query.n ?? '5', 10), 50);
    const features = (geojson.features ?? []).slice(0, n);
    const columnSet = new Set();
    for (const f of features) {
      for (const k of Object.keys(f.properties ?? {})) columnSet.add(k);
    }
    // Filter out internal (_-prefixed) keys and URL-only columns
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
    res.json({ columns, rows, total: geojson.features?.length ?? 0 });
  } catch (err) {
    if (err.message?.includes('not found')) return res.status(404).json({ error: err.message });
    res.status(500).json({ error: isDevelopment ? err.message : 'Internal Server Error' });
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
    if (err.message.includes('not found')) return res.status(404).json({ error: err.message });
    res.status(400).json({ error: err.message });
  }
});

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
    if (err.message.includes('not found')) return res.status(404).json({ error: err.message });
    res.status(500).json({ error: isDevelopment ? err.message : 'Internal Server Error' });
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
    if (err.message.includes('not found')) return res.status(404).json({ error: err.message });
    res.status(500).json({ error: isDevelopment ? err.message : 'Internal Server Error' });
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
    // remove dangling references from feature properties
    if (meta.fileType === 'geojson' && (subFile.role === 'model' || subFile.role === 'pointcloud')) {
      const urlToRemove = `data/layers/${id}/${subFile.id}${subFile.extension}`;
      const geoExt  = safeLayerExt(meta.extension || '.geojson');
      const geoPath = resolveInDir(layerDir, `${id}${geoExt}`);
      try {
        const raw = await fs.readFile(geoPath, 'utf8');
        let features, header;
        const isNdjson = geoExt === '.geojsonl';
        if (isNdjson) {
          const lines = raw.split('\n').filter(Boolean);
          header   = lines.length > 0 ? JSON.parse(lines[0]) : {};
          features = lines.slice(1).map(l => JSON.parse(l));
        } else {
          const geojson = JSON.parse(raw);
          header   = { _metadata: geojson._metadata };
          features = geojson.features ?? [];
        }
        let modified = false;
        features = features.map(f => {
          if (!f.properties) return f;
          if (subFile.role === 'model' && Array.isArray(f.properties._model3dUrls)) {
            const prev = f.properties._model3dUrls.length;
            f.properties._model3dUrls = f.properties._model3dUrls.filter(u => u !== urlToRemove);
            if (f.properties._model3dUrls.length !== prev) modified = true;
          }
          if (subFile.role === 'pointcloud' && Array.isArray(f.properties._pointcloudUrls)) {
            const prev = f.properties._pointcloudUrls.length;
            f.properties._pointcloudUrls = f.properties._pointcloudUrls.filter(u => u !== urlToRemove);
            if (f.properties._pointcloudUrls.length !== prev) modified = true;
          }
          return f;
        });
        if (modified) {
          const md = header._metadata ?? {};
          md.has3DModels    = features.some(f => f.properties?._model3dUrls?.length > 0);
          md.hasPointClouds = features.some(f => f.properties?._pointcloudUrls?.length > 0);
          header._metadata  = md;
          if (isNdjson) {
            const body = features.map(f => JSON.stringify(f)).join('\n');
            await fs.writeFile(geoPath, `${JSON.stringify(header)}\n${body}`, 'utf8');
          } else {
            const fc = { type: 'FeatureCollection', features, _metadata: md };
            await fs.writeFile(geoPath, JSON.stringify(fc), 'utf8');
          }
        }
      } catch { /* GeoJSON read/write failure is non-fatal */ }
    }

    await writeLayerMeta(layersDir, id, meta);
    logger.info(`Deleted sub-file ${subId} from layer ${id}`);
    res.json({ success: true, deleted: subId });
  } catch (err) {
    if (err.message.includes('not found')) return res.status(404).json({ error: err.message });
    res.status(400).json({ error: err.message });
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
          meta.dataPath  = meta.dataPath.replace(/\.(las|laz)$/i, '.copc.laz');
          if (originalBackup) meta.originalBackup = originalBackup;
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
        meta.processingLog.push(`Optimisation error: ${err.message}`);
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

// Manually assign 3D sub-file assets to specific features by feature ID
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

    const ext = safeLayerExt(meta.extension || '.geojson');
    const filePath = resolveInDir(layersDir, id, `${id}${ext}`);
    const raw = await fs.readFile(filePath, 'utf8');
    const { features, header } = parseGeoFile(raw, filePath);

    let linkedCount = 0;
    let hasModels = false;
    let hasPcs = false;
    const updated = features.map((feature) => {
      if (!feature.properties) feature.properties = {};
      const fid = feature.properties._featureId;
      if (fid && Object.prototype.hasOwnProperty.call(assignments, fid)) {
        const assign = assignments[fid];
        feature.properties._model3dUrls    = Array.isArray(assign.models)      ? assign.models      : [];
        feature.properties._pointcloudUrls = Array.isArray(assign.pointclouds) ? assign.pointclouds : [];
        if (feature.properties._model3dUrls.length > 0)    hasModels = true;
        if (feature.properties._pointcloudUrls.length > 0) hasPcs    = true;
        if (feature.properties._model3dUrls.length + feature.properties._pointcloudUrls.length > 0) {
          linkedCount++;
        }
      }
      return feature;
    });

    // Keep metadata in sync so the client can detect 3D capability on reload
    const md = header._metadata ?? {};
    md.has3DModels    = hasModels;
    md.hasPointClouds = hasPcs;
    header._metadata  = md;

    await fs.writeFile(filePath, serializeGeoFile(updated, header, filePath), 'utf8');
    logger.info(`Layer link: ${id} — ${linkedCount} feature(s) with assets`);
    res.json({ success: true, layerId: id, linkedCount });
  } catch (err) {
    if (err.message.includes('not found')) return res.status(404).json({ error: err.message });
    logger.error('Layer link error:', err.message);
    res.status(500).json({ error: err.message });
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
    res.status(500).json({ error: isDevelopment ? err.message : 'Internal Server Error' });
  }
});

// Download the original file for a layer (if keepOriginal was set)
app.get('/admin/layers/:id/original', requireAdminAuth, async (req, res) => {
  try {
    validateLayerId(req.params.id);
    const meta = await readLayerMeta(layersDir, req.params.id);
    if (!meta.originalBackup) return res.status(404).json({ error: 'No original backup for this layer.' });
        if (!/^[a-zA-Z0-9._-]+$/.test(meta.originalBackup)) {
      return res.status(500).json({ error: 'Invalid backup filename in layer metadata.' });
    }
    const backupPath = resolveInDir(layersDir, req.params.id, path.basename(meta.originalBackup));
    res.download(backupPath, meta.originalName);
  } catch (err) {
    if (err.message.includes('not found')) return res.status(404).json({ error: err.message });
    res.status(500).json({ error: isDevelopment ? err.message : 'Internal Server Error' });
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
app.use((req, res) => {
  logger.warn(`404 Not Found: ${req.method} ${req.path}`);
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
  map_download: true
  map_upload: true
  viewer_download: true
  viewer_upload: true
  viewer_access: true
`;

try {
  await fs.access(configFilePath);
} catch {
  await fs.writeFile(configFilePath, DEFAULT_CONFIG_YAML, 'utf8');
  logger.info('No config.yaml found — created a default one at', configFilePath);
}

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
