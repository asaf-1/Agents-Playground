# Standalone test runner image.
#
# Separate from the repository's app image on purpose: this deploys on its own,
# to its own host, on its own schedule. It has no npm dependencies, so there is
# no install step and nothing to cache.

FROM node:24-alpine

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

ENV NODE_ENV=production \
    TR_HOST=0.0.0.0 \
    TR_PORT=4300 \
    TR_USERS_FILE=/app/data/users.json

EXPOSE 4300

USER node

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.TR_PORT||4300)+'/api/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "server.js"]
