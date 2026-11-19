FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ARG VITE_WIDGET_KEY
ARG VITE_SPACE_ID
ARG VITE_AUTOMATION_KEY
ARG VITE_MCP_URL
RUN npm test && npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html/inspect
COPY --from=build /app/public/landing.html /usr/share/nginx/html/landing.html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
HEALTHCHECK CMD wget -qO- http://localhost/healthz || exit 1
CMD ["nginx", "-g", "daemon off;"]
