import { describe, it, expect } from 'vitest';
import Fastify from 'fastify';
import wsPlugin from '../src';

describe('fastify-ws-native', () => {
  it('registers a ws route and exposes context', async () => {
    
    console.log('Starting test: registers a ws route and exposes context');

    const startTime = Date.now();

    const app = Fastify();
    console.log(`Fastify instance created. (uptime: ${Date.now() - startTime}ms)`);

    app.register(wsPlugin);
    console.log(`wsPlugin registered. (uptime: ${Date.now() - startTime}ms)`);
    
    app.register(async (app) => {
        app.get('/ws', { websocket: true }, () => { /* no-op */ });
        console.log(`WebSocket route registered. (uptime: ${Date.now() - startTime}ms)`);
    });    

    await app.ready();
    console.log(`Fastify app is ready. (uptime: ${Date.now() - startTime}ms)`);
    
    const ctx = app.getWebSocketRoute('/ws');
    console.log(`WebSocket route context retrieved. (uptime: ${Date.now() - startTime}ms)`);

    expect(ctx).toBeTruthy();
    console.log(`Test completed successfully. (total uptime: ${Date.now() - startTime}ms)`);

    await app.close();
  });
});
