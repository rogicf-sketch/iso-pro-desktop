FROM node:22-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    fonts-noto \
    fonts-noto-cjk \
    ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY services/pdf-worker/package.json services/pdf-worker/package-lock.json* ./
RUN npm install --omit=dev

RUN npx playwright install --with-deps chromium

COPY services/pdf-worker/dist ./dist
COPY services/pdf-worker/fonts ./fonts
COPY public/fonts ./fonts-fallback

ENV PDF_WORKER_POLL_MS=2000
ENV PDF_WORKER_FONTS_DIR=/app/fonts
CMD ["node", "dist/index.mjs"]
