# Utilities Documentation

This directory contains utility modules that provide common functionality throughout the application.

## Modules

### logger.js
Centralized logging system with environment-aware behavior.

**Key Features:**
- Log levels: error, warn, info, debug
- Automatic log level based on environment
- Consistent formatting with timestamps
- Context-based logging
- Performance timing

**Example:**
```javascript
import { logger } from '@/utils/logger';

logger.info('MyComponent', 'User logged in');
logger.error('MyComponent', 'Failed to save', error);

const endTimer = logger.time('MyComponent', 'Data processing');
// ... do work ...
endTimer();
```

### errorHandler.js
Centralized error handling with custom error types.

**Key Features:**
- Custom AppError class
- Standard error types
- User-friendly error messages
- Retry logic with exponential backoff
- Error wrapping utilities

**Example:**
```javascript
import { handleError, AppError, ErrorType, retryWithBackoff } from '@/utils/errorHandler';

// Wrap errors
try {
  await riskyOperation();
} catch (error) {
  throw handleError(error, 'MyComponent');
}

// Create custom errors
throw new AppError('Invalid input', ErrorType.VALIDATION);

// Retry operations
const data = await retryWithBackoff(() => fetchData(), 3);
```

### http.js
HTTP client utilities with built-in error handling.

**Key Features:**
- GET/POST helpers
- Automatic error handling
- Progress tracking for downloads
- Retry logic
- JSON/text fetching

**Example:**
```javascript
import { get, fetchWithProgress } from '@/utils/http';

// Simple GET
const data = await get('/api/data');

// With progress tracking
const buffer = await fetchWithProgress('/data/large-file.bin', (loaded, total) => {
  console.log(`Progress: ${(loaded / total * 100).toFixed(0)}%`);
});
```

### config.js
Environment configuration helper.

**Key Features:**
- Type-safe environment variable access (`getEnvVar`, `getEnvBool`, `getEnvNumber`)
- Application configuration object (`appConfig`)
- Feature flags via `appConfig.enableDebug` / `appConfig.enablePerformanceMonitoring`
- API URL helpers

**Example:**
```javascript
import { appConfig, getApiUrl } from '@/utils/config';

console.log(appConfig.apiUrl);
const endpoint = getApiUrl('/data/layers');

if (appConfig.enableDebug) {
  // Debug mode on
}
```

### performance.js
Performance monitoring utilities.

**Key Features:**
- Execution time measurement
- Metric collection and statistics
- Component render tracking
- Performance observer

**Example:**
```javascript
import { measure, recordMetric, getAllMetrics } from '@/utils/performance';

// Measure function execution
await measure('Data Processing', async () => {
  // ... do work ...
});

// Get all metrics
const stats = getAllMetrics();
```

### devTools.js
Development utilities and debugging helpers.

**Key Features:**
- Dev mode helpers via window.__stratum3D__
- Lifecycle logging
- Development assertions
- Deprecation warnings

**Example:**
```javascript
import { enableDevMode, logLifecycle, devAssert } from '@/utils/devTools';

// Enable in app initialization
enableDevMode();

// Log component lifecycle
logLifecycle('MyComponent', 'mounted', { props });

// Assert in development
devAssert(user !== null, 'User must be logged in');
```

### helpers.js
Shared pure utility functions (no Vue reactivity).

**Key Features:**
- String formatting (`capitalize`, `formatKey`)
- UUID generation via `crypto.randomUUID`
- Function debouncing

**Example:**
```javascript
import { capitalize, formatKey, generateUUID, debounce } from '@/utils/helpers';

capitalize('hello');            // 'Hello'
formatKey('my_field_name');     // 'My Field Name'
const id = generateUUID();

const onResize = debounce(() => recalcLayout(), 200);
```

### crs.js
CRS/projection registration helpers for OpenLayers + proj4.

**Key Features:**
- Registers common polar/regional projections out of the box (EPSG:3031, 3575, 3995, 27700, 2154)
- `registerCustomProjections(config)` — call once at app startup to register the map CRS from `config.yaml`
- `tryRegisterProjection(code, proj4Def?)` — lazily register any EPSG code; falls back to epsg.io if not built-in

**Example:**
```javascript
import { registerCustomProjections, tryRegisterProjection } from '@/utils/crs';

// At startup
const activeCrs = registerCustomProjections(appConfig);

// When loading a layer whose CRS is unknown
const ok = await tryRegisterProjection('EPSG:31255', serverProj4String);
if (!ok) console.warn('Could not register projection');
```

### styleFactory.js
OpenLayers style creation for vector layers and features.

**Key Features:**
- `createPinStyle(color)` — SVG map pin for point geometries
- `createVectorStyle(strokeColor, fillColor, strokeWidth, opacity)` — lines & polygons
- `createSelectionStyle(baseColor, geomType)` — complementary-color highlight on selection
- `buildLayerSharedStyle(...)` — single shared `Style` for an entire layer (batched OL draw calls)
- `applyFeatureStyle(feature, ...)` — per-feature style based on geometry type
- `buildGroupByStyleFunction(layerId, layerStore)` — per-feature style function for `group_by` colouring

**Example:**
```javascript
import { createVectorStyle, buildLayerSharedStyle } from '@/utils/styleFactory';

const style = createVectorStyle('#e63946', null, 2, 0.3);
vectorLayer.setStyle(style);

// Shared layer style (better OL rendering performance)
const shared = buildLayerSharedStyle(layer.color, layer.strokeColor, layer.fillColor, geomType);
olLayer.setStyle(shared);
```

### layerFactory.js
Factory functions that create OpenLayers layer instances from config objects.

**Key Features:**
- `createTileLayerConfig` — XYZ/WMTS tile layers with optional custom tile grids (polar projections)
- `createWMSLayerConfig` — WMS tile layers
- `createWMTSLayerConfig` — WMTS layers with explicit tile grids
- `createGeoJSONLayerConfig` — deferred-load GeoJSON layer descriptors
- `createGeoTIFFLayerConfig` — `WebGLTileLayer` for COG/GeoTIFF with colormap support
- `buildColormapStyle(colormapId, hasNoData, inverted?)` — WebGL color expression for single-band rasters

**Example:**
```javascript
import { createGeoTIFFLayerConfig, createGeoJSONLayerConfig } from '@/utils/layerFactory';

const tiffLayer = createGeoTIFFLayerConfig(layerConf, olMap, zIndex, uuid);
olMap.addLayer(tiffLayer.layerInstance);

const jsonDescriptor = createGeoJSONLayerConfig(layerConf, uuid);
// layerInstance is null until data is fetched and the OL layer is constructed
```

## Usage Guidelines

### When to Use Each Utility

- **logger**: For all logging needs (replace console.log/warn/error)
- **errorHandler**: When catching and throwing errors
- **http**: For network requests
- **config**: For environment-specific configuration
- **performance**: To identify performance bottlenecks
- **devTools**: Only in development for debugging
- **helpers**: General-purpose string/UUID/debounce utilities
- **crs**: Registering projections before creating map views or loading layers
- **styleFactory**: Creating or updating OpenLayers styles for vector layers
- **layerFactory**: Constructing OpenLayers layer instances from config descriptors

### Best Practices

1. **Always use logger instead of console**
   ```javascript
   // ❌ Don't
   console.log('User clicked button');
   
   // ✅ Do
   logger.info('ButtonComponent', 'User clicked button');
   ```

2. **Provide context in logs**
   ```javascript
   // ❌ Don't
   logger.error('Error', 'Something failed');
   
   // ✅ Do
   logger.error('UserService', 'Failed to save user profile', { userId, error });
   ```

3. **Use AppError for application errors**
   ```javascript
   // ❌ Don't
   throw new Error('User not found');
   
   // ✅ Do
   throw new AppError('User not found', ErrorType.NOT_FOUND, { userId });
   ```

4. **Measure performance of heavy operations**
   ```javascript
   import { measure } from '@/utils/performance';
   
   const result = await measure('Large Dataset Processing', async () => {
     return processLargeDataset(data);
   });
   ```

5. **Check feature flags via appConfig**
   ```javascript
   import { appConfig } from '@/utils/config';
   
   if (appConfig.enableDebug) {
     showDebugOverlay();
   }
   ```

## Environment Variables

### Client (.env)
```bash
VITE_API_URL=http://localhost:3000
VITE_API_TIMEOUT=30000
VITE_ENABLE_DEBUG=false
VITE_ENABLE_PERFORMANCE=false
```

### Server (.env)
```bash
PORT=3000
NODE_ENV=development
LOG_LEVEL=info
# Set to your deployed frontend URL in production:
CORS_ORIGINS=http://localhost:8080,http://localhost:5173
```

## Development Console Access

In development mode, utilities are accessible via browser console:

```javascript
// View performance metrics
__stratum3D__.getMetrics()

// Change log level
__stratum3D__.setLogLevel('debug')

// Get app info
__stratum3D__.getInfo()

// Reload config
__stratum3D__.reloadConfig()
```
