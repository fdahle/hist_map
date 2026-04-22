export function csvDetectDelimiter(firstLine) {
  const candidates = [',', ';', '\t', '|'];
  let best = ',', bestCount = 0;
  for (const d of candidates) {
    let count = 0, inQ = false;
    for (const c of firstLine) {
      if (c === '"') inQ = !inQ;
      else if (!inQ && c === d) count++;
    }
    if (count > bestCount) { bestCount = count; best = d; }
  }
  return best;
}

export function parseCsvRow(line, delimiter) {
  const cols = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if (c === delimiter && !inQ) {
      cols.push(cur); cur = '';
    } else {
      cur += c;
    }
  }
  cols.push(cur);
  return cols;
}

export function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return { headers: [], rows: [] };
  const delimiter = csvDetectDelimiter(lines[0]);
  const headers = parseCsvRow(lines[0], delimiter).map((h) => h.trim());
  const rows = lines.slice(1).map((line) => {
    const vals = parseCsvRow(line, delimiter);
    const obj = {};
    headers.forEach((h, i) => { obj[h] = vals[i]?.trim() ?? ''; });
    return obj;
  });
  return { headers, rows };
}

// Longest/most-specific patterns first so 'longitude' beats bare 'x'.
const X_PATTERNS = ['longitude', 'long', 'lon', 'lng', 'easting', 'east', 'x'];
const Y_PATTERNS = ['latitude', 'lat', 'northing', 'north', 'y'];

export function detectGeomColumns(headers) {
  const lower = headers.map((h) => h.toLowerCase().trim());
  const xIdx = X_PATTERNS.reduce((found, p) => found >= 0 ? found : lower.indexOf(p), -1);
  const yIdx = Y_PATTERNS.reduce((found, p) => found >= 0 ? found : lower.indexOf(p), -1);
  return {
    xCol: xIdx >= 0 ? headers[xIdx] : null,
    yCol: yIdx >= 0 ? headers[yIdx] : null,
    confident: xIdx >= 0 && yIdx >= 0,
  };
}

export function csvToGeoJson(rows, xCol, yCol, crs) {
  const features = [];
  for (const row of rows) {
    const x = parseFloat(row[xCol]);
    const y = parseFloat(row[yCol]);
    if (!isFinite(x) || !isFinite(y)) continue;
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [x, y] },
      properties: { ...row },
    });
  }
  const geojson = { type: 'FeatureCollection', features };
  // Embed non-default CRS so the layer worker can reproject correctly.
  if (crs && crs !== 'EPSG:4326') {
    geojson.crs = { type: 'name', properties: { name: crs } };
  }
  return geojson;
}
