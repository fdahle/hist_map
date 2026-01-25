self.onmessage = async (e) => {
  const { url, layerName } = e.data;

  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const contentLength = response.headers.get("Content-Length");
    const total = parseInt(contentLength, 10);
    const reader = response.body.getReader();

    let loaded = 0;
    const chunks = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      chunks.push(value);
      loaded += value.length;

      if (total) {
        // Post progress back to main thread
        const progress = Math.round((loaded / total) * 100);
        self.postMessage({ type: 'PROGRESS', layerName, progress });
      }
    }

    // Stitch chunks
    const allChunks = new Uint8Array(loaded);
    let position = 0;
    for (const chunk of chunks) {
      allChunks.set(chunk, position);
      position += chunk.length;
    }

    // Parse JSON (This is the heavy part!)
    const geojson = JSON.parse(new TextDecoder("utf-8").decode(allChunks));

    // Send the result back
    self.postMessage({ type: 'SUCCESS', layerName, data: geojson });

  } catch (error) {
    self.postMessage({ type: 'ERROR', layerName, error: error.message });
  }
};