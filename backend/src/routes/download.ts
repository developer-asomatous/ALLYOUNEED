import { FastifyInstance } from 'fastify';
import { createDownloadJob } from '../services/queue';

export async function downloadRoute(server: FastifyInstance) {
  server.post('/download', {
    schema: {
      body: {
        type: 'object',
        required: ['url'],
        properties: {
          url: { type: 'string' },
          formatId: { type: 'string' },
          outputFormat: { type: 'string' },
          audioOnly: { type: 'boolean' },
          audioQuality: { type: 'string' },
          imageOnly: { type: 'boolean' },
          fileIndex: { type: 'number' },
        },
      },
    },
  }, async (request, reply) => {
    const body = request.body as {
      url: string;
      formatId?: string;
      outputFormat?: string;
      audioOnly?: boolean;
      audioQuality?: string;
      imageOnly?: boolean;
      fileIndex?: number;
    };

    try {
      const { jobId } = await createDownloadJob(body);
      return reply.send({ jobId });
    } catch (err: any) {
      server.log.error(`Download job creation failed: ${err.message}`);
      return reply.status(500).send({
        error: 'Failed to create download job',
        details: err.message,
      });
    }
  });
}
