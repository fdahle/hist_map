# Use Node.js for building Vue app
FROM node:20-alpine as build

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Accept build-time env vars from docker-compose (baked into the JS bundle by Vite)
ARG VITE_DEFAULT_THEME=auto
ENV VITE_DEFAULT_THEME=$VITE_DEFAULT_THEME

ARG VITE_API_URL=http://localhost:3000
ENV VITE_API_URL=$VITE_API_URL

ARG VITE_BUG_REPORT=auto
ENV VITE_BUG_REPORT=$VITE_BUG_REPORT

ARG VITE_DEBUG_MODE=false
ENV VITE_DEBUG_MODE=$VITE_DEBUG_MODE

ARG VITE_SITE_TITLE=Stratum3D
ENV VITE_SITE_TITLE=$VITE_SITE_TITLE

ARG VITE_SITE_FAVICON=/favicon.svg
ENV VITE_SITE_FAVICON=$VITE_SITE_FAVICON

# Build the Vue app
RUN npm run build

# Production stage - use nginx to serve built files
FROM nginx:alpine

# Disable server version disclosure and add security headers
RUN printf 'server {\n\
    listen 80;\n\
    server_tokens off;\n\
    root /usr/share/nginx/html;\n\
    index index.html;\n\
\n\
    add_header X-Content-Type-Options "nosniff" always;\n\
    add_header X-Frame-Options "DENY" always;\n\
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;\n\
\n\
    location / {\n\
        try_files $uri $uri/ /index.html;\n\
    }\n\
\n\
    # Cache static assets\n\
    location ~* \\.(js|css|png|jpg|jpeg|gif|ico|svg|woff2?)$ {\n\
        expires 1y;\n\
        add_header Cache-Control "public, immutable";\n\
    }\n\
}\n' > /etc/nginx/conf.d/default.conf

# Copy built files from build stage
COPY --from=build /app/dist /usr/share/nginx/html

# Expose port
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
