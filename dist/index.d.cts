import { FastifyRequest, FastifyInstance, FastifyPluginCallback } from 'fastify';
import { WebSocket, WebSocketServer } from 'ws';

type OriginPolicy = string[] | Set<string> | ((origin: string | undefined, req: FastifyRequest) => boolean | Promise<boolean>);
interface WSVerifyInfo {
    headers: Record<string, string | string[] | undefined>;
    query: URLSearchParams;
    cookies: Record<string, string>;
    params: Record<string, any>;
    path: string;
    origin?: string;
    protocols: string[];
    ip?: string;
}
type WSVerifyFn = (this: FastifyInstance, req: FastifyRequest, info: WSVerifyInfo) => boolean | void | Promise<boolean | void>;
interface RouteWSOptions {
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
        wsBroadcast(path: string, data: string | Buffer | ArrayBufferView, opts?: {
            binary?: boolean;
            filter?: (ws: WebSocket) => boolean;
        }): number;
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
interface RouteContext {
    path: string;
    wss: WebSocketServer;
    clients: Set<WebSocket>;
    options: Required<Pick<RouteWSOptions, 'maxPayload'>> & Partial<RouteWSOptions>;
    heartbeatTimer?: NodeJS.Timer;
}
declare const _default: FastifyPluginCallback;

export { type RouteContext, type RouteWSOptions, type WSVerifyFn, type WSVerifyInfo, _default as default };
