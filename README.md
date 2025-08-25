# fastify-ws-native

Fastify-first WebSocket plugin using `ws`, with native route ergonomics:

```js
fastify.get('/chat', { websocket: true }, (socket, req) => {
  socket.send('hello');
});

---

## Why

- Keep Fastify hooks/encapsulation/decorators.
- Per-route WebSocket servers and options.
- Works with @fastify/jwt, origin policy, custom wsVerify hooks.
- Production hygiene: heartbeats, idle timeouts, backpressure guards, clean shutdown.


---

## Install
```bash
npm i fastify-ws-native ws fastify
# optional
npm i @fastify/jwt

```

---


## Usage
```bash
import Fastify from 'fastify';
import wsPlugin from 'fastify-ws-native';
import fastifyJWT from '@fastify/jwt';

const app = Fastify({ logger: true });

app.register(fastifyJWT, { secret: process.env.JWT_SECRET! });
app.register(wsPlugin);

app.setWebSocketOriginPolicy(['http://localhost:3000', 'https://myapp.com']);

app.get('/chat', {
  websocket: true,
  maxPayload: 1024 * 1024,
  heartbeatIntervalMs: 30_000,
}, (socket, req) => {
  socket.send(`Hi ${req.user?.sub ?? 'guest'}`);
  socket.on('message', (msg) => socket.send(`Echo: ${msg}`));
});

await app.listen({ port: 3000 });

```

---


## Route options

- maxPayload (bytes),
- wsOptions (passed to WebSocketServer), 
- jwtVerify (default true if @fastify/jwt present), 
- extractToken(req, info), allowedOrigins (array/set/function), 
- wsVerify (fn or array), 
- maxConnections, 
- idleTimeoutMs, 
- heartbeatIntervalMs, 
- selectProtocol(protocols, req), 
- highWaterMarkBytes.


---


## Helpers

- app.setWebSocketOriginPolicy(policy) — global origin policy.
- app.wsBroadcast(path, data, { binary?, filter? }) — broadcast to clients of a path.
- app.getWebSocketRoute(path) — inspect a route context.


---


## Notes

- Node >= 18.
- Peer dependency ws >= 8.
- Works with Fastify v4 and v5.


---


