import { FastifyInstance } from 'fastify';
import { getJobStatus } from '../services/queue';

export async function statusRoute(server: FastifyInstance) {
  server.get('/status/:jobId', async (request, reply) => {
    const { jobId } = request.params as { jobId: string };

    const status = getJobStatus(jobId);
    if (!status) {
      return reply.status(404).send({ error: 'Job not found' });
    }

    return reply.send({
      status: status.status,
      progress: Math.round(status.progress * 10) / 10,
      speed: status.speed,
      eta: status.eta,
      downloadUrl: status.downloadUrl,
      error: status.error,
    });
  });
}
