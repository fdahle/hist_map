self.onmessage = async (e) => {
  const { url, layerId, layerName, debug } = e.data;

  // Helper for conditional logging
  const log = (msg, ...args) => {
    if (debug) console.debug(`[Worker - ${layerName}] ${msg}`, ...args);
  };

  try {
    log(`Fetching from: ${url}`);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const contentLength = response.headers.get("Content-Length");
    const total = contentLength ? parseInt(contentLength, 10) : 0;
    log(`File size: ${total ? (total / 1024).toFixed(1) + ' KB' : 'Unknown'}`);

    const reader = response.body.getReader();

    let loaded = 0;
    const chunks = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      chunks.push(value);
      loaded += value.length;

      if (total > 0) {
        const progress = Math.round((loaded / total) * 100);
        self.postMessage({ type: 'PROGRESS', layerId, progress });
      } else {
        self.postMessage({ type: 'PROGRESS', layerId, progress: 50 }); 
      }
    }

    log("Download complete. Stitching chunks...");

    // Stitch chunks
    const allChunks = new Uint8Array(loaded);
    let position = 0;
    for (const chunk of chunks) {
      allChunks.set(chunk, position);
      position += chunk.length;
    }

    log("Parsing JSON...");
    const startParse = performance.now();
    
    // Parse JSON
    const geojson = JSON.parse(new TextDecoder("utf-8").decode(allChunks));
    
    const endParse = performance.now();
    log(`JSON Parsed in ${(endParse - startParse).toFixed(0)}ms`);

    // Send the result back
    self.postMessage({ type: 'SUCCESS', layerId, data: geojson });

  } catch (error) {
    if (debug) console.debug(`[Worker - ${layerName}] Failed:`, error);
    self.postMessage({ type: 'ERROR', layerId, error: error.message });
  }
};