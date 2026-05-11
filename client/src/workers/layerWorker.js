// Number of GeoJSON features per streamed chunk. Larger = fewer messages and
// fewer R-tree rebuilds on the main thread, but longer per-chunk parse time.
// 10 000 balances progressive rendering with spatial-index build efficiency.
const CHUNK_SIZE = 10000;

self.onmessage = async (e) => {
  const { url, layerId, layerName, featureCount, debug } = e.data;

  const log = (msg, ...args) => {
    if (debug) console.debug("[Worker - %s] %s", layerName, msg, ...args);
  };

  try {
    log(`Fetching from: ${url}`);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const contentLength = response.headers.get("Content-Length");
    const total = contentLength ? parseInt(contentLength, 10) : 0;
    log(`File size: ${total ? (total / 1024).toFixed(1) + " KB" : "Unknown"}`);

    if (url.endsWith('.geojsonl')) {
      await loadNdjsonStreaming({ url, layerId, layerName, featureCount, debug, log, response, total });
    } else {
      await loadGeoJson({ url, layerId, layerName, debug, log, response, total });
    }

  } catch (error) {
    if (debug) console.debug("[Worker - %s] Failed:", layerName, error);
    self.postMessage({ type: "ERROR", layerId, error: error.message });
  }
};

// ── NDJSON streaming path ─────────────────────────────────────────────────────
// Parses and posts features to the main thread as bytes arrive, so the first
// features render before the full file has downloaded.
async function loadNdjsonStreaming({ layerId, layerName, featureCount, debug, log, response, total }) {
  const reader  = response.body.getReader();
  const decoder = new TextDecoder('utf-8');

  let loaded         = 0;
  let buffer         = '';
  let headerParsed   = false;
  let dataProjection = null;
  let extraMetadata  = {};
  let pending        = [];   // features accumulated since last CHUNK post
  let featuresPosted = 0;
  let isFirstChunk   = true;

  const flushChunk = async (force = false) => {
    if (pending.length === 0 && !force) return;
    self.postMessage({
      type: "CHUNK",
      layerId,
      isFirst: isFirstChunk,
      dataProjection,
      geojsonChunk: { type: "FeatureCollection", features: pending },
    });
    featuresPosted += pending.length;
    if (featureCount > 0) {
      // Cap at 99 — 100 is sent only when COMPLETE fires.
      self.postMessage({ type: "PROGRESS", layerId, progress: Math.min(99, Math.round((featuresPosted / featureCount) * 100)) });
    }
    pending      = [];
    isFirstChunk = false;
    // Yield so the main thread can render the just-posted features.
    await new Promise(r => setTimeout(r, 0));
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    loaded += value.length;
    // Only use byte-based progress when feature count is unknown.
    if (featureCount == null && total > 0) {
      self.postMessage({ type: "PROGRESS", layerId, progress: Math.round((loaded / total) * 100) });
    } else if (featureCount == null) {
      self.postMessage({ type: "PROGRESS", layerId, progress: 50 });
    }

    // stream:true keeps multi-byte UTF-8 chars intact across network boundaries
    buffer += decoder.decode(value, { stream: true });

    let newlineIdx;
    while ((newlineIdx = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, newlineIdx).trim();
      buffer = buffer.slice(newlineIdx + 1);
      if (!line) continue;

      if (!headerParsed) {
        try {
          const header = JSON.parse(line);
          if (header._crs) {
            const m = header._crs.match(/EPSG:(\d+)/i);
            if (m) dataProjection = `EPSG:${m[1]}`;
          }
          extraMetadata = header._metadata ?? {};
        } catch { /* malformed header — continue without CRS */ }
        headerParsed = true;
        continue;
      }

      try {
        pending.push(JSON.parse(line));
      } catch {
        if (debug) console.debug(`[Worker - ${layerName}] Skipping malformed line`);
        continue;
      }

      if (pending.length >= CHUNK_SIZE) await flushChunk();
    }
  }

  // Flush remaining features (or empty chunk to initialise the layer).
  await flushChunk(/* force = */ true);

  if (debug) {
    console.debug(`=== LAYER DEBUG — ${layerName} ===`);
    console.debug("  Format: streaming NDJSON (.geojsonl)");
    console.debug("  Resolved dataProjection:", dataProjection ?? "null → OL will default to EPSG:4326");
  }

  self.postMessage({ type: "COMPLETE", layerId, metadata: extraMetadata });
}

// ── Regular GeoJSON path (unchanged) ─────────────────────────────────────────
async function loadGeoJson({ url, layerId, layerName, debug, log, response, total }) {
  const reader = response.body.getReader();
  let loaded = 0;
  const chunks = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;
    if (total > 0) {
      self.postMessage({ type: "PROGRESS", layerId, progress: Math.round((loaded / total) * 100) });
    } else {
      self.postMessage({ type: "PROGRESS", layerId, progress: 50 });
    }
  }

  log("Download complete. Stitching chunks...");
  const allChunks = new Uint8Array(loaded);
  let position = 0;
  for (const chunk of chunks) {
    allChunks.set(chunk, position);
    position += chunk.length;
  }

  log("Parsing...");
  const text    = new TextDecoder("utf-8").decode(allChunks);
  const geojson = JSON.parse(text);

  let dataProjection = null;
  // Extract the data CRS from the GeoJSON's top-level "crs" property.
  // Many datasets (e.g. QGIS exports) embed a CRS like EPSG:3031. If
  // present, the main thread must use it as dataProjection so OpenLayers
  // doesn't incorrectly assume EPSG:4326.
  if (geojson.crs?.properties?.name) {
    const urn   = geojson.crs.properties.name;
    // Handles "urn:ogc:def:crs:EPSG::3031", "EPSG:3031", and
    // "http://www.opengis.net/def/crs/EPSG/0/3031" formats.
    const match = urn.match(/EPSG:{1,2}(\d+)/) ?? urn.match(/\/EPSG\/\d+\/(\d+)/i);
    if (match) dataProjection = `EPSG:${match[1]}`;
  }

  const featuresList  = geojson.features ?? [];
  const extraMetadata = geojson._metadata ?? {};

  log(`Detected data CRS: ${dataProjection ?? "EPSG:4326 (default)"}`);

  if (debug) {
    console.debug(`=== LAYER DEBUG — ${layerName} ===`);
    console.debug("  Format: GeoJSON (.geojson)");
    console.debug("  Resolved dataProjection:", dataProjection ?? "null → OL will default to EPSG:4326");
    console.debug("  Feature count:", featuresList.length);
    if (featuresList.length > 0) {
      const sample = featuresList[0]?.geometry?.coordinates;
      console.debug("  First feature coords (raw):", JSON.stringify(sample)?.slice(0, 120));
    }
  }

  const totalChunks = Math.max(1, Math.ceil(featuresList.length / CHUNK_SIZE));

  // Stream features to the main thread one chunk at a time.
  // Each postMessage becomes a separate task in the main thread's event queue,
  // so the browser can repaint between chunks (progressive rendering).
  for (let i = 0; i < featuresList.length; i += CHUNK_SIZE) {
    self.postMessage({
      type: "CHUNK",
      layerId,
      chunkIndex: Math.floor(i / CHUNK_SIZE),
      totalChunks,
      isFirst: i === 0,
      dataProjection,
      geojsonChunk: {
        type: "FeatureCollection",
        features: featuresList.slice(i, i + CHUNK_SIZE),
      },
    });
    // Yield to keep the worker's own event loop responsive and avoid
    // flooding the main thread's message queue all at once.
    await new Promise((r) => setTimeout(r, 0));
  }

  // Edge case: source has no features — still need to initialise the layer.
  if (featuresList.length === 0) {
    self.postMessage({
      type: "CHUNK",
      layerId,
      chunkIndex: 0,
      totalChunks: 1,
      isFirst: true,
      dataProjection,
      geojsonChunk: { type: "FeatureCollection", features: [] },
    });
  }

  self.postMessage({ type: "COMPLETE", layerId, metadata: extraMetadata });
}
