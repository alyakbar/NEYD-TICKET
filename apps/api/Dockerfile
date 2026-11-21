FROM node:24-bookworm-slim AS build
WORKDIR /workspace

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci

COPY apps/api apps/api
RUN npm run build --workspace @neyd/api

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3001

COPY --from=build /workspace/package.json /workspace/package-lock.json ./
COPY --from=build /workspace/node_modules ./node_modules
COPY --from=build /workspace/apps/api/package.json ./apps/api/package.json
COPY --from=build /workspace/apps/api/dist ./apps/api/dist
COPY --from=build /workspace/apps/api/migrations ./apps/api/migrations
COPY --from=build /workspace/apps/api/seeds ./apps/api/seeds
COPY --from=build /workspace/apps/web/package.json ./apps/web/package.json

EXPOSE 3001
CMD ["npm", "run", "start", "--workspace", "@neyd/api"]
