# Stratum3D — SfM-Specific Feature Plan

## Context
Stratum3D is a SfM results sharing platform with solid foundations (2D map, 3D viewer, admin panel,
elevation profiles, measurement). The following features are the SfM-specific gaps most valuable to fill:

2. **Contour Lines** — generate contour GeoJSON from a GeoTIFF DEM via GDAL
3. **Hillshade** — generate hillshade GeoTIFF overlay via GDAL
4. **Camera Positions Layer** — render CSV/GeoJSON camera points with a camera icon
5. **GCP Display with Residuals** — color-by-property gradient styling for accuracy visualization

---

## Feature 2: Contour Lines

### What it does
Admin clicks "Generate Contours" on a GeoTIFF layer → server runs `gdal_contour` → a new GeoJSON
layer is saved and added to the config.

### New files
- `server/processors/demDerivativesProcessor.js` — houses both contour and hillshade logic

### Files to modify
| File | Change |
|---|---|
| `server/index.js` | Add `POST /admin/layers/:id/contours` endpoint |
| `client/src/components/admin/DataLayersSection.vue` | "Generate Contours" button in the GeoTIFF edit panel |

### Server: demDerivativesProcessor.js

```javascript
import { execFileAsync } from './geotiffProcessor.js';  // re-export execFileAsync or re-import
import { randomUUID } from 'crypto';
import fs from 'fs/promises';
import path from 'path';

export async function generateContours(inputTifPath, outputDir, options = {}) {
  const { interval = 1.0, attributeName = 'elevation', nodata } = options;
  const outId = randomUUID();
  const outPath = path.join(outputDir, `${outId}.geojson`);

  const args = [
    '-f', 'GeoJSON',
    '-i', String(interval),
    '-a', attributeName,
    ...(nodata != null ? ['-snodata', String(nodata)] : []),
    inputTifPath,
    outPath,
  ];

  await execFileAsync('gdal_contour', args);
  return outPath;
}
```

### Server endpoint (server/index.js)
```
POST /admin/layers/:id/contours
Body: { interval: number }
Auth: requireAdmin

1. Look up layer by id — must be type 'geotiff'
2. Call generateContours(tifPath, layersDir, { interval, nodata: layer.noDataValue })
3. Register new GeoJSON layer in config:
   name: `${sourceName} Contours (${interval}m)`
   type: geojson
   url: /data/layers/<newId>.geojson
4. Return { success: true, layerId: newId }
```

### Admin UI (DataLayersSection.vue)
Add inside the GeoTIFF layer edit panel (alongside "Generate Hillshade" below):
```html
<button @click="generateContours(layer.id)">Generate Contours</button>
<!-- Small input for interval (default 1.0) shown inline -->
```
Show spinner while generating, then refresh layer list.

---

## Feature 3: Hillshade

### What it does
Admin clicks "Generate Hillshade" on a GeoTIFF layer → server runs `gdaldem hillshade` → a new
GeoTIFF is saved and added as a semi-transparent grayscale overlay layer.

### New files
None (add to `server/processors/demDerivativesProcessor.js` created in Feature 2)

### Files to modify
| File | Change |
|---|---|
| `server/index.js` | Add `POST /admin/layers/:id/hillshade` endpoint |
| `client/src/components/admin/DataLayersSection.vue` | "Generate Hillshade" button in GeoTIFF edit panel |

### Server: demDerivativesProcessor.js (addition)

```javascript
export async function generateHillshade(inputTifPath, outputDir, options = {}) {
  const { azimuth = 315, altitude = 45 } = options;
  const outId = randomUUID();
  const outPath = path.join(outputDir, `${outId}_hillshade.tif`);

  const args = [
    inputTifPath,
    outPath,
    'hillshade',
    '-az', String(azimuth),
    '-alt', String(altitude),
    '-of', 'GTiff',
    '-co', 'COMPRESS=LZW',
  ];

  await execFileAsync('gdaldem', args);
  // Then COG-convert for streaming:
  await convertToCog(outPath, { compression: 'lzw' });
  return outPath;
}
```

### Server endpoint
```
POST /admin/layers/:id/hillshade
Body: { azimuth?: number, altitude?: number }
Auth: requireAdmin

1. Look up layer (must be geotiff, bands === 1)
2. generateHillshade(tifPath, layersDir, { azimuth, altitude })
3. Register new GeoTIFF layer:
   name: `${sourceName} Hillshade`
   type: geotiff
   opacity: 0.6
   colormap: 'grayscale'
4. Return { success: true, layerId: newId }
```

### Admin UI
Same GeoTIFF edit panel — add "Generate Hillshade" button (no extra inputs needed, defaults are fine).

---

## Feature 4: Camera Positions Layer

### What it does
User uploads a CSV with camera positions (longitude, latitude + optional fields like name, altitude,
yaw, pitch). The layer displays each camera as a camera-icon pin. The existing CSV→GeoJSON
pipeline is reused with no server changes.

### Files to modify
| File | Change |
|---|---|
| `client/src/utils/styleFactory.js` | Add `createCameraStyle(color)` function using SVG camera icon |
| `client/src/utils/styleFactory.js` | Add `pointType` dispatch to `buildLayerSharedStyle` and `applyFeatureStyle` |
| `client/src/components/modals/admin/LayerEditorModal.vue` | Add `camera` and `crosshair` to the pointType `<select>` |
| `client/src/constants/icons.js` | Add `getCameraIcon(color)` and `getCrosshairIcon(color)` SVG strings |

### styleFactory.js changes

```javascript
// In buildLayerSharedStyle — add pointType parameter:
export function buildLayerSharedStyle(baseColor, strokeColor, fillColor, geomType, pointType) {
  if (geomType === GEOMETRY_TYPE.POINT || geomType === GEOMETRY_TYPE.MULTI_POINT) {
    const color = (strokeColor && strokeColor !== 'none') ? strokeColor : baseColor || DEFAULT_COLOR;
    if (pointType === 'camera')    return createCameraStyle(color);
    if (pointType === 'crosshair') return createCrosshairStyle(color);
    if (pointType === 'circle')    return createCircleStyle(color);
    if (pointType === 'square')    return createSquareStyle(color);
    return createPinStyle(color);  // default
  }
  return createVectorStyle(strokeColor || baseColor, fillColor);
}
```

Callers of `buildLayerSharedStyle` are in `useGeoJsonLoader.js` and `useLayerStyling.js` — pass
`layerConf.pointType` through.

### Camera SVG icon (icons.js)
Simple camera outline: body rectangle + lens circle + flash bump. Anchor at [0.5, 0.5] (center,
not bottom like pin). Size ~24×24px. Color injected into `fill` attribute.

### Admin UI
In `LayerEditorModal.vue` line 202–206, add two more `<option>` entries:
```html
<option value="camera">camera</option>
<option value="crosshair">crosshair (GCP)</option>
```

### No server changes needed
CSV files are already converted to GeoJSON points by the existing `_processCsvLayer` pipeline.
The user just uploads their camera CSV, the server stores it as GeoJSON, and they set
`pointType = camera` in the admin layer editor.

---

## Feature 5: GCP Display with Residuals

### What it does
A new `color_by` config field on GeoJSON layers enables continuous gradient coloring of point
features based on a numeric property (e.g., a `residual_m` column). Points are colored along a
spectrum (green→yellow→red) scaled between a min and max value the user configures.

### Files to modify
| File | Change |
|---|---|
| `client/src/utils/styleFactory.js` | Add `buildColorByStyleFunction(colorBy)` |
| `client/src/utils/styleFactory.js` | Export `interpolateColorRamp(t, colormap)` |
| `client/src/composables/useGeoJsonLoader.js` | If `layerConf.color_by` exists, use `buildColorByStyleFunction` as the layer style function |
| `client/src/components/modals/admin/LayerEditorModal.vue` | Add "Color by property" section for GeoJSON layers |
| `client/src/constants/configSchema.js` | Add `color_by` to geojson optional fields |

### styleFactory.js: buildColorByStyleFunction

```javascript
// colormaps available: same COLORMAPS constant used for GeoTIFF (RdYlGn, viridis, etc.)
export function buildColorByStyleFunction(colorBy) {
  // colorBy = { property: 'residual_m', min: 0, max: 0.1, colormap: 'RdYlGn', inverted: false }
  return (feature) => {
    const val = Number(feature.get(colorBy.property));
    if (isNaN(val)) return createPinStyle('#888888');
    const t = Math.max(0, Math.min(1, (val - colorBy.min) / (colorBy.max - colorBy.min)));
    const normalized = colorBy.inverted ? 1 - t : t;
    const hex = interpolateColorRamp(normalized, colorBy.colormap);
    return createPinStyle(hex);
  };
}
```

The `interpolateColorRamp` function mirrors what `buildColormapStyle` does for WebGL but in JS:
look up the COLORMAPS stop list, lerp between adjacent stops, return a hex color.

### useGeoJsonLoader.js
After loading features, check `layerConf.color_by`:
- If set: apply `buildColorByStyleFunction` as the OpenLayers layer `style` function
- If not set: use existing `buildLayerSharedStyle` as before

### Admin UI: "Color by property" section (LayerEditorModal.vue)
Add a collapsible section below the existing style fields for GeoJSON Point layers:
```
[ ] Color by property
    Property name: [residual_m      ]
    Min value:     [0.00            ]
    Max value:     [0.10            ]
    Color ramp:    [RdYlGn ▾]  [x] Invert
```
Encode as `draft.color_by = { property, min, max, colormap, inverted }` — serialize to config on save.

---

## Implementation Order

1. **Camera Positions** (Feature 4) — smallest scope, purely client-side styling
2. **GCP Color-by** (Feature 5) — builds on #4 infrastructure
3. **Contours + Hillshade** (Features 2+3) — share one new server file, do together
4. **Volume Calculation** (Feature 1) — largest, but isolated composable + modal

---

## Verification

| Feature | How to test |
|---|---|
| Volume | Admin: upload a DEM GeoTIFF. Map: Tools → Volume, select DEM, draw polygon over terrain, set baseline = min → confirm cut/fill volumes are non-zero and sum to area × average delta |
| Contours | Admin: GeoTIFF layer → Generate Contours (interval=1) → new GeoJSON layer appears in layer list → visible as lines on map |
| Hillshade | Admin: GeoTIFF layer → Generate Hillshade → new semi-transparent grayscale layer overlays terrain |
| Camera icons | Admin: upload camera CSV (lon/lat/name columns) → set pointType=camera → map shows camera icons |
| GCP residuals | Admin: upload GCP CSV with residual_m column → set color_by.property=residual_m, min=0, max=0.1, colormap=RdYlGn → map shows green→red gradient |

---

## Key Existing Code to Reuse

| Need | Reuse from |
|---|---|
| GeoTIFF loading | `useElevationProfile.js` — `fromBlob`/`fromUrl`, `readRasters`, nodata check |
| Raster sampling | `elevationSampling.js` — `sampleLinePoints`, `bilinear` |
| Polygon draw interaction | `useMeasurementMode.js` — Draw (Polygon), drawstart/drawend pattern |
| Modal drag | `useModalDrag.js` |
| GDAL subprocess | `geotiffProcessor.js` — `execFileAsync` pattern, `isGdalAvailable()` check |
| Colormap stop lists | `client/src/constants/colormaps.js` (or wherever COLORMAPS is defined) |
| Pin icon factory | `styleFactory.js` — `createPinStyle(color)` |
| Layer type dispatch | `layerFactory.js` — `createGeoJSONLayerConfig` |
