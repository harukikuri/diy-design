# Cloud Run 用イメージ。フロントエンドとエージェント API を1サービスで配る。
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-server ./dist-server
# Cloud Run は PORT を注入する
ENV PORT=8080
EXPOSE 8080
CMD ["node", "dist-server/index.js"]
