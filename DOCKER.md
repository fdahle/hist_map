# Docker Setup for stratum3D
Complete Docker setup with all dependencies pre-installed. Works on macOS, Ubuntu, and Windows.

## Prerequisites

- **Docker Desktop** (includes Docker Compose)
  - [macOS](https://docs.docker.com/desktop/install/mac-install/)
  - [Windows](https://docs.docker.com/desktop/install/windows-install/)
  - [Ubuntu](https://docs.docker.com/desktop/install/linux-install/)

That's it! No need to install GDAL, PDAL, MeshLab, Node.js, or any other dependencies.

## Quick Start

### 1. Production Mode (Recommended)

Start both server and client in production mode:

```bash
docker-compose up
```

Access the application:
- **Frontend**: http://localhost:8080
- **Backend API**: http://localhost:3000

### 2. Development Mode

For development with hot-reload:

```bash
# Start server and client-dev
docker-compose --profile dev up server client-dev
```

Access development server:
- **Frontend (dev)**: http://localhost:5173 (with hot reload)
- **Backend API**: http://localhost:3000

## Data Preprocessing

Run preprocessing inside Docker container:

```bash
# Start the server container
docker-compose up -d server

# Run preprocessing
docker-compose exec server node preprocess.js

# View logs
docker-compose exec server tail -f logs/preprocess.log
```

Or run as one-off command:

```bash
docker-compose run --rm server node preprocess.js
```

## Commands

### Start Services
```bash
# Start all services
docker-compose up

# Start in background
docker-compose up -d

# Start specific service
docker-compose up server
```

### Stop Services
```bash
# Stop all services
docker-compose down

# Stop and remove volumes
docker-compose down -v
```

### View Logs
```bash
# All services
docker-compose logs

# Specific service
docker-compose logs server

# Follow logs
docker-compose logs -f server
```

### Rebuild After Changes
```bash
# Rebuild all images
docker-compose build

# Rebuild specific service
docker-compose build server

# Rebuild and start
docker-compose up --build
```

### Access Container Shell
```bash
# Server container
docker-compose exec server bash

# Client container
docker-compose exec client sh
```

## Folder Structure

The Docker setup mounts these folders:

```
stratum3D/
├── input/                    # Mounted read-only to server
│   ├── shapes/
│   ├── models/
│   ├── pointclouds/
│   └── geotiffs/
│
├── server/
│   ├── data/                # Mounted read-write (persisted)
│   │   ├── shapes/
│   │   ├── 3D/
│   │   ├── pointclouds/
│   │   └── geotiffs/
│   └── Dockerfile
│
├── client/
│   └── Dockerfile
│
└── docker-compose.yml
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

## Included Tools

The Docker image includes:
- ✅ **Node.js 20** - Runtime
- ✅ **GDAL** - GeoTIFF processing
- ✅ **PDAL** - Point cloud processing
- ✅ **MeshLab** - 3D model decimation
- ✅ All npm dependencies

## Troubleshooting

### Port Already in Use
```bash
# Use different ports
docker-compose -f docker-compose.yml -p stratum3D up
```

Or edit `docker-compose.yml` to change port mappings.

### Permission Issues (Linux)
```bash
# Fix data folder permissions
sudo chown -R $USER:$USER server/data
```

### Rebuild from Scratch
```bash
# Remove all containers, images, and volumes
docker-compose down -v
docker system prune -a
docker-compose up --build
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

# Start services
docker-compose up -d

# Check status
docker-compose ps
```

### Using Docker Swarm (Multi-server)
```bash
# Initialize swarm
docker swarm init

# Deploy stack
docker stack deploy -c docker-compose.yml stratum3D

# Check services
docker service ls
```

### Environment-Specific Configuration
```bash
# Production
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# Development
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up
```

## Benefits

✅ **No Installation Hassles** - Everything pre-configured
✅ **Cross-Platform** - Works on Mac, Windows, Ubuntu
✅ **Isolated Environment** - No conflicts with system packages
✅ **Version Control** - Consistent environment for all developers
✅ **Easy Updates** - `docker-compose pull && docker-compose up`
✅ **Production Ready** - Same container dev to prod

## Next Steps

1. **First time setup**:
   ```bash
   docker-compose up --build
   ```

2. **Run preprocessing**:
   ```bash
   docker-compose exec server node preprocess.js
   ```

3. **Access application**:
   - Open http://localhost:8080

That's it! No GDAL, PDAL, or MeshLab installation needed! 🎉
