# Stage 1: fetch the MoMA dataset and build the shards.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json build.mjs ./
COPY public ./public
RUN npm ci && node build.mjs

# Stage 2: plain nginx serving the static output.
FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/public /usr/share/nginx/html
