// examples/server.ts

import Fastify from 'fastify';
import jwtPlugin from '@fastify/jwt';
import wsPlugin from 'fastify-ws-native';

const app = Fastify({ logger: true });
app.register(jwtPlugin, { secret: 'dev-secret' });
app.register(wsPlugin);

// Global origin policy
app.setWebSocketOriginPolicy((origin) => !origin || origin.startsWith('http://localhost'));

app.get('/token/:user', async (req: any) => {
  return { token: app.jwt.sign({ sub: req.params.user, role: 'user' }) };
});

app.get('/chat', {
  websocket: true,
  maxConnections: 1000,
  heartbeatIntervalMs: 20_000,
  idleTimeoutMs: 120_000,
  selectProtocol: (protocols) => protocols.includes('json') ? 'json' : false,
  wsVerify: async (req, info) => info.query.get('version') === '1',
}, (ws: any, req) => {
  ws.safeSend?.(JSON.stringify({ hello: req.user?.sub ?? 'guest' }), { binary: false });
  ws.on('message', (buf: Buffer) => {
    ws.safeSend?.(JSON.stringify({ you: buf.toString() }));
  });
});

app.get('/public', { websocket: true, jwtVerify: false }, (ws) => {
  ws.send('public ok');
});

app.get('/api/health', async (_, reply) => reply.code(204).send());

app.listen({ port: 3000, host: '0.0.0.0' });
