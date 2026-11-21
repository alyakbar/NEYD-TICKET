FROM node:24-bookworm-slim AS build
WORKDIR /workspace

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci

COPY apps/web apps/web
ENV NEXT_PUBLIC_API_URL=/api
RUN npm run build --workspace @neyd/web

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

COPY --from=build /workspace/package.json /workspace/package-lock.json ./
COPY --from=build /workspace/node_modules ./node_modules
COPY --from=build /workspace/apps/api/package.json ./apps/api/package.json
COPY --from=build /workspace/apps/web/package.json ./apps/web/package.json
COPY --from=build /workspace/apps/web/.next ./apps/web/.next
COPY --from=build /workspace/apps/web/app ./apps/web/app
COPY --from=build /workspace/apps/web/next.config.js ./apps/web/next.config.js

EXPOSE 3000
CMD ["npm", "run", "start", "--workspace", "@neyd/web"]
