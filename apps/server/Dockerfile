FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
COPY apps/server/package*.json apps/server/
COPY apps/web/package*.json apps/web/
RUN npm install

FROM deps AS build
WORKDIR /app
COPY . .
RUN npm run build --workspace @alcomatcher/server
RUN npm run build --workspace @alcomatcher/web

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
COPY apps/server/package*.json apps/server/
RUN npm install --omit=dev
COPY --from=build /app/apps/server/dist apps/server/dist
COPY --from=build /app/apps/web/dist apps/web/dist
EXPOSE 3000
CMD ["node", "apps/server/dist/index.js"]
