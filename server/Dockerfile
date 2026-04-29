# Ubuntu 22.04 LTS — PDAL 2.6+ with writers.copc via UbuntuGIS unstable PPA
FROM ubuntu:22.04

# Prevent interactive prompts during apt installs
ENV DEBIAN_FRONTEND=noninteractive

# Add UbuntuGIS unstable PPA (provides PDAL 2.6+ with writers.copc support),
# then install GDAL, PDAL and supporting utilities in one layer
RUN apt-get update && apt-get install -y --no-install-recommends \
    software-properties-common \
    ca-certificates \
    gnupg \
    && add-apt-repository -y ppa:ubuntugis/ubuntugis-unstable \
    && apt-get update && apt-get install -y --no-install-recommends \
    gdal-bin \
    libgdal-dev \
    pdal \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js 20 via the official NodeSource distribution
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

# Create a non-root user to run the application
RUN groupadd -g 1001 appuser && useradd -u 1001 -g appuser -m -s /bin/false appuser

# Set working directory
WORKDIR /app/server

# Copy package files
COPY package*.json ./

# Install Node.js dependencies
RUN npm install --omit=dev

# Copy server code
COPY . .

# Create necessary data directories and set ownership
RUN mkdir -p data/layers data/shapes data/3D data/pointclouds data/geotiffs \
    && chown -R appuser:appuser /app

# Switch to non-root user
USER appuser

# Expose server port
EXPOSE 3000

# Default command
CMD ["node", "index.js"]
