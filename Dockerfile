FROM node:24-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# The React app at /app is Vite output written to public/app, and public/app is
# gitignored - so a build from a clean checkout has no SPA at all unless it is
# built here. Without this, every /app/* route 404s in the container while the
# API and the server-rendered pages look fine, which is the most confusing
# possible failure. npm ci above installs devDependencies, so vite is present.
RUN npm run build

# HOST defaults to 127.0.0.1 in server.js, which is right on a laptop and wrong
# in a container: loopback inside the namespace is unreachable from outside it.
ENV HOST=0.0.0.0
ENV PORT=4173

EXPOSE 4173

# No port argument. server.js reads argv[2] BEFORE process.env.PORT, so passing
# one here would pin the port and silently ignore whatever the host asks for -
# Render, for instance, routes to $PORT and would find nothing listening.
CMD ["node", "server.js"]
