import { FastifyInstance } from 'fastify';
import { fetchMediaInfo } from '../services/ytdlp';
import { isTorrentInput, fetchTorrentInfo } from '../services/torrent';

const URL_REGEX = /^https?:\/\/.+/;
const MAGNET_REGEX = /^magnet:\?/;
const INFOHASH_REGEX = /^[a-fA-F0-9]{40}$/;

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
      // Route to torrent engine if magnet/torrent/infohash
      if (isTorrentInput(url)) {
        const info = await fetchTorrentInfo(url);
        return reply.send(info);
      }

      // Regular URL → yt-dlp
      const info = await fetchMediaInfo(url);
      return reply.send(info);
    } catch (err: any) {
      server.log.error(`Info fetch failed: ${err.message}`);
      return reply.status(500).send({
        error: 'Failed to fetch media info',
        details: err.message,
      });
    }
  });
}
