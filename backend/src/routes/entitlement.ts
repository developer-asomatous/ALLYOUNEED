import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

/**
 * ═══════════════════════════════════════
 *  Entitlement API — Server-side Quota
 * ═══════════════════════════════════════
 *
 * Anti-cheat: All quota state lives on the server, keyed by device UUID.
 * The client state is a cache. Download requests verify server-side quota.
 *
 * Endpoints:
 *   GET  /entitlement/status?userId=xxx
 *   POST /entitlement/ad-watched
 */

// ── In-memory entitlement store (per-process; replace with Redis/DB for production) ──
interface UserEntitlement {
  dailyDownloadsUsed: number;
  dailyUnlockAdsWatched: number;
  dailyUnlockActive: boolean;
  farmProgress: number;
  weekPassActive: boolean;
  weekPassExpiresAt: number | null; // Unix timestamp ms
  totalAdsWatched: number;
  totalDownloads: number;
  lastResetDate: string; // YYYY-MM-DD
}

const entitlements = new Map<string, UserEntitlement>();

const FREE_DAILY_LIMIT = 3;
const ADS_FOR_DAILY_UNLOCK = 2;
const ADS_FOR_WEEKLY_UNLOCK = 20;
const WEEKLY_UNLOCK_DAYS = 7;

function getTodayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getOrCreate(userId: string): UserEntitlement {
  if (!entitlements.has(userId)) {
    entitlements.set(userId, {
      dailyDownloadsUsed: 0,
      dailyUnlockAdsWatched: 0,
      dailyUnlockActive: false,
      farmProgress: 0,
      weekPassActive: false,
      weekPassExpiresAt: null,
      totalAdsWatched: 0,
      totalDownloads: 0,
      lastResetDate: getTodayStr(),
    });
  }

  const ent = entitlements.get(userId)!;

  // Reset daily counters if new day
  const today = getTodayStr();
  if (ent.lastResetDate !== today) {
    ent.dailyDownloadsUsed = 0;
    ent.dailyUnlockAdsWatched = 0;
    ent.dailyUnlockActive = false;
    ent.lastResetDate = today;
  }

  // Check if week pass expired
  if (ent.weekPassExpiresAt && Date.now() > ent.weekPassExpiresAt) {
    ent.weekPassActive = false;
    ent.weekPassExpiresAt = null;
  }

  return ent;
}

export async function entitlementRoute(server: FastifyInstance) {
  // ── GET /entitlement/status ──
  server.get(
    '/entitlement/status',
    {
      schema: {
        querystring: {
          type: 'object',
          required: ['userId'],
          properties: {
            userId: { type: 'string' },
          },
        },
      },
    },
    async (request: FastifyRequest<{ Querystring: { userId: string } }>, reply: FastifyReply) => {
      const { userId } = request.query;
      const ent = getOrCreate(userId);

      return {
        dailyDownloadsUsed: ent.dailyDownloadsUsed,
        dailyUnlockActive: ent.dailyUnlockActive,
        dailyUnlockAdsWatched: ent.dailyUnlockAdsWatched,
        weekPassActive: ent.weekPassActive,
        weekPassExpiresAt: ent.weekPassExpiresAt,
        farmProgress: ent.farmProgress,
        canDownload: ent.weekPassActive ||
          ent.dailyDownloadsUsed < FREE_DAILY_LIMIT ||
          ent.dailyUnlockActive,
        totalDownloads: ent.totalDownloads,
        totalAdsWatched: ent.totalAdsWatched,
      };
    }
  );

  // ── POST /entitlement/ad-watched ──
  server.post(
    '/entitlement/ad-watched',
    {
      schema: {
        body: {
          type: 'object',
          required: ['userId', 'adType'],
          properties: {
            userId: { type: 'string' },
            adType: { type: 'string', enum: ['daily_unlock', 'farm'] },
            adToken: { type: 'string' }, // For future AdMob verification
          },
        },
      },
    },
    async (
      request: FastifyRequest<{
        Body: { userId: string; adType: 'daily_unlock' | 'farm'; adToken?: string };
      }>,
      reply: FastifyReply
    ) => {
      const { userId, adType } = request.body;
      const ent = getOrCreate(userId);

      // TODO: Verify adToken with AdMob server-to-server callback for anti-cheat

      ent.totalAdsWatched++;

      if (adType === 'daily_unlock') {
        ent.dailyUnlockAdsWatched++;
        if (ent.dailyUnlockAdsWatched >= ADS_FOR_DAILY_UNLOCK) {
          ent.dailyUnlockActive = true;
        }
      }

      if (adType === 'farm') {
        ent.farmProgress++;
        if (ent.farmProgress >= ADS_FOR_WEEKLY_UNLOCK) {
          ent.weekPassActive = true;
          ent.weekPassExpiresAt = Date.now() + WEEKLY_UNLOCK_DAYS * 24 * 60 * 60 * 1000;
          ent.farmProgress = 0; // Reset for next farm cycle
        }
      }

      return {
        dailyUnlockAdsWatched: ent.dailyUnlockAdsWatched,
        dailyUnlockActive: ent.dailyUnlockActive,
        farmProgress: ent.farmProgress,
        weekPassActive: ent.weekPassActive,
        weekPassExpiresAt: ent.weekPassExpiresAt,
      };
    }
  );

  // ── POST /entitlement/record-download ──
  server.post(
    '/entitlement/record-download',
    {
      schema: {
        body: {
          type: 'object',
          required: ['userId'],
          properties: {
            userId: { type: 'string' },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{ Body: { userId: string } }>,
      reply: FastifyReply
    ) => {
      const { userId } = request.body;
      const ent = getOrCreate(userId);

      // Check if download is allowed
      const canDownload =
        ent.weekPassActive ||
        ent.dailyDownloadsUsed < FREE_DAILY_LIMIT ||
        ent.dailyUnlockActive;

      if (!canDownload) {
        return reply.status(403).send({
          error: 'QUOTA_EXCEEDED',
          message: 'Daily download limit reached. Watch ads to unlock.',
          dailyDownloadsUsed: ent.dailyDownloadsUsed,
        });
      }

      ent.dailyDownloadsUsed++;
      ent.totalDownloads++;

      return {
        success: true,
        dailyDownloadsUsed: ent.dailyDownloadsUsed,
        remainingFree: Math.max(0, FREE_DAILY_LIMIT - ent.dailyDownloadsUsed),
      };
    }
  );
}
