# ALLYOUNEED (AYN)

> **Paste. Pick. Pull.** — Download any media from any platform.

A cross-platform media downloader app that lets you paste any video/audio URL and download it in your preferred format and quality.

## 🎯 Supported Platforms

| Platform | Content Types |
|----------|--------------|
| YouTube | Videos, Shorts, Playlists, Live |
| Instagram | Posts, Reels, Stories, Carousels |
| TikTok | Videos, Slideshows |
| Twitter/X | Videos, GIFs |
| Facebook | Videos, Reels |
| Reddit | Videos, GIFs |
| Vimeo | Videos |
| SoundCloud | Audio tracks |
| Twitch | Clips, VODs |

## 🎬 Output Formats

- **Video:** MP4, MKV, WebM, MOV (144p → 8K)
- **Audio:** MP3, AAC, FLAC, WAV, OGG, M4A (64kbps → 320kbps)

## 🏗 Architecture

```
Mobile App (React Native/Expo)
       │  HTTPS
       ▼
Backend (Fastify + BullMQ)
       │
       ├── yt-dlp (download engine)
       ├── Redis (job queue)
       └── /tmp or R2 (file storage)
```

## 📁 Project Structure

```
allyouneed/
├── backend/              # Node.js Fastify backend
│   ├── src/
│   │   ├── routes/       # API endpoints
│   │   ├── services/     # yt-dlp wrapper, queue
│   │   ├── utils/        # Helpers
│   │   └── server.ts     # Entry point
│   ├── Dockerfile
│   ├── docker-compose.yml
│   └── package.json
│
└── mobile/               # React Native Expo app
    ├── app/
    │   ├── (tabs)/
    │   │   ├── index.tsx      # Home — paste URL
    │   │   ├── downloads.tsx  # Download history
    │   │   └── settings.tsx   # Preferences
    │   └── _layout.tsx
    ├── store/             # Zustand state
    ├── services/          # API client
    ├── utils/             # Helpers
    ├── constants/         # Theme & config
    └── package.json
```

## 🚀 Getting Started

### Backend

```bash
cd backend
npm install
# Requires Redis running locally
npm run dev
```

### Docker (Backend)

```bash
cd backend
docker-compose up -d
```

### Mobile App

```bash
cd mobile
npm install
npx expo start
```

## 🔌 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/v1/info` | Fetch media metadata |
| POST | `/v1/download` | Queue a download job |
| GET | `/v1/status/:jobId` | Poll job progress |
| GET | `/v1/stream/:jobId` | Stream completed file |
| DELETE | `/v1/job/:jobId` | Cancel/cleanup job |

## ⚠️ Legal

This app is for **personal use** of content you have the right to download. Downloading copyrighted content without permission may violate platform terms of service and applicable laws.

---

*Built with 💜 by AYN*
