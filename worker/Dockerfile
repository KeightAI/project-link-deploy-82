
FROM node:20

# Install system deps
RUN apt-get update && apt-get install -y git curl unzip && rm -rf /var/lib/apt/lists/*

# Install Bun globally
RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:$PATH"

# Set working directory
WORKDIR /usr/src/app

# Copy package files and install dependencies (including devDeps for build)
COPY package*.json ./
COPY tsconfig*.json ./

RUN npm ci

# Copy the rest of the app
COPY . .

# Create workspace directory for deployments and setup non-root user
RUN groupadd -r nodejs && useradd -r -g nodejs -m -d /home/worker worker \
  && mkdir -p /tmp/deployments /tmp/npm-cache /home/worker/.bun \
  && chown -R worker:nodejs /usr/src/app /tmp/deployments /home/worker /tmp/npm-cache /home/worker/.bun \
  && chmod -R 755 /tmp/deployments /home/worker

# Set environment variables
ENV NODE_ENV=production
ENV npm_config_cache=/tmp/npm-cache
ENV PATH="/usr/src/app/node_modules/.bin:/home/worker/.bun/bin:$PATH"

# Switch to worker user
USER worker

# Expose port for healthchecks (if needed)
EXPOSE 8080

# Start your worker app
CMD ["node", "dist/index.js"]
