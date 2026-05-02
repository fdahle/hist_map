// Hypsometric tint for DEM terrain: elevation fraction t ∈ [0,1] → {r,g,b} ∈ [0,1]
export function demElevationColor(t) {
  const stops = [
    { t: 0.00, r: 0.13, g: 0.55, b: 0.13 }, // forest green
    { t: 0.30, r: 0.56, g: 0.73, b: 0.25 }, // yellow-green
    { t: 0.55, r: 0.80, g: 0.70, b: 0.20 }, // sandy yellow
    { t: 0.75, r: 0.65, g: 0.48, b: 0.28 }, // brown
    { t: 0.90, r: 0.78, g: 0.78, b: 0.78 }, // light gray
    { t: 1.00, r: 1.00, g: 1.00, b: 1.00 }, // white peaks
  ];
  let lo = stops[0], hi = stops[stops.length - 1];
  for (let i = 0; i < stops.length - 1; i++) {
    if (t >= stops[i].t && t <= stops[i + 1].t) { lo = stops[i]; hi = stops[i + 1]; break; }
  }
  const f = lo.t === hi.t ? 0 : (t - lo.t) / (hi.t - lo.t);
  return {
    r: lo.r + (hi.r - lo.r) * f,
    g: lo.g + (hi.g - lo.g) * f,
    b: lo.b + (hi.b - lo.b) * f,
  };
}

// Jet colormap for point cloud elevation: t ∈ [0,1] → blue (low) → cyan → green → yellow → red (high)
// Much more perceptually distinct than hypsometric for point cloud data.
export function pointCloudElevationColor(t) {
  const r = Math.max(0, Math.min(1, 1.5 - Math.abs(4 * t - 3)));
  const g = Math.max(0, Math.min(1, 1.5 - Math.abs(4 * t - 2)));
  const b = Math.max(0, Math.min(1, 1.5 - Math.abs(4 * t - 1)));
  return { r, g, b };
}
