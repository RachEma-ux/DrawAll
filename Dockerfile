FROM node:20-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package*.json ./
ENV HTTP_PROXY=http://172.23.0.4:2003
ENV HTTPS_PROXY=http://172.23.0.4:2003
ENV http_proxy=http://172.23.0.4:2003
ENV https_proxy=http://172.23.0.4:2003
RUN npm config set registry https://npm.mirrors.msh.team \
    && npm config set proxy $HTTP_PROXY \
    && npm config set https-proxy $HTTPS_PROXY \
    && npm config set strict-ssl false \
    && npm config set fund false \
    && npm config set audit false
RUN npm install -g npm@11
RUN --mount=type=cache,target=/root/.npm \
    if [ -f package-lock.json ]; then \
      npm ci --prefer-offline --no-audit || npm install --prefer-offline --no-audit; \
    else \
      npm install --prefer-offline --no-audit; \
    fi

FROM deps AS build
COPY . .
RUN npm run build

FROM node:20-alpine AS production
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./

EXPOSE 3000
CMD ["npm", "start"]
