# Remote (HTTP) nezamy-mcp. Build from the mcp/ folder:  docker build -f nezamy-mcp/Dockerfile -t nezamy-mcp .
FROM node:22-alpine AS build
WORKDIR /app
COPY nezamy-client ./nezamy-client
COPY nezamy-mcp ./nezamy-mcp
RUN cd nezamy-client && npm ci && npm run build \
 && cd ../nezamy-mcp && npm ci && npm run build && npm prune --omit=dev

FROM node:22-alpine
ENV NODE_ENV=production PORT=8787
WORKDIR /app
COPY --from=build /app/nezamy-client ./nezamy-client
COPY --from=build /app/nezamy-mcp ./nezamy-mcp
USER node
EXPOSE 8787
# Set MCP_PUBLIC_URL to the public https URL; the server holds no secrets (each caller brings their own token).
CMD ["node", "nezamy-mcp/dist/index.js", "http"]
