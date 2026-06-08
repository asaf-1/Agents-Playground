FROM node:24-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ENV PORT=4173
EXPOSE 4173

CMD ["node", "server.js", "4173"]
