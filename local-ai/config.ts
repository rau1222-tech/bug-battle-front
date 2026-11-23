import path from 'node:path';
import { fileURLToPath } from 'node:url';

export interface LocalAiConfig {
  host: string;
  port: number;
  allowedOrigins: string[];
  ollamaBaseUrl: string;
  ollamaModel: string;
  temperature: number;
  ollamaTimeoutMs: number;
  /** Start and manage a private Ollama instance whose models live in local-ai/models. */
  manageOllama: boolean;
  /** Per-request timing logs (development only; never prompts, answers or user data). */
  debug: boolean;
  rootDir: string;
  runtimeDir: string;
  modelsDir: string;
}

const LOOPBACK = new Set(['127.0.0.1', 'localhost', '::1']);

const num = (v: string | undefined, def: number, min: number, max: number) => {
  const n = Number(v);
  return v !== undefined && v !== '' && Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): LocalAiConfig {
  const rootDir = path.dirname(fileURLToPath(import.meta.url));
  const requestedHost = env.LOCAL_AI_HOST ?? '127.0.0.1';
  // Never listen on the whole network: only loopback hosts are accepted
  const host = LOOPBACK.has(requestedHost) ? requestedHost : '127.0.0.1';
  const ollamaBaseUrl = (env.OLLAMA_BASE_URL || 'http://127.0.0.1:11435').replace(/\/+$/, '');
  if (!LOOPBACK.has(new URL(ollamaBaseUrl).hostname.replace(/^\[|\]$/g, ''))) {
    throw new Error('OLLAMA_BASE_URL must point to a loopback address (127.0.0.1 / localhost)');
  }
  return {
    host,
    port: num(env.LOCAL_AI_PORT, 8787, 1, 65535),
    allowedOrigins: (env.LOCAL_AI_ALLOWED_ORIGIN || 'http://localhost:8080,http://127.0.0.1:8080')
      .split(',')
      .map((o) => o.trim().replace(/\/+$/, ''))
      .filter(Boolean),
    ollamaBaseUrl,
    ollamaModel: env.OLLAMA_MODEL || 'qwen2.5:1.5b',
    temperature: num(env.OLLAMA_TEMPERATURE, 0.3, 0, 1),
    ollamaTimeoutMs: num(env.OLLAMA_TIMEOUT_MS, 30000, 1000, 300000),
    manageOllama: env.LOCAL_AI_MANAGE_OLLAMA !== 'false',
    debug: env.LOCAL_AI_DEBUG === 'true',
    rootDir,
    runtimeDir: path.join(rootDir, 'runtime'),
    modelsDir: path.join(rootDir, 'models'),
  };
}
