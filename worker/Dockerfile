
FROM node:18-alpine

# Install git and other dependencies needed for SST
RUN apk add --no-cache git openssh-client

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

# Create a non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S worker -u 1001
RUN chown -R worker:nodejs /tmp/deployments
RUN chown -R worker:nodejs /usr/src/app

USER worker

# Expose port for health checks
EXPOSE 8080

# Start the worker
CMD ["node", "dist/index.js"]
