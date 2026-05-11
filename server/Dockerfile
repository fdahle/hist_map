# syntax=docker/dockerfile:1
# Ubuntu 22.04 LTS — PDAL + GDAL installed via conda-forge (guarantees all plugins,
# including writers.copc, regardless of Ubuntu repo versions)
FROM ubuntu:22.04

# Prevent interactive prompts during apt installs
ENV DEBIAN_FRONTEND=noninteractive

# conda-forge tools (pdal, gdalinfo, gdal_translate, …) must be on PATH for all
# RUN steps and at runtime when Node.js spawns child processes.
ENV PATH="/opt/conda/bin:$PATH"

# Point PROJ and GDAL to the conda-forge data directories so that coordinate
# reference system lookups succeed when PDAL/GDAL are invoked at runtime.
ENV PROJ_DATA="/opt/conda/share/proj"
ENV GDAL_DATA="/opt/conda/share/gdal"

# Install minimal apt deps + Node.js 20 in one cached layer.
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates \
        curl \
        gnupg \
        zip \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs

# Install Miniforge (conda with conda-forge as default channel), then use it to
# install PDAL and GDAL. conda-forge builds PDAL from source with all plugins
# enabled, so writers.copc is always present regardless of the host OS version.
# mamba is bundled with Miniforge and resolves deps significantly faster than conda.
RUN ARCH=$(uname -m) \
    && curl -fsSL "https://github.com/conda-forge/miniforge/releases/latest/download/Miniforge3-Linux-${ARCH}.sh" \
        -o /tmp/miniforge.sh \
    && bash /tmp/miniforge.sh -b -p /opt/conda \
    && rm /tmp/miniforge.sh \
    && /opt/conda/bin/mamba install -y -c conda-forge pdal gdal untwine \
    && /opt/conda/bin/conda clean -afy

# Create a non-root user to run the application
RUN groupadd -g 1001 appuser && useradd -u 1001 -g appuser -m -s /bin/false appuser

# Set working directory
WORKDIR /app/server

# Copy package files and install dependencies before copying source so that
# this layer is only invalidated when dependencies change, not on every edit.
COPY package*.json ./
RUN npm ci --omit=dev

# Create data directories before copying source (cached independently of code changes)
RUN mkdir -p data/layers data/shapes data/3D data/pointclouds data/geotiffs

# Copy server code and fix ownership in one layer to avoid a redundant intermediate layer
COPY . .
RUN chown -R appuser:appuser /app

# Switch to non-root user
USER appuser

# Expose server port
EXPOSE 3000

# Default command
CMD ["node", "index.js"]
