/**
 * Sample numSamples+1 evenly-spaced points along a polyline defined by coords.
 * @param {number[][]} coords - Array of [x, y] coordinate pairs
 * @param {number} numSamples - Number of intervals (returns numSamples+1 points)
 * @returns {number[][]}
 */
export function sampleLinePoints(coords, numSamples) {
  if (coords.length < 2) return coords.slice();
  const segs = [];
  let totalLen = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    const dx = coords[i + 1][0] - coords[i][0];
    const dy = coords[i + 1][1] - coords[i][1];
    const len = Math.sqrt(dx * dx + dy * dy);
    segs.push({ s: coords[i], e: coords[i + 1], cumLen: totalLen, len });
    totalLen += len;
  }
  if (totalLen === 0) return [coords[0]];
  const pts = [];
  for (let i = 0; i <= numSamples; i++) {
    const t = (i / numSamples) * totalLen;
    let seg = segs[segs.length - 1];
    for (const s of segs) {
      if (s.cumLen + s.len >= t - 1e-10) { seg = s; break; }
    }
    const u = seg.len > 0 ? Math.min(1, (t - seg.cumLen) / seg.len) : 0;
    pts.push([seg.s[0] + u * (seg.e[0] - seg.s[0]), seg.s[1] + u * (seg.e[1] - seg.s[1])]);
  }
  return pts;
}

/**
 * Bilinear interpolation on a flat raster array.
 * Falls back to nearest-neighbour if any of the four neighbours is NaN,
 * so nodata border pixels don't bleed into valid samples.
 * @param {Float64Array} data - Flat row-major raster data
 * @param {number} w - Raster width in pixels
 * @param {number} h - Raster height in pixels
 * @param {number} fx - Fractional column index
 * @param {number} fy - Fractional row index
 * @returns {number} Interpolated value, or NaN if out of range
 */
export function bilinear(data, w, h, fx, fy) {
  // Clamp to the valid pixel centre range so edge samples don't extrapolate.
  const fxc = Math.max(0, Math.min(w - 1, fx));
  const fyc = Math.max(0, Math.min(h - 1, fy));
  const x0 = Math.floor(fxc);
  const x1 = Math.min(w - 1, x0 + 1);
  const y0 = Math.floor(fyc);
  const y1 = Math.min(h - 1, y0 + 1);
  const wx = fxc - x0, wy = fyc - y0;
  const vs = [data[y0 * w + x0], data[y0 * w + x1], data[y1 * w + x0], data[y1 * w + x1]];
  // If any bilinear neighbour is nodata (NaN), fall back to nearest-neighbour.
  if (vs.some(v => !isFinite(v))) {
    const nn = data[Math.round(fyc) * w + Math.round(fxc)];
    return isFinite(nn) ? nn : NaN;
  }
  return vs[0] * (1 - wx) * (1 - wy) + vs[1] * wx * (1 - wy) + vs[2] * (1 - wx) * wy + vs[3] * wx * wy;
}
