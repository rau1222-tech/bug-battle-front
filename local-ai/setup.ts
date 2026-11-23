/**
 * `npm run ai:setup` prepares the local AI ahead of time (explicit consent to download): starts the runtime and
 * downloads the model into local-ai/models if missing.
 * `npm run ai:setup -- --portable` also installs the pinned portable Ollama into local-ai/runtime, for the game ZIP.
 */
import { loadConfig } from './config';
import { createOllamaClient } from './ollama';
import { OllamaRuntime } from './runtime';

try {
  process.loadEnvFile?.();
} catch {
  // No .env file: defaults are enough
}

const config = loadConfig();
const runtime = new OllamaRuntime(config, createOllamaClient(config.ollamaBaseUrl, config.ollamaModel));
process.on('SIGINT', () => {
  console.info('\n[local-ai] Cancelling setup…');
  runtime.cancel();
});

const mb = (n: number | null) => (n === null ? '?' : `${Math.round(n / 1048576)} MB`);
let last = '';
const timer = setInterval(async () => {
  const h = await runtime.health();
  const dl = h.runtime.downloading ? h.runtime : h.model.downloading ? h.model : null;
  const line = dl
    ? `${h.status} ${dl.progress ?? '?'}% (${mb(dl.downloadedBytes)} / ${mb(dl.totalBytes)})`
    : h.status;
  if (line !== last) console.info(`[local-ai] ${line}`);
  last = line;
}, 2000);

await runtime.prepare({ forcePortable: process.argv.includes('--portable') });
clearInterval(timer);
const health = await runtime.health();
await runtime.stop();
if (health.status !== 'ready') {
  console.error(`[local-ai] Setup did not finish: ${health.status}${health.lastError ? ` (${health.lastError})` : ''}`);
  process.exit(1);
}
console.info(`[local-ai] Setup complete: Ollama ${health.runtime.detectedVersion} (${health.runtime.source}), model ${health.model.name} in local-ai/models`);
process.exit(0);
