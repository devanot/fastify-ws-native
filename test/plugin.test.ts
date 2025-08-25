import { describe, it, expect } from 'vitest';
import Fastify from 'fastify';
import wsPlugin from '../src';

describe('fastify-ws-native', () => {
  it('registers a ws route and exposes context', async () => {
    const app = Fastify();
    app.register(wsPlugin);
    app.register(async (app) => {
        app.get('/ws', { websocket: true }, () => { /* no-op */ });
    });    
    await app.ready();
    const ctx = app.getWebSocketRoute('/ws');
    expect(ctx).toBeTruthy();
    await app.close();
  });
});
