FROM node:22-alpine@sha256:8ea2348b068a9544dae7317b4f3aafcdc032df1647bb7d768a05a5cad1a7683f AS build

WORKDIR /app

ARG VITE_DEV_BYPASS_TERMINAL_ACTIVATION=false
ARG VITE_HOME_ID=11111111-1111-1111-1111-111111111111
ARG VITE_TERMINAL_ID=22222222-2222-2222-2222-222222222222
ENV VITE_DEV_BYPASS_TERMINAL_ACTIVATION=${VITE_DEV_BYPASS_TERMINAL_ACTIVATION}
ENV VITE_HOME_ID=${VITE_HOME_ID}
ENV VITE_TERMINAL_ID=${VITE_TERMINAL_ID}

COPY package.json package-lock.json tsconfig.json tsconfig.app.json tsconfig.node.json vite.config.ts index.html ./
COPY src ./src

RUN npm ci
RUN npm run build

FROM nginx:1.27-alpine@sha256:65645c7bb6a0661892a8b03b89d0743208a18dd2f3f17a54ef4b76fb8e2f2a10

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
