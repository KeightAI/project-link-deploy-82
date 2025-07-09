FROM node:18

# Install system deps
RUN apt-get update && apt-get install -y git curl unzip && rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /usr/src/app

# Copy package files
COPY package*.json ./

# Install all deps (include devDependencies for build tools)
RUN npm ci

# Copy entire app
COPY . .

# Add node_modules/.bin to PATH so react-router, vite, etc. work
ENV PATH="/usr/src/app/node_modules/.bin:$PATH"

# Create workspace directory
RUN mkdir -p /tmp/deployments

# Create a non-root user
RUN groupadd -r nodejs && useradd -r -g nodejs worker
RUN chown -R worker:nodejs /tmp/deployments /usr/src/app

USER worker

# ENV for Node runtime
ENV NODE_ENV=production

# Expose for healthchecks (if needed)
EXPOSE 8080

# Run your app (adjust if it's a worker or CLI)
CMD ["node", "dist/index.js"]
