# SafeSec Agents — frontend
#
# Static build served by nginx. VITE_* env vars are baked in at *build*
# time (Vite has no server-side runtime), so pass them as --build-arg if
# they differ from the defaults baked into .env.production / .env.example.
#
# Build:
#   docker build -t safesec-agents-frontend \
#     --build-arg VITE_API_BASE_URL=https://api.example.com \
#     --build-arg VITE_USE_MOCK=false .
# Run:
#   docker run --rm -p 8080:80 safesec-agents-frontend

FROM node:20-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ARG VITE_API_BASE_URL=http://localhost:8000
ARG VITE_USE_MOCK=false
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL \
    VITE_USE_MOCK=$VITE_USE_MOCK

RUN npm run build

FROM nginx:1.27-alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
