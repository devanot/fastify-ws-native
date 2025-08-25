// examples/server.ts

import Fastify from 'fastify';
import jwtPlugin from '@fastify/jwt';
import wsPlugin from 'fastify-ws-native';

const app = Fastify({ logger: true });
app.register(jwtPlugin, { secret: 'dev-secret' });
app.register(wsPlugin);

app.get('/token/:user', async (req) => {
  return { token: app.jwt.sign({ sub: req.params.user, role: 'user' }) };
});

// websocket routes
app.register( async (app) => {

  // Global origin policy
  app.setWebSocketOriginPolicy((origin) => !origin || ['http://localhost','localhost','127.0.0.1'].includes(origin.toLowerCase()) );

  app.get('/chat', {
    websocket: true,
    maxConnections: 1000,
    heartbeatIntervalMs: 20_000,
    idleTimeoutMs: 120_000,
    selectProtocol: (protocols) => protocols.includes('json') ? 'json' : false,
    wsVerify: async (req, info) => info.query.get('version') === '1',
  }, (websocket, req) => {
    
    websocket.safeSend?.(JSON.stringify({ hello: req.user?.sub ?? 'guest' }), { binary: false });
    websocket.on('message', (buf) => {
      websocket.safeSend?.(JSON.stringify({ you: buf.toString() }));
    });

  });

  app.get('/public', { websocket: true, jwtVerify: false }, (websocket) => {

    websocket.send('public ok');
    
  });

});

app.get('/api/health', async (_, reply) => reply.code(204).send());

app.listen({ port: 3000, host: '0.0.0.0' });
