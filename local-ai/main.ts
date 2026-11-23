/** Entry point: `npm run ai` (also started automatically by `npm run dev`). */
import { loadConfig } from './config';
import { createOllamaClient } from './ollama';
import { OllamaRuntime } from './runtime';
import { createLocalAiServer } from './server';

const bootStarted = Date.now();
try {
  process.loadEnvFile?.();
} catch {
  // No .env file: defaults are enough
}

const config = loadConfig();
const ollama = createOllamaClient(config.ollamaBaseUrl, config.ollamaModel);
const runtime = new OllamaRuntime(config, ollama);
const server = createLocalAiServer({ config, ollama, runtime });

server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    // Another instance owns the service (and its private Ollama): leave both untouched
    console.info(`[local-ai] Port ${config.port} already in use: another local AI service is probably running.`);
    process.exit(0);
  }
  console.error(`[local-ai] Could not start: ${err.code ?? err.message}`);
  process.exit(1);
});

server.listen(config.port, config.host, () => {
  console.info(`[local-ai] Listening on http://${config.host}:${config.port} in ${Date.now() - bootStarted} ms (model ${config.ollamaModel})`);
  // Detect and start what is already installed; downloads only happen when the player asks for them
  void runtime.init();
});

let shuttingDown = false;
const shutdown = async () => {
  if (shuttingDown) return;
  shuttingDown = true;
  server.close();
  await runtime.stop();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.on('SIGHUP', shutdown);
// Started by the Vite plugin: when the dev server goes away (even if killed), the IPC channel closes
if (process.send) process.on('disconnect', shutdown);
