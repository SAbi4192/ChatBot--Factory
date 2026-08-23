# Universal Chatbot Factory — backend image
# Optional path: `docker compose up` runs app + postgres + llm.
# The primary demo launcher remains start_all.bat.
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci --ignore-scripts || npm install
COPY . .
RUN npx prisma generate
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts || npm install --omit=dev
COPY --from=build /app/backend ./backend
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/dist ./dist
COPY --from=build /app/scripts ./scripts
RUN mkdir -p data
EXPOSE 3001
HEALTHCHECK --interval=15s --timeout=3s --retries=5 \
  CMD wget -qO- http://localhost:3001/api/health || exit 1
CMD ["node", "backend/server.js"]
