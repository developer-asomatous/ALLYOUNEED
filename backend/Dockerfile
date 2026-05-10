FROM node:20-slim

# Install system deps: yt-dlp, aria2c, ffmpeg
RUN apt-get update && apt-get install -y \
    python3 python3-pip ffmpeg curl aria2 \
    --no-install-recommends && \
    pip3 install yt-dlp --break-system-packages && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

COPY . .
RUN npm run build

RUN mkdir -p /tmp/ayn-downloads

EXPOSE 3000
ENV PORT=3000
ENV HOST=0.0.0.0
CMD ["node", "dist/server.js"]
