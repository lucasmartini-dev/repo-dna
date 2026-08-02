FROM ubuntu:22.04 AS builder
ENV NODE_VERSION=20.15.0
ENV NVM_DIR=/root/.nvm

RUN apt-get update && apt-get install -y curl build-essential python3 && \
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash && \
    . "$NVM_DIR/nvm.sh" && nvm install $NODE_VERSION && nvm use $NODE_VERSION && nvm alias default $NODE_VERSION && \
    npm install -g npm@10

ENV PATH="$NVM_DIR/versions/node/v$NODE_VERSION/bin:$PATH"

WORKDIR /app
COPY package.json package-lock.json* ./
COPY packages/shared/package.json packages/shared/
COPY apps/backend/package.json apps/backend/
RUN npm ci
COPY packages/shared packages/shared
COPY apps/backend apps/backend
WORKDIR /app/apps/backend
RUN npm run build

FROM ubuntu:22.04
ENV NODE_VERSION=20.15.0
ENV NVM_DIR=/root/.nvm
ENV PATH="$NVM_DIR/versions/node/v$NODE_VERSION/bin:$PATH"

RUN apt-get update && apt-get install -y curl build-essential python3 && \
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash && \
    . "$NVM_DIR/nvm.sh" && nvm install $NODE_VERSION && nvm use $NODE_VERSION && nvm alias default $NODE_VERSION && \
    npm install -g npm@10

WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/backend/package.json ./package.json
COPY --from=builder /app/apps/backend/node_modules ./node_modules
COPY --from=builder /app/apps/backend/.next ./.next
COPY --from=builder /app/apps/backend/next.config.mjs ./next.config.mjs
COPY --from=builder /app/apps/backend/server.ts ./server.ts
COPY --from=builder /app/apps/backend/src ./src
COPY --from=builder /app/apps/backend/tsconfig.json ./tsconfig.json
COPY --from=builder /app/packages/shared ./packages/shared
RUN mkdir -p /data
EXPOSE 3000
CMD ["npx", "tsx", "server.ts"]
