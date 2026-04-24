FROM node:22-alpine AS build

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

FROM nginx:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
