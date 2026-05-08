# Docker Setup for stratum3D
Complete Docker setup with all dependencies pre-installed. Works on macOS, Ubuntu, and Windows.

## Prerequisites

- **Docker Desktop** (includes Docker Compose)
  - [macOS](https://docs.docker.com/desktop/install/mac-install/)
  - [Windows](https://docs.docker.com/desktop/install/windows-install/)
  - [Ubuntu](https://docs.docker.com/desktop/install/linux-install/)

That's it! No need to install GDAL, PDAL, Node.js, or any other dependencies.

## Quick Start

### 1. Production Mode (Recommended)

Start both server and client in production mode:

```bash
docker compose up
```

Access the application:
- **Frontend**: http://localhost:8080
- **Backend API**: http://localhost:3000

### 2. Development Mode

For development with hot-reload:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up
```

Access development server:
- **Frontend (dev)**: http://localhost:5173 (with hot reload)
- **Backend API**: http://localhost:3000

## Commands

### Start Services
```bash
# Start all services
docker compose up

# Start in background
docker compose up -d

# Start specific service
docker compose up server
```

### Stop Services
```bash
# Stop all services
docker compose down

# Stop and remove volumes
docker compose down -v
```

### View Logs
```bash
# All services
docker compose logs

# Specific service
docker compose logs server

# Follow logs
docker compose logs -f server
```

### Rebuild After Changes
```bash
# Rebuild all images
docker compose build

# Rebuild specific service
docker compose build server

# Rebuild and start
docker compose up --build
```

### Access Container Shell
```bash
# Server container
docker compose exec server bash

# Client container
docker compose exec client sh
```

## Folder Structure

The Docker setup mounts the data folder so uploads survive container restarts:

```
stratum3D/
├── server/
│   ├── data/                # Mounted read-write (persisted)
│   │   ├── config.yaml      # Map configuration
│   │   └── layers/          # Uploaded layers (UUID-based)
│   │       └── {uuid}/      # One folder per layer
│   └── Dockerfile
│
├── client/
│   └── Dockerfile
│
└── docker-compose.yml
```

## Port Binding

By default both services bind to **localhost only** (`127.0.0.1`), which is the safe default for deployments behind a reverse proxy (Apache, nginx):

- Frontend: `127.0.0.1:8080 → container:80`
- Backend:  `127.0.0.1:3000 → container:3000`

**For direct access without a reverse proxy** (e.g. accessing from another machine on the network), change the port mappings in `docker-compose.yml`:

```yaml
ports:
  - "8080:80"    # was: "127.0.0.1:8080:80"
  - "3000:3000"  # was: "127.0.0.1:3000:3000"
```

## Environment Variables

Copy `.env.example` to `.env` in the root directory and edit the two deployment-specific values:

```env
# Server
NODE_ENV=production
PORT=3000

# Must match the public URL used to open the app in the browser
CORS_ORIGINS=http://your-domain.com:8080

# Client — baked into the JS bundle at build time
# Must match the public URL where the server is reachable
VITE_API_URL=http://your-domain.com:3000
```

For local development the defaults (`localhost:8080` / `localhost:3000`) work without any changes.

> **Note:** Use `docker compose up -d` (not `docker compose restart`) when changing `.env` — `restart` does not re-read environment variables.

## Included Tools

The Docker image includes:
- ✅ **Node.js 20** - Runtime
- ✅ **GDAL** - GeoTIFF processing
- ✅ **PDAL** - Point cloud processing
- ✅ **untwine** - COPC (Cloud-Optimized Point Cloud) conversion
- ✅ All npm dependencies

## Troubleshooting

### Port Already in Use

Edit `docker-compose.yml` to change the host-side port mappings, e.g. `8081:80` instead of `8080:80`.

### Permission Issues (Linux)
```bash
# Fix data folder permissions
sudo chown -R $USER:$USER server/data
```

### Rebuild from Scratch
```bash
# Remove all containers, images, and volumes
docker compose down -v
docker system prune -a
docker compose up --build
```

### View Container Resources
```bash
# See running containers
docker ps

# See resource usage
docker stats
```

## Production Deployment

### Using Docker Compose (VPS/Server)
```bash
# Clone repository
git clone https://github.com/fdahle/stratum3D.git
cd stratum3D

# Configure environment
cp .env.example .env
# Edit .env: set CORS_ORIGINS and VITE_API_URL to your public domain

# Start services
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# Check status
docker compose ps
```

### Environment-Specific Configuration
```bash
# Production (adds restart: always to all services)
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# Development (hot-reload for both server and client)
docker compose -f docker-compose.yml -f docker-compose.dev.yml up
```

## Benefits

✅ **No Installation Hassles** - Everything pre-configured
✅ **Cross-Platform** - Works on Mac, Windows, Ubuntu
✅ **Isolated Environment** - No conflicts with system packages
✅ **Version Control** - Consistent environment for all developers
✅ **Easy Updates** - `docker compose pull && docker compose up`
✅ **Production Ready** - Same container dev to prod

## Next Steps

1. **First time setup**:
   ```bash
   docker compose up --build
   ```

2. **Access application**:
   - Open http://localhost:8080
