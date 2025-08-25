var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// node_modules/fastify-plugin/lib/getPluginName.js
var require_getPluginName = __commonJS({
  "node_modules/fastify-plugin/lib/getPluginName.js"(exports, module) {
    "use strict";
    var fpStackTracePattern = /at\s{1}(?:.*\.)?plugin\s{1}.*\n\s*(.*)/;
    var fileNamePattern = /(\w*(\.\w*)*)\..*/;
    module.exports = function getPluginName(fn) {
      if (fn.name.length > 0) return fn.name;
      const stackTraceLimit = Error.stackTraceLimit;
      Error.stackTraceLimit = 10;
      try {
        throw new Error("anonymous function");
      } catch (e) {
        Error.stackTraceLimit = stackTraceLimit;
        return extractPluginName(e.stack);
      }
    };
    function extractPluginName(stack) {
      const m = stack.match(fpStackTracePattern);
      return m ? m[1].split(/[/\\]/).slice(-1)[0].match(fileNamePattern)[1] : "anonymous";
    }
    module.exports.extractPluginName = extractPluginName;
  }
});

// node_modules/fastify-plugin/lib/toCamelCase.js
var require_toCamelCase = __commonJS({
  "node_modules/fastify-plugin/lib/toCamelCase.js"(exports, module) {
    "use strict";
    module.exports = function toCamelCase(name) {
      if (name[0] === "@") {
        name = name.slice(1).replace("/", "-");
      }
      return name.replace(/-(.)/g, function(match, g1) {
        return g1.toUpperCase();
      });
    };
  }
});

// node_modules/fastify-plugin/plugin.js
var require_plugin = __commonJS({
  "node_modules/fastify-plugin/plugin.js"(exports, module) {
    "use strict";
    var getPluginName = require_getPluginName();
    var toCamelCase = require_toCamelCase();
    var count = 0;
    function plugin(fn, options = {}) {
      let autoName = false;
      if (fn.default !== void 0) {
        fn = fn.default;
      }
      if (typeof fn !== "function") {
        throw new TypeError(
          `fastify-plugin expects a function, instead got a '${typeof fn}'`
        );
      }
      if (typeof options === "string") {
        options = {
          fastify: options
        };
      }
      if (typeof options !== "object" || Array.isArray(options) || options === null) {
        throw new TypeError("The options object should be an object");
      }
      if (options.fastify !== void 0 && typeof options.fastify !== "string") {
        throw new TypeError(`fastify-plugin expects a version string, instead got '${typeof options.fastify}'`);
      }
      if (!options.name) {
        autoName = true;
        options.name = getPluginName(fn) + "-auto-" + count++;
      }
      fn[Symbol.for("skip-override")] = options.encapsulate !== true;
      fn[Symbol.for("fastify.display-name")] = options.name;
      fn[Symbol.for("plugin-meta")] = options;
      if (!fn.default) {
        fn.default = fn;
      }
      const camelCase = toCamelCase(options.name);
      if (!autoName && !fn[camelCase]) {
        fn[camelCase] = fn;
      }
      return fn;
    }
    module.exports = plugin;
    module.exports.default = plugin;
    module.exports.fastifyPlugin = plugin;
  }
});

// src/wsPlugin.ts
var import_fastify_plugin = __toESM(require_plugin(), 1);
import { WebSocketServer } from "ws";
import { URL } from "url";
function writeHttpAndDestroy(sock, status, reason) {
  try {
    const msg = reason ? ` ${reason}` : "";
    sock.write(`HTTP/1.1 ${status}${msg}\r
Connection: close\r
\r
`);
  } catch {
  }
  try {
    sock.destroy();
  } catch {
  }
}
function parseCookiesHeader(header) {
  if (!header) return {};
  const out = {};
  for (const part of header.split(";")) {
    const [k, ...rest] = part.split("=");
    if (!k) continue;
    out[k.trim()] = decodeURIComponent(rest.join("=").trim());
  }
  return out;
}
function asSet(arrOrSet) {
  if (!arrOrSet) return void 0;
  return arrOrSet instanceof Set ? arrOrSet : new Set(arrOrSet);
}
async function originAllowed(policy, origin, req) {
  if (!policy) return true;
  if (typeof policy === "function") return !!await policy(origin, req);
  const set = asSet(policy);
  if (!origin) return false;
  return set.has(origin);
}
function attachSafeSend(ws, highWaterMarkBytes) {
  ws.safeSend = (data, opts) => {
    if (ws.readyState !== ws.OPEN) return false;
    if (typeof highWaterMarkBytes === "number" && ws.bufferedAmount > highWaterMarkBytes) return false;
    ws.send(data, { binary: opts?.binary });
    return true;
  };
}
console.log("wsPlugin module load start:");
var wsPlugin = function(fastify, pluginOpts, pluginDone) {
  fastify.decorate("_wsRoutes", /* @__PURE__ */ new Map());
  fastify.decorate("setWebSocketOriginPolicy", function(policy) {
    this._wsOriginPolicy = policy;
  });
  fastify.decorate("getWebSocketRoute", function(path) {
    console.log("getWebSocketRoute called.\n	 this._wsRoutes.length: ", this._wsRoutes?.size);
    return this._wsRoutes.get(path);
  });
  fastify.decorate("wsBroadcast", function(path, data, opts) {
    const ctx = this._wsRoutes.get(path);
    if (!ctx) return 0;
    let sent = 0;
    for (const ws of ctx.clients) {
      if (ws.readyState !== ws.OPEN) continue;
      if (opts?.filter && !opts.filter(ws)) continue;
      try {
        ws.send(data, { binary: !!opts?.binary });
        sent++;
      } catch {
      }
    }
    return sent;
  });
  fastify.addHook("onClose", (instance, done) => {
    const map = instance._wsRoutes;
    for (const ctx of map.values()) {
      try {
        clearInterval(ctx.heartbeatTimer);
      } catch {
      }
      try {
        ctx.wss.close();
      } catch {
      }
      ctx.clients.clear();
    }
    map.clear();
    done();
  });
  const processRoute = (routeOpts) => {
    if (!routeOpts.websocket) return;
    if (routeOpts.method != "GET" && routeOpts.method != "HEAD") {
      throw new Error("Websockets only work on GET and HEAD methods.");
    }
    ;
    const fullPath = routeOpts.path ?? routeOpts.url;
    const userHandler = routeOpts.handler;
    const rtOpts = routeOpts;
    const maxPayload = rtOpts.maxPayload ?? 100 * 1024;
    const highWaterMarkBytes = rtOpts.highWaterMarkBytes ?? 512 * 1024;
    const heartbeatIntervalMs = rtOpts.heartbeatIntervalMs ?? 0;
    const selectProtocol = rtOpts.selectProtocol;
    const wss = new WebSocketServer({
      noServer: true,
      maxPayload,
      handleProtocols: selectProtocol ? (protocols, rawReq) => {
        const arr = Array.from(protocols);
        const req = rawReq.__fastifyRequest || rawReq;
        const chosen = selectProtocol(arr, req);
        return chosen || false;
      } : void 0,
      ...rtOpts.wsOptions
    });
    const ctx = {
      path: fullPath,
      wss,
      clients: /* @__PURE__ */ new Set(),
      options: { maxPayload, ...rtOpts }
    };
    if (heartbeatIntervalMs > 0) {
      ctx.heartbeatTimer = setInterval(() => {
        for (const ws of ctx.clients) {
          const anyWs = ws;
          if (anyWs._isAlive === false) {
            try {
              ws.terminate();
            } catch {
            }
            continue;
          }
          anyWs._isAlive = false;
          try {
            ws.ping();
          } catch {
          }
        }
      }, heartbeatIntervalMs).unref?.();
    }
    fastify._wsRoutes.set(fullPath, ctx);
    routeOpts.handler = async function(req, reply) {
      reply.hijack();
      const origin = req.headers.origin || void 0;
      const ip = req.raw.socket.remoteAddress || void 0;
      const base = `http://${req.headers.host || "localhost"}`;
      const url = new URL(req.url, base);
      const query = url.searchParams;
      const cookies = req.cookies ?? parseCookiesHeader(req.headers.cookie);
      const protocols = req.headers["sec-websocket-protocol"]?.split(",").map((s) => s.trim()).filter(Boolean) ?? [];
      const info = {
        headers: req.headers,
        query,
        cookies,
        params: req.params ?? {},
        path: fullPath,
        origin,
        protocols,
        ip
      };
      const policy = rtOpts.allowedOrigins ?? fastify._wsOriginPolicy;
      if (!await originAllowed(policy, origin, req)) {
        writeHttpAndDestroy(req.raw.socket, 403, "Forbidden");
        return;
      }
      const verifyFns = Array.isArray(rtOpts.wsVerify) ? rtOpts.wsVerify : rtOpts.wsVerify ? [rtOpts.wsVerify] : [];
      for (const verify of verifyFns) {
        try {
          const res = await verify.call(this, req, info);
          if (res === false) {
            writeHttpAndDestroy(req.raw.socket, 403, "Forbidden");
            return;
          }
        } catch {
          writeHttpAndDestroy(req.raw.socket, 400, "Bad Request");
          return;
        }
      }
      if (fastify.jwt && rtOpts.jwtVerify !== false) {
        try {
          const token = rtOpts.extractToken ? await rtOpts.extractToken(req, info) : (() => {
            const auth = req.headers.authorization || "";
            if (auth.startsWith("Bearer ")) return auth.slice(7);
            if (query.has("token")) return query.get("token");
            if (cookies.token) return cookies.token;
            return "";
          })();
          if (!token) throw new Error("No token");
          req.user = await fastify.jwt.verify(token);
        } catch {
          writeHttpAndDestroy(req.raw.socket, 401, "Unauthorized");
          return;
        }
      }
      if (typeof rtOpts.maxConnections === "number" && ctx.clients.size >= rtOpts.maxConnections) {
        writeHttpAndDestroy(req.raw.socket, 503, "Service Unavailable");
        return;
      }
      req.raw.__fastifyRequest = req;
      wss.handleUpgrade(req.raw, req.raw.socket, Buffer.alloc(0), (ws) => {
        ctx.clients.add(ws);
        ws.user = req.user;
        ws.params = req.params;
        ws.query = Object.fromEntries(query.entries());
        ws.ip = ip;
        ws._isAlive = true;
        attachSafeSend(ws, highWaterMarkBytes);
        let idleTimer;
        const idleMs = rtOpts.idleTimeoutMs;
        const resetIdle = () => {
          if (!idleMs) return;
          if (idleTimer) clearTimeout(idleTimer);
          idleTimer = setTimeout(() => {
            try {
              ws.close(1001, "Idle timeout");
            } catch {
            }
          }, idleMs).unref?.();
        };
        resetIdle();
        ws.on("pong", () => {
          ws._isAlive = true;
        });
        ws.on("message", () => resetIdle());
        ws.on("close", () => {
          ctx.clients.delete(ws);
          try {
            if (idleTimer) clearTimeout(idleTimer);
          } catch {
          }
          ws.user = void 0;
          ws.params = void 0;
          ws.query = void 0;
        });
        ws.on("error", () => {
        });
        userHandler(ws, req);
      });
    };
  };
  fastify.addHook("onRoute", processRoute);
  pluginDone();
};
var wsPlugin_default = (0, import_fastify_plugin.default)(wsPlugin, {
  name: "fastify-ws-native"
  // fastify: '5.x'
});
export {
  wsPlugin_default as default
};
//# sourceMappingURL=index.js.map