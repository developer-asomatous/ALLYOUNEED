import { FastifyInstance } from 'fastify';
import fs from 'fs';

const COOKIES_PATH = '/tmp/yt-cookies.txt';
const UPLOAD_SECRET = process.env.COOKIE_SECRET || 'ayn-cookie-upload-2026';

export async function cookieRoute(server: FastifyInstance) {
  // Upload cookies (protected by secret)
  server.post('/cookies', async (req, reply) => {
    const body = req.body as { secret?: string; cookies?: string };
    
    if (!body.secret || body.secret !== UPLOAD_SECRET) {
      return reply.status(403).send({ error: 'Invalid secret' });
    }
    
    if (!body.cookies || !body.cookies.trim()) {
      return reply.status(400).send({ error: 'No cookie data provided' });
    }
    
    try {
      // Write cookie data (Netscape format)
      fs.writeFileSync(COOKIES_PATH, body.cookies.replace(/\\n/g, '\n'));
      return { status: 'ok', message: 'Cookies uploaded successfully', size: body.cookies.length };
    } catch (e: any) {
      return reply.status(500).send({ error: 'Failed to write cookies', details: e.message });
    }
  });
  
  // Check if cookies exist
  server.get('/cookies/status', async () => {
    const exists = fs.existsSync(COOKIES_PATH);
    const size = exists ? fs.statSync(COOKIES_PATH).size : 0;
    return { 
      hasCookies: exists && size > 0,
      size,
    };
  });
}
