/**
 * Pinned Ollama runtime. Never follows `latest`: v0.40.16 is the version verified to run qwen2.5:1.5b with
 * structured (JSON Schema) output. To upgrade deliberately, change the version, copy the new checksums from
 * https://github.com/ollama/ollama/releases/download/<version>/sha256sum.txt, then re-run the tests and a real generation.
 */
export const OLLAMA_RUNTIME_VERSION = '0.40.16';

export type ArchiveFormat = 'zip' | 'tar.zst' | 'tgz';

export interface RuntimeAsset {
  platform: NodeJS.Platform;
  arch: string;
  name: string;
  sha256: string;
  /** Size published in the release, used when the server sends no Content-Length. */
  size: number;
  format: ArchiveFormat;
}

export const OLLAMA_RUNTIME_ASSETS: RuntimeAsset[] = [
  { platform: 'win32', arch: 'x64', name: 'ollama-windows-amd64.zip', size: 1618244995, format: 'zip', sha256: '50fcf5ad54277f2fa5d173ebfc93bcb017adbc0c9ef2314daabc96ca9e6aa64e' },
  { platform: 'win32', arch: 'arm64', name: 'ollama-windows-arm64.zip', size: 386918926, format: 'zip', sha256: '86d2b329cae3125684ff29b506623710b68e1393f679594f1c6aa267beac31c2' },
  { platform: 'linux', arch: 'x64', name: 'ollama-linux-amd64.tar.zst', size: 1545767640, format: 'tar.zst', sha256: '87bfafb2acbc89b2e6a1be0a9043de6aa75fb450696f86bc426e65fc448f788d' },
  { platform: 'linux', arch: 'arm64', name: 'ollama-linux-arm64.tar.zst', size: 1600610073, format: 'tar.zst', sha256: 'e45b8e6dcb86cb9f3057396351655079c9a4879b4ced2678c9350d375dcbc224' },
  { platform: 'darwin', arch: 'x64', name: 'ollama-darwin.tgz', size: 186116182, format: 'tgz', sha256: 'a743717494315da7cd352982b805f6b992d4b4452ca117fd5fbf86c4ee46fca0' },
  { platform: 'darwin', arch: 'arm64', name: 'ollama-darwin.tgz', size: 186116182, format: 'tgz', sha256: 'a743717494315da7cd352982b805f6b992d4b4452ca117fd5fbf86c4ee46fca0' },
];

export const runtimeAssetFor = (platform: NodeJS.Platform = process.platform, arch: string = process.arch) =>
  OLLAMA_RUNTIME_ASSETS.find((a) => a.platform === platform && a.arch === arch) ?? null;

export const runtimeAssetUrl = (asset: RuntimeAsset) =>
  `https://github.com/ollama/ollama/releases/download/v${OLLAMA_RUNTIME_VERSION}/${asset.name}`;
