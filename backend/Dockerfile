FROM node:20-slim

RUN apt-get update && apt-get install -y python3 python3-pip ffmpeg curl && \
    pip3 install yt-dlp --break-system-packages && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

RUN mkdir -p /tmp/ayn-downloads

EXPOSE 3000
CMD ["node", "dist/server.js"]
