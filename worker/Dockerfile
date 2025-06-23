
FROM node:18

# Install git and other dependencies
RUN apt-get update && apt-get install -y \
    git \
    curl \
    unzip \
    && rm -rf /var/lib/apt/lists/*

# Install Bun globally
RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:$PATH"

# Verify Bun installation
RUN bun --version

# Create app directory
WORKDIR /usr/src/app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY dist/ ./dist/

# Create workspace directory for deployments
RUN mkdir -p /tmp/deployments

# Create a non-root user and set up directories
RUN groupadd -r nodejs && useradd -r -g nodejs worker
RUN chown -R worker:nodejs /tmp/deployments
RUN chown -R worker:nodejs /usr/src/app

# Create Bun cache directory for worker user
RUN mkdir -p /home/worker/.bun
RUN chown -R worker:nodejs /home/worker

# Switch to worker user
USER worker

# Set Bun environment variables for the worker user
ENV BUN_INSTALL="/home/worker/.bun"
ENV PATH="/home/worker/.bun/bin:$PATH"

# Install Bun for the worker user
RUN curl -fsSL https://bun.sh/install | bash

# Verify Bun is available for worker user
RUN bun --version

# Set additional environment variables for better compatibility
ENV NODE_ENV=production
ENV BUN_CONFIG_NO_CLEAR_TERMINAL=true
ENV BUN_CONFIG_SILENT=false

# Expose port for health checks
EXPOSE 8080

# Start the worker
CMD ["node", "dist/index.js"]
