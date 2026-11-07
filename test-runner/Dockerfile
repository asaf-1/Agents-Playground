# Standalone test runner image.
#
# Separate from the repository's app image on purpose: this deploys on its own,
# to its own host, on its own schedule. It has no npm dependencies, so there is
# no install step and nothing to cache.

# The Node.js base image, the small Alpine one.
FROM node:26-alpine

# The app lives in /app.
WORKDIR /app

# Only this app's files. Nothing from the parent repository is needed at runtime:
# the flow catalog is fetched from GitHub.
COPY package.json ./
COPY server.js ./
COPY src ./src
COPY bin ./bin
COPY public ./public

# Accounts persist here. Mount a volume at /app/data, or the store resets on
# every redeploy and everyone has to sign up again.
RUN mkdir -p /app/data && chown -R node:node /app/data

# Production mode, listening on every interface at port 4300, with accounts kept
# in /app/data.
ENV NODE_ENV=production \
    TR_HOST=0.0.0.0 \
    TR_PORT=4300 \
    TR_USERS_FILE=/app/data/users.json

# The port it listens on.
EXPOSE 4300

# Run as the image's own unprivileged user, not root.
USER node

# Every 30 seconds, ask /api/health; anything but a 200 marks the container
# unhealthy.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.TR_PORT||4300)+'/api/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

# Start the server.
CMD ["node", "server.js"]
