import { FastifyInstance } from 'fastify';
import { removeJob, getJobStatus } from '../services/queue';

export async function jobCleanupRoute(server: FastifyInstance) {
  server.delete('/job/:jobId', async (request, reply) => {
    const { jobId } = request.params as { jobId: string };

    const status = getJobStatus(jobId);
    if (!status) {
      return reply.status(404).send({ error: 'Job not found' });
    }

    removeJob(jobId);
    return reply.send({ success: true, message: 'Job and file cleaned up' });
  });
}
