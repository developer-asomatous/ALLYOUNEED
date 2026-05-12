import { FastifyInstance } from 'fastify';
import { getJobStatus } from '../services/queue';
import fs from 'fs';
import path from 'path';

/**
 * ═══════════════════════════════════════════════════
 *  AYN Stream Route v2 — HTTP Range Support
 * ═══════════════════════════════════════════════════
 *
 *  Why Range requests matter for speed:
 *
 *  1. RESUME: If a download breaks at 80%, the mobile
 *     resends with Range: bytes=80%-end and gets only
 *     the remaining 20%.
 *
 *  2. PARALLEL FETCH: The mobile can open 4 connections
 *     each requesting a different byte range:
 *     Connection 1: Range: bytes=0-25%
 *     Connection 2: Range: bytes=25%-50%
 *     Connection 3: Range: bytes=50%-75%
 *     Connection 4: Range: bytes=75%-100%
 *     Then merge locally. 4x effective throughput.
 *
 *  3. SEEK: The video player can seek to any position
 *     without downloading the entire file first.
 */

const MIME_MAP: Record<string, string> = {
  mp4: 'video/mp4',
  mkv: 'video/x-matroska',
  webm: 'video/webm',
  mov: 'video/quicktime',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  flac: 'audio/flac',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  bmp: 'image/bmp',
  tiff: 'image/tiff',
  ico: 'image/x-icon',
  avi: 'video/x-msvideo',
  ts: 'video/mp2t',
  flv: 'video/x-flv',
  wmv: 'video/x-ms-wmv',
  wma: 'audio/x-ms-wma',
  opus: 'audio/opus',
};

export async function streamRoute(server: FastifyInstance) {
  server.get('/stream/:jobId', async (request, reply) => {
    const { jobId } = request.params as { jobId: string };

    const status = getJobStatus(jobId);
    if (!status) {
      return reply.status(404).send({ error: 'Job not found' });
    }

    if ((status.status !== 'done' && status.status !== 'downloading') || !status.filePath) {
      return reply.status(400).send({ error: 'Download not ready' });
    }

    if (!fs.existsSync(status.filePath)) {
      return reply.status(404).send({ error: 'File not found (expired)' });
    }

    const stat = fs.statSync(status.filePath);
    // Use the final totalSize from source if we have it, otherwise current size
    const totalSize = status.totalSize || stat.size;
    const ext = path.extname(status.filePath).slice(1).toLowerCase();
    const contentType = MIME_MAP[ext] || 'application/octet-stream';
    const filename = `ayn_${jobId}.${ext}`;

    // ── Check for Range header ──
    const rangeHeader = request.headers.range;

    if (rangeHeader) {
      // Parse range: "bytes=START-END" or "bytes=START-"
      const match = rangeHeader.match(/bytes=(\d+)-(\d*)/);
      if (!match) {
        reply.status(416).send({ error: 'Invalid Range header' });
        return;
      }

      const start = parseInt(match[1], 10);
      const end = match[2] ? parseInt(match[2], 10) : totalSize - 1;

      // Validate range
      if (start >= totalSize || end >= totalSize || start > end) {
        reply.status(416)
          .header('Content-Range', `bytes */${totalSize}`)
          .send({ error: 'Range Not Satisfiable' });
        return;
      }

      const chunkSize = end - start + 1;

      // 206 Partial Content
      reply
        .status(206)
        .header('Content-Range', `bytes ${start}-${end}/${totalSize}`)
        .header('Accept-Ranges', 'bytes')
        .header('Content-Length', chunkSize)
        .header('Content-Type', contentType)
        .header('Content-Disposition', `attachment; filename="${filename}"`)
        .header('Cache-Control', 'no-cache');

      const stream = fs.createReadStream(status.filePath, { start, end });
      return reply.send(stream);
    }

    // ── Full file response (no Range header) ──
    reply
      .header('Content-Disposition', `attachment; filename="${filename}"`)
      .header('Content-Type', contentType)
      .header('Content-Length', totalSize)
      .header('Accept-Ranges', 'bytes')         // Tell client we support ranges
      .header('Cache-Control', 'no-cache');

    const stream = fs.createReadStream(status.filePath);
    return reply.send(stream);
  });
}
