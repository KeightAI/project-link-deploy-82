FROM node:18

# Install system deps
RUN apt-get update && apt-get install -y git curl unzip && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /usr/src/app

# Copy package files and install dependencies (including devDeps for build)
COPY package*.json ./
RUN npm ci

# Copy the rest of the app
COPY . .

# Add node_modules/.bin to PATH so react-router, vite, etc. work
ENV PATH="/usr/src/app/node_modules/.bin:$PATH"

# Build the app (adjust this to your actual build command)
RUN npm run build

# Create workspace directory for deployments and setup non-root user
RUN groupadd -r nodejs && useradd -r -g nodejs -m -d /home/worker worker \
  && mkdir -p /tmp/deployments /tmp/npm-cache \
  && chown -R worker:nodejs /usr/src/app /tmp/deployments /home/worker /tmp/npm-cache

# Set environment variables and switch to non-root user
ENV NODE_ENV=production
ENV npm_config_cache=/tmp/npm-cache
USER worker

# Expose port for healthchecks (if needed)
EXPOSE 8080

# Start your worker app
CMD ["node", "dist/index.js"]
