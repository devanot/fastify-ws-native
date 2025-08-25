import fp from 'fastify-plugin';
import type { FastifyInstance, FastifyPluginCallback, FastifyRequest } from 'fastify';
import { WebSocketServer, WebSocket } from 'ws';
import { URL } from 'url';

// ---- Types -----------------------------------------------------------------

type OriginPolicy =
  | string[]
  | Set<string>
  | ((origin: string | undefined, req: FastifyRequest) => boolean | Promise<boolean>);

export interface WSVerifyInfo {
  headers: Record<string, string | string[] | undefined>;
  query: URLSearchParams;
  cookies: Record<string, string>;
  params: Record<string, any>;
  path: string;
  origin?: string;
  protocols: string[];
  ip?: string;
}

export type WSVerifyFn = (this: FastifyInstance, req: FastifyRequest, info: WSVerifyInfo)
  => boolean | void | Promise<boolean | void>;

export interface RouteWSOptions {
  websocket?: boolean;
  maxPayload?: number;
  wsOptions?: ConstructorParameters<typeof WebSocketServer>[0];
  jwtVerify?: boolean;
  extractToken?: (req: FastifyRequest, info: WSVerifyInfo) => string | Promise<string>;
  allowedOrigins?: OriginPolicy;
  wsVerify?: WSVerifyFn | WSVerifyFn[];
  maxConnections?: number;
  idleTimeoutMs?: number;
  heartbeatIntervalMs?: number;
  selectProtocol?: (protocols: string[], req: FastifyRequest) => string | false;
  highWaterMarkBytes?: number;
}

declare module 'fastify' {
  interface FastifyInstance {
    setWebSocketOriginPolicy(policy: OriginPolicy): void;
    wsBroadcast(path: string, data: string | Buffer | ArrayBufferView, opts?: { binary?: boolean; filter?: (ws: WebSocket) => boolean }): number;
    getWebSocketRoute(path: string): RouteContext | undefined;
    _wsOriginPolicy?: OriginPolicy;
    _wsRoutes?: Map<string, RouteContext>;
  }

  interface RouteShorthandOptions {
    websocket?: boolean;
    maxPayload?: number;
    wsOptions?: ConstructorParameters<typeof WebSocketServer>[0];
    jwtVerify?: boolean;
    extractToken?: (req: FastifyRequest, info: WSVerifyInfo) => string | Promise<string>;
    allowedOrigins?: OriginPolicy;
    wsVerify?: WSVerifyFn | WSVerifyFn[];
    maxConnections?: number;
    idleTimeoutMs?: number;
    heartbeatIntervalMs?: number;
    selectProtocol?: (protocols: string[], req: FastifyRequest) => string | false;
    highWaterMarkBytes?: number;
  }
}

export interface RouteContext {
  path: string;
  wss: WebSocketServer;
  clients: Set<WebSocket>;
  options: Required<Pick<RouteWSOptions, 'maxPayload'>> & Partial<RouteWSOptions>;
  heartbeatTimer?: NodeJS.Timer;
}

// ---- Utils ------------------------------------------------------------------

function writeHttpAndDestroy(sock: any, status: number, reason?: string) {
  try {
    const msg = reason ? ` ${reason}` : '';
    sock.write(`HTTP/1.1 ${status}${msg}\r\nConnection: close\r\n\r\n`);
  } catch {}
  try { sock.destroy(); } catch {}
}

function parseCookiesHeader(header: string | undefined): Record<string, string> {
  if (!header) return {};
  const out: Record<string, string> = {};
  for (const part of header.split(';')) {
    const [k, ...rest] = part.split('=');
    if (!k) continue;
    out[k.trim()] = decodeURIComponent(rest.join('=').trim());
  }
  return out;
}

function asSet(arrOrSet?: string[] | Set<string>): Set<string> | undefined {
  if (!arrOrSet) return undefined;
  return arrOrSet instanceof Set ? arrOrSet : new Set(arrOrSet);
}

async function originAllowed(policy: OriginPolicy | undefined, origin: string | undefined, req: FastifyRequest) {
  if (!policy) return true;
  if (typeof policy === 'function') return !!(await policy(origin, req));
  const set = asSet(policy);
  if (!origin) return false;
  return set!.has(origin);
}

function attachSafeSend(ws: WebSocket, highWaterMarkBytes?: number) {
  (ws as any).safeSend = (data: any, opts?: { binary?: boolean }) => {
    if (ws.readyState !== ws.OPEN) return false;
    if (typeof highWaterMarkBytes === 'number' && ws.bufferedAmount > highWaterMarkBytes) return false;
    ws.send(data, { binary: opts?.binary });
    return true;
  };
}

// ---- Plugin -----------------------------------------------------------------

const wsPlugin: FastifyPluginCallback = function (fastify, pluginOpts, pluginDone) {
  fastify.decorate('_wsRoutes', new Map<string, RouteContext>());
  fastify.decorate('setWebSocketOriginPolicy', function (policy: OriginPolicy) {
    this._wsOriginPolicy = policy;
  });
  fastify.decorate('getWebSocketRoute', function (path: string) {
    return this._wsRoutes!.get(path);
  });
  fastify.decorate('wsBroadcast', function (path: string, data: any, opts?: { binary?: boolean; filter?: (ws: WebSocket) => boolean }) {
    const ctx = this._wsRoutes!.get(path);
    if (!ctx) return 0;
    let sent = 0;
    for (const ws of ctx.clients) {
      if (ws.readyState !== ws.OPEN) continue;
      if (opts?.filter && !opts.filter(ws)) continue;
      try { ws.send(data, { binary: !!opts?.binary }); sent++; } catch {}
    }
    return sent;
  });

  fastify.addHook('onClose', (instance, done) => {
    const map = instance._wsRoutes!;
    for (const ctx of map.values()) {
      try { clearInterval(ctx.heartbeatTimer as any); } catch {}
      try { ctx.wss.close(); } catch {}
      ctx.clients.clear();
    }
    map.clear();
    done();
  });

  // process websocket routes
  const processRoute = (routeOpts: any) => {
    if (!routeOpts.websocket) return;
    if(routeOpts.method != 'GET' && routeOpts.method != 'HEAD'){
      throw new Error('Websockets only work on GET and HEAD methods.');
    };

    const fullPath = routeOpts.path ?? routeOpts.url;
    const userHandler = routeOpts.handler as (ws: WebSocket, req: FastifyRequest) => void;

    const rtOpts: RouteWSOptions = routeOpts;
    const maxPayload = rtOpts.maxPayload ?? 100 * 1024;
    const highWaterMarkBytes = rtOpts.highWaterMarkBytes ?? 512 * 1024;
    const heartbeatIntervalMs = rtOpts.heartbeatIntervalMs ?? 0;
    const selectProtocol = rtOpts.selectProtocol;

    const wss = new WebSocketServer({
      noServer: true,
      maxPayload,
      handleProtocols: selectProtocol ? (protocols: Set<string>, rawReq: any) => {
        const arr = Array.from(protocols);
        const req = (rawReq as any).__fastifyRequest || rawReq;
        const chosen = selectProtocol(arr, req);
        return chosen || false;
      } : undefined,
      ...rtOpts.wsOptions,
    });

    const ctx: RouteContext = {
      path: fullPath,
      wss,
      clients: new Set<WebSocket>(),
      options: { maxPayload, ...rtOpts },
    };

    if (heartbeatIntervalMs > 0) {
      ctx.heartbeatTimer = setInterval(() => {
        for (const ws of ctx.clients) {
          const anyWs = ws as any;
          if (anyWs._isAlive === false) {
            try { ws.terminate(); } catch { }
            continue;
          }
          anyWs._isAlive = false;
          try { ws.ping(); } catch { }
        }
      }, heartbeatIntervalMs).unref?.();
    }

    fastify._wsRoutes!.set(fullPath, ctx);

    routeOpts.handler = async function (req: FastifyRequest, reply: any) {
      reply.hijack();

      const origin = (req.headers.origin as string | undefined) || undefined;
      const ip = (req.raw.socket.remoteAddress as string | undefined) || undefined;
      const base = `http://${req.headers.host || 'localhost'}`;
      const url = new URL(req.url, base);
      const query = url.searchParams;

      const cookies = (req as any).cookies ?? parseCookiesHeader(req.headers.cookie as string | undefined);
      const protocols = ((req.headers['sec-websocket-protocol'] as string | undefined)?.split(',').map(s => s.trim()).filter(Boolean)) ?? [];

      const info: WSVerifyInfo = {
        headers: req.headers as any,
        query,
        cookies,
        params: (req.params as any) ?? {},
        path: fullPath,
        origin,
        protocols,
        ip,
      };

      const policy = rtOpts.allowedOrigins ?? fastify._wsOriginPolicy;
      if (!(await originAllowed(policy, origin, req))) {
        writeHttpAndDestroy(req.raw.socket, 403, 'Forbidden');
        return;
      }

      const verifyFns: WSVerifyFn[] = Array.isArray(rtOpts.wsVerify) ? rtOpts.wsVerify : (rtOpts.wsVerify ? [rtOpts.wsVerify] : []);
      for (const verify of verifyFns) {
        try {
          const res = await verify.call(this, req, info);
          if (res === false) {
            writeHttpAndDestroy(req.raw.socket, 403, 'Forbidden');
            return;
          }
        } catch {
          writeHttpAndDestroy(req.raw.socket, 400, 'Bad Request');
          return;
        }
      }

      if ((fastify as any).jwt && rtOpts.jwtVerify !== false) {
        try {
          const token = rtOpts.extractToken
            ? await rtOpts.extractToken(req, info)
            : (() => {
              const auth = (req.headers.authorization as string | undefined) || '';
              if (auth.startsWith('Bearer ')) return auth.slice(7);
              if (query.has('token')) return query.get('token')!;
              if (cookies.token) return cookies.token;
              return '';
            })();
          if (!token) throw new Error('No token');
          (req as any).user = await (fastify as any).jwt.verify(token);
        } catch {
          writeHttpAndDestroy(req.raw.socket, 401, 'Unauthorized');
          return;
        }
      }

      if (typeof rtOpts.maxConnections === 'number' && ctx.clients.size >= rtOpts.maxConnections) {
        writeHttpAndDestroy(req.raw.socket, 503, 'Service Unavailable');
        return;
      }

      (req.raw as any).__fastifyRequest = req;

      wss.handleUpgrade(req.raw, req.raw.socket, Buffer.alloc(0), (ws: WebSocket) => {
        ctx.clients.add(ws);

        (ws as any).user = (req as any).user;
        (ws as any).params = req.params;
        (ws as any).query = Object.fromEntries(query.entries());
        (ws as any).ip = ip;
        (ws as any)._isAlive = true;

        attachSafeSend(ws, highWaterMarkBytes);

        let idleTimer: NodeJS.Timeout | undefined;
        const idleMs = rtOpts.idleTimeoutMs;
        const resetIdle = () => {
          if (!idleMs) return;
          if (idleTimer) clearTimeout(idleTimer);
          idleTimer = setTimeout(() => {
            try { ws.close(1001, 'Idle timeout'); } catch { }
          }, idleMs).unref?.();
        };
        resetIdle();

        ws.on('pong', () => { (ws as any)._isAlive = true; });
        ws.on('message', () => resetIdle());
        ws.on('close', () => {
          ctx.clients.delete(ws);
          try { if (idleTimer) clearTimeout(idleTimer); } catch { }
          (ws as any).user = undefined;
          (ws as any).params = undefined;
          (ws as any).query = undefined;
        });
        ws.on('error', () => { });

        userHandler(ws, req);
      });
    };
  };

  fastify.addHook('onRoute', processRoute);

  pluginDone();
};

export default fp(wsPlugin, { 
  name: 'fastify-ws-native',
  // fastify: '5.x'
});
// export default wsPlugin;
