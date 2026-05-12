import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { infoRoute } from './routes/info';
import { downloadRoute } from './routes/download';
import { statusRoute } from './routes/status';
import { streamRoute } from './routes/stream';
import { jobCleanupRoute } from './routes/cleanup';
import { entitlementRoute } from './routes/entitlement';
import { cookieRoute } from './routes/cookies';

import { getYtdlpVersion, isFfmpegAvailable } from './services/ytdlp';
import { isAria2cAvailable } from './services/accelerator';

const server = Fastify({
  logger: true,
});

async function checkDependencies() {
  server.log.info('🔍 Checking system dependencies...');
  
  const errors: string[] = [];

  // 1. yt-dlp (Critical)
  try {
    const version = getYtdlpVersion();
    server.log.info(`✅ yt-dlp: ${version}`);
  } catch (e: any) {
    errors.push(`❌ yt-dlp NOT FOUND: ${e.message}`);
  }

  // 2. ffmpeg (Critical for Audio)
  if (isFfmpegAvailable()) {
    server.log.info('✅ ffmpeg: Available');
  } else {
    errors.push('❌ ffmpeg NOT FOUND: Required for merging video and audio.');
  }

  // 3. aria2c (Critical for Speed & Magnets)
  if (isAria2cAvailable()) {
    server.log.info('✅ aria2c: Available');
  } else {
    errors.push('❌ aria2c NOT FOUND: Required for 16x speed and Magnet links.');
  }

  if (errors.length > 0) {
    server.log.error('🛑 FATAL: Missing dependencies. Server cannot start.');
    errors.forEach(err => server.log.error(err));
    server.log.error('Please install missing tools: brew install yt-dlp ffmpeg aria2');
    process.exit(1);
  }
}

async function start() {
  await checkDependencies();
  // CORS — allow all origins for dev
  await server.register(cors, {
    origin: '*',
    methods: ['GET', 'POST', 'DELETE'],
  });

  // Rate limiting
  await server.register(rateLimit, {
    max: 60,
    timeWindow: '1 minute',
  });

  // Health check with capabilities
  server.get('/health', async () => ({
    status: 'ok',
    app: 'ALLYOUNEED',
    version: '1.1.0',
    timestamp: new Date().toISOString(),
    capabilities: {
      aria2c: true,
      multiConnection: 16,
      rangeRequests: true,
      torrent: true,
      torrentTrackers: 20,
      maxConcurrentJobs: 3,
    },
  }));

  // API routes
  await server.register(infoRoute, { prefix: '/v1' });
  await server.register(downloadRoute, { prefix: '/v1' });
  await server.register(statusRoute, { prefix: '/v1' });
  await server.register(streamRoute, { prefix: '/v1' });
  await server.register(jobCleanupRoute, { prefix: '/v1' });
  await server.register(entitlementRoute, { prefix: '/v1' });
  await server.register(cookieRoute, { prefix: '/v1' });

  const port = parseInt(process.env.PORT || '3000', 10);
  const host = process.env.HOST || '0.0.0.0';

  try {
    await server.listen({ port, host });
    server.log.info(`🚀 ALLYOUNEED Backend running at http://${host}:${port}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
}

start();
