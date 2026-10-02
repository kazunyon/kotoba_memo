FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
# Desktop binaries are built separately on Windows.
RUN ELECTRON_SKIP_BINARY_DOWNLOAD=1 npm ci
COPY index.html vite.config.ts tsconfig*.json ./
COPY src ./src
COPY public ./public
ENV VITE_BASE_PATH=/
RUN npm run build

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production PORT=8080
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node server ./server
USER node
EXPOSE 8080
CMD ["node", "server/app.mjs"]
