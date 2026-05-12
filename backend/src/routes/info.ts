import { FastifyInstance } from 'fastify';
import { fetchMediaInfo } from '../services/ytdlp';
import { isTorrentInput, fetchTorrentInfo } from '../services/torrent';
import { scrapeForumPage } from '../services/scraper';

const URL_REGEX = /^https?:\/\/.+/;
const MAGNET_REGEX = /^magnet:\?/;
const INFOHASH_REGEX = /^[a-fA-F0-9]{40}$/;

// Server-side info cache (avoids re-running yt-dlp for same URL)
const INFO_CACHE = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes
const CACHE_MAX_SIZE = 100;

function getCachedInfo(url: string): any | null {
  const entry = INFO_CACHE.get(url);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL) {
    INFO_CACHE.delete(url);
    return null;
  }
  return entry.data;
}

function setCachedInfo(url: string, data: any): void {
  // Evict oldest if at capacity
  if (INFO_CACHE.size >= CACHE_MAX_SIZE) {
    const oldest = INFO_CACHE.keys().next().value;
    if (oldest) INFO_CACHE.delete(oldest);
  }
  INFO_CACHE.set(url, { data, timestamp: Date.now() });
}

export async function infoRoute(server: FastifyInstance) {
  server.post('/info', {
    schema: {
      body: {
        type: 'object',
        required: ['url'],
        properties: {
          url: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const { url } = request.body as { url: string };

    if (!URL_REGEX.test(url) && !MAGNET_REGEX.test(url) && !INFOHASH_REGEX.test(url)) {
      return reply.status(400).send({ error: 'Invalid URL format. Supports: HTTP URLs, magnet links, and info hashes.' });
    }

    try {
      // Check cache first
      const cached = getCachedInfo(url);
      if (cached) {
        server.log.info(`Info cache hit: ${url}`);
        return reply.send(cached);
      }

      // 1. Direct Torrent/Magnet check
      if (isTorrentInput(url)) {
        const info = await fetchTorrentInfo(url);
        setCachedInfo(url, info);
        return reply.send(info);
      }

      // 2. Forum Scraper (e.g. 1TamilMV, TamilBlasters)
      if (url.includes('1tamilmv') || url.includes('tamilblasters') || url.includes('forum') || url.includes('topic')) {
        try {
          const info = await scrapeForumPage(url);
          setCachedInfo(url, info);
          return reply.send(info);
        } catch (e) {
          // If scraper fails, continue to yt-dlp
        }
      }

      // 3. Regular URL → yt-dlp
      try {
        const info = await fetchMediaInfo(url);
        setCachedInfo(url, info);
        return reply.send(info);
      } catch (err) {
        // Final fallback: try scraping ANY URL as a page for links
        const info = await scrapeForumPage(url);
        setCachedInfo(url, info);
        return reply.send(info);
      }
    } catch (err: any) {
      server.log.error(`Info fetch failed: ${err.message}`);
      return reply.status(500).send({
        error: 'Failed to fetch media info',
        details: err.message,
      });
    }
  });
}
