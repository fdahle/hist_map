> [!WARNING]
> **This project is currently under heavy development and makes use of vibe-coding.**
> Expect frequent breaking changes, bugs, and incomplete documentation. Read the [disclaimer](#disclaimer) below.

# Stratum3D

A web-based geospatial visualization system with 3D model and point cloud support, designed for historical map data and geographical features.

## Features

- 📍 **Interactive 2D Maps** - OpenLayers-based mapping with custom CRS support
- 🗻 **3D Viewer** - Three.js-based 3D visualization of models and point clouds
- 📊 **Multi-format Support** - GeoJSON, 3D models (.obj, .ply), point clouds (.laz, .ply), GeoTIFFs
- 🐳 **Docker Ready** - Complete containerized setup with all dependencies
- 🛠️ **Flexible Configuration** - YAML-based map config with per-feature 3D data links

## Quick Start

### Using Docker (Recommended)

The easiest way to get started - no need to install GDAL, PDAL, or other dependencies:

```bash
# Start the application
docker compose up

# Access at:
# - Frontend: http://localhost:8080
# - Backend API: http://localhost:3000
```

For development with hot-reload:
```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up
# Frontend dev server: http://localhost:5173
```

See [DOCKER.md](DOCKER.md) for complete Docker documentation.

### Manual Setup

#### Prerequisites
- Node.js 20+
#### Installation

```bash
# Install dependencies
cd client && npm install
cd ../server && npm install

# Start development servers
cd client && npm run dev    # Port 5173
cd server && npm start      # Port 3000
```

## Project Structure

```
stratum3D/
├── docker-compose.yml          # Base Docker configuration
├── docker-compose.dev.yml      # Development overrides
├── docker-compose.prod.yml     # Production overrides
├── .env.example                # Root environment variable template
├── server/
│   ├── index.js                # Express API server
│   ├── reset.js                # Reset/cleanup utility
│   ├── src/                    # Core server modules
│   │   ├── config.js           # Environment-based configuration
│   │   ├── jobQueue.js         # Async job queue for processing
│   │   ├── layerStore.js       # UUID-based layer registry
│   │   ├── logger.js           # Structured logging
│   │   └── utils.js            # Shared utilities
│   ├── processors/             # Format-specific processing logic
│   │   ├── geotiffProcessor.js
│   │   ├── modelProcessor.js
│   │   ├── pointcloudProcessor.js
│   │   ├── shapeProcessor.js
│   │   └── uploadProcessor.js
│   └── data/                   # Served data directory
│       ├── config.yaml         # Map configuration
│       └── layers/             # Uploaded layers (UUID-based)
│           └── {uuid}/         # One folder per layer
└── client/                     # Vue.js frontend application
    ├── src/
    │   ├── App.vue
    │   ├── main.js
    │   ├── components/
    │   │   ├── admin/          # Admin UI components
    │   │   ├── contextMenus/   # Right-click context menus
    │   │   ├── map/            # 2D map components
    │   │   ├── modals/         # Dialog modals (incl. admin/)
    │   │   ├── ui/             # Generic UI primitives
    │   │   └── viewer3D/       # 3D viewer components
    │   ├── composables/        # Reusable Vue composables
    │   ├── constants/          # App-wide constants and config schema
    │   ├── router/             # Vue Router configuration
    │   ├── stores/             # Pinia state stores
    │   │   ├── map/            # Map state (layers, pins, selection)
    │   │   └── viewer3D/       # 3D viewer state
    │   ├── utils/              # Frontend utilities
    │   ├── views/              # Top-level views (MapView, 3DView, AdminView)
    │   └── workers/            # Web Workers (GeoTIFF, layer, point cloud)
    └── public/
        └── wasm/               # WASM binaries (laz-perf)
```

## Workflow

### 1. Add Your Data

Navigate to the Admin view in the app and upload files directly. Supported formats:
- GeoJSON / Shapefiles → vector layers
- GeoTIFF (`.tif`) → raster layers
- 3D models (`.obj` + `.mtl`, `.ply`)
- Point clouds (`.las`, `.laz`, `.ply`)
- CSV files → attribute join for GeoJSON layers

Each upload is assigned a unique UUID and stored under `server/data/layers/{uuid}/`.

### 2. Configure Your Map

Use the Admin interface to manage layers. The map title, CRS, and view settings can be adjusted in `server/data/config.yaml` if needed.

### 3. View Your Map

Open http://localhost:8080 (Docker) or http://localhost:5173 (dev) to see your map.

## Key Features

### Admin Interface

The Admin view allows you to manage data layers without touching config files:
- Upload and configure new layers (GeoJSON, GeoTIFF, 3D models, point clouds)
- Link sub-files (CSV attributes, MTL materials, textures)
- Edit layer metadata and display settings
- Remove layers and associated files

### 3D Viewer

The 3D viewer supports:
- Multiple 3D models per feature
- Point cloud visualization
- Camera position files
- Interactive tools (wireframe, bounding box, measurements)
- QGIS-style ribbon menu

### Layer Store

Each uploaded layer is stored in its own UUID directory under `server/data/layers/`:
- `{uuid}.{ext}` — main data file
- `{uuid}.meta.json` — metadata sidecar
- Sub-files (CSV, MTL, textures, linked models/point clouds) stored alongside

### Supported Formats

**Vector Data:**
- GeoJSON (`.geojson`, `.json`)
- Shapefiles (`.shp` + associated files)

**3D Models:**
- Wavefront OBJ (`.obj` with `.mtl` and textures)
- PLY (`.ply`)

**Point Clouds:**
- LAZ/LAS (`.laz`, `.las`) - converted to COPC
- PLY (`.ply`)
- COPC (`.copc.laz`) - cloud-optimized format

**Raster Data:**
- GeoTIFF (`.tif`, `.tiff`) - converted to COG


## Documentation

- [Docker Setup](DOCKER.md) - Complete Docker usage guide

## Development

### Development Mode

```bash
# Client (Vue.js with hot-reload)
cd client
npm run dev       # Port 5173

# Server (Express)
cd server
npm start         # Port 3000
```

### Build for Production

```bash
# Build client
cd client
npm run build

# Serve via Express
cd server
npm start
```

### Linting & Formatting

```bash
cd client
npm run lint       # ESLint
npm run format     # Prettier
```

### Docker Development

```bash
# Development (hot-reload)
docker compose -f docker-compose.yml -f docker-compose.dev.yml up

# Production
docker compose -f docker-compose.yml -f docker-compose.prod.yml up

# Rebuild after dependency changes
docker compose up --build
```

## Troubleshooting

### Site Title and Favicon
Set these in your root `.env` before building the client:

```env
VITE_SITE_TITLE=My Map
VITE_SITE_FAVICON=/favicon.png
```

Place the favicon file in `client/public/` — everything in that folder is served from the root path, so `client/public/favicon.png` becomes `/favicon.png`. Then rebuild the client container to apply the changes:

```bash
sudo docker compose build client && sudo docker compose up -d client
```

### Port Already in Use
Change ports in `docker-compose.yml` or the root `.env` file (copy `.env.example` as a starting point).

### 3D Models Not Loading
1. Check that preprocessing completed or the upload succeeded
2. Verify the layer UUID directory exists under `server/data/layers/`
3. Check browser console for errors

### Admin Password
On first run a setup wizard will prompt you to set an admin password. To reset it, delete `server/data/.credentials` and restart the server.

### Disabling the Admin Panel
Once your layers are configured you can hide the admin panel entirely. In your root `.env` file, set:

```bash
ADMIN_ENABLED=false
```

Then recreate the server container to apply the change:

```bash
docker compose up -d server
```

This strips all `/admin/*` routes from the server at the network level. To re-enable it, set `ADMIN_ENABLED=true` and run `docker compose up -d server` again.

> **Note:** Use `docker compose up -d` (not `docker compose restart`) when changing `.env` — `restart` does not re-read environment variables.

### Large Files
For very large files, upload and processing are handled automatically by the Admin interface. Processing options (decimation, COPC conversion, COG creation) can be configured before uploading.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly (2D map, 3D viewer, preprocessing)
5. Submit a pull request

## Disclaimer

This repository serves as a primary test case to determine the practical limits and efficacy of "vibe-coding." We are exploring how far rapid, intuition-led prototyping can carry a project before traditional engineering rigor must take over.

Because features are the result of rapid exploration, they may behave unexpectedly. Do not use this with sensitive data. A manual evaluation and code audit phase is scheduled for later this year to transition Stratum3D toward production-ready standards.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- OpenLayers for 2D mapping
- Three.js for 3D visualization
- Vue.js for the frontend framework
- GDAL, PDAL, and untwine for data processing tools
