import { createHash } from 'node:crypto';
import { chmod, lstat, mkdir, mkdtemp, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import yauzl from 'yauzl';
import { createFeishuCliRunner } from './feishu-cli-runner.js';
import { FeishuOnboardingError } from './feishu-auth-process.js';

const VERSION = '1.0.92';
const MAX_ARCHIVE = 64 * 1024 * 1024;
const MAX_BINARY = 128 * 1024 * 1024;
const METADATA = new Set(['README.md', 'LICENSE', 'CHANGELOG.md']);
// Official v1.0.92 release assets, cross-checked against the npm package checksums.txt.
const ASSETS: Readonly<Record<string, { name: string; digest: string }>> = {
  'darwin-arm64': {
    name: 'darwin-arm64.tar.gz',
    digest: 'abb1b96eee5ad32da4e12f434e44d48a9e01ebb0e81772419ac0347f91c34265',
  },
  'darwin-x64': {
    name: 'darwin-amd64.tar.gz',
    digest: '421b36f95966028fb047231cb6351c4224a0fdcb076d2bc434d4aed1bb6d1891',
  },
  'linux-arm64': {
    name: 'linux-arm64.tar.gz',
    digest: '683546b6754c780e0f828e87cb00ccf7c0710798a9f1ddb8c6b956afbfb570ae',
  },
  'linux-x64': {
    name: 'linux-amd64.tar.gz',
    digest: 'ef0e19799c1edd94eb52d3bb5d587e00d0a2898e0a4b407a1b8dc66d56181ef1',
  },
  'linux-riscv64': {
    name: 'linux-riscv64.tar.gz',
    digest: 'f15f320326bea6eceaad075fc3c897b18c97de172d35371bfd1d70c4b014d8ae',
  },
  'win32-arm64': {
    name: 'windows-arm64.zip',
    digest: 'cef96c61c388f7e1100394edcfa1f5ca8322e9bed73a951e119a7e7b6e0f4c6a',
  },
  'win32-x64': {
    name: 'windows-amd64.zip',
    digest: 'dfcf920d8e31bcef99960c584fda8bac49a8dca0b6634b1f05bde0de382080b3',
  },
};

export function managedFeishuCliPath(
  root: string,
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch,
): string {
  return path.join(
    root,
    'feishu-cli',
    VERSION,
    `${platform}-${arch}`,
    platform === 'win32' ? 'lark-cli.exe' : 'lark-cli',
  );
}

export interface FeishuCliInstallerOptions {
  root: string;
  platform?: NodeJS.Platform;
  arch?: string;
  /** Trusted test/network seams, never renderer input. */
  fetch?: typeof globalThis.fetch;
  expectedDigest?: string;
  verifyBinary?: (file: string, signal: AbortSignal) => Promise<boolean>;
}

function active(signal: AbortSignal): void {
  if (signal.aborted) throw new FeishuOnboardingError('cancelled');
}

function extractTar(archive: Buffer): Buffer {
  const tar = gunzipSync(archive, { maxOutputLength: MAX_BINARY + 1024 * 1024 });
  let binary: Buffer | undefined;
  for (let offset = 0, entries = 0; offset + 512 <= tar.length; entries++) {
    if (entries > 64) throw new Error('archive entries');
    const header = tar.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const name = header.subarray(0, 100).toString('utf8').split('\0')[0];
    const sizeText = header.subarray(124, 136).toString('ascii').replace(/\0/g, '').trim();
    const size = /^[0-7]+$/u.test(sizeText) ? parseInt(sizeText, 8) : NaN;
    const checksum = parseInt(header.subarray(148, 156).toString('ascii').trim(), 8);
    const actual = header.reduce(
      (sum, byte, index) => sum + (index >= 148 && index < 156 ? 32 : byte),
      0,
    );
    if (
      !Number.isSafeInteger(size) ||
      size < 0 ||
      size > MAX_BINARY ||
      offset + 512 + size > tar.length ||
      checksum !== actual ||
      (name !== 'lark-cli' && !METADATA.has(name)) ||
      (header[156] !== 0 && header[156] !== 48) ||
      header.subarray(345, 500).some((byte) => byte !== 0) ||
      (name === 'lark-cli' && binary)
    ) {
      throw new Error('unsafe archive');
    }
    if (name === 'lark-cli') binary = tar.subarray(offset + 512, offset + 512 + size);
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  if (!binary?.length) throw new Error('missing binary');
  return binary;
}

function extractZip(archive: Buffer, signal: AbortSignal): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(
      archive,
      { lazyEntries: true, validateEntrySizes: true, strictFileNames: true },
      (error, zip) => {
        if (error || !zip) {
          reject(new Error('invalid zip'));
          return;
        }
        let binary: Buffer | undefined;
        let settled = false;
        const fail = () => {
          if (settled) return;
          settled = true;
          signal.removeEventListener('abort', fail);
          zip.close();
          reject(new Error('unsafe zip'));
        };
        signal.addEventListener('abort', fail, { once: true });
        zip.on('error', fail);
        zip.on('entry', (entry: yauzl.Entry) => {
          const type = (entry.externalFileAttributes >>> 16) & 0o170000;
          if (
            (binary && entry.fileName === 'lark-cli.exe') ||
            (entry.fileName !== 'lark-cli.exe' && !METADATA.has(entry.fileName)) ||
            !entry.uncompressedSize ||
            entry.uncompressedSize > MAX_BINARY ||
            (type !== 0 && type !== 0o100000) ||
            entry.generalPurposeBitFlag & 1
          ) {
            fail();
            return;
          }
          if (METADATA.has(entry.fileName)) {
            zip.readEntry();
            return;
          }
          zip.openReadStream(entry, (readError, stream) => {
            if (readError || !stream) {
              fail();
              return;
            }
            const chunks: Buffer[] = [];
            let bytes = 0;
            stream.on('error', fail);
            stream.on('data', (chunk: Buffer) => {
              bytes += chunk.length;
              if (settled || signal.aborted || bytes > MAX_BINARY) {
                stream.destroy();
                fail();
                return;
              }
              chunks.push(chunk);
            });
            stream.on('end', () => {
              if (settled) return;
              binary = Buffer.concat(chunks);
              zip.readEntry();
            });
          });
        });
        zip.on('end', () => {
          if (settled) return;
          signal.removeEventListener('abort', fail);
          if (!binary?.length || signal.aborted) {
            fail();
            return;
          }
          settled = true;
          zip.close();
          resolve(binary);
        });
        if (signal.aborted) fail();
        else zip.readEntry();
      },
    );
  });
}

async function releaseResponse(
  initial: string,
  signal: AbortSignal,
  fetcher: typeof fetch,
): Promise<Response> {
  let url = initial;
  for (let count = 0; count <= 3; count++) {
    active(signal);
    const target = new URL(url);
    if (
      target.protocol !== 'https:' ||
      target.username ||
      target.password ||
      target.hash ||
      target.port ||
      ![
        'github.com',
        'release-assets.githubusercontent.com',
        'objects.githubusercontent.com',
      ].includes(target.hostname)
    )
      throw new Error('unsafe redirect');
    const response = await fetcher(url, { signal, redirect: 'manual' });
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;
    await response.body?.cancel();
    const location = response.headers.get('location');
    if (!location) throw new Error('missing redirect');
    url = new URL(location, url).href;
  }
  throw new Error('redirect limit');
}

async function download(url: string, signal: AbortSignal, fetcher: typeof fetch): Promise<Buffer> {
  const response = await releaseResponse(url, signal, fetcher);
  if (!response.ok || !response.body) throw new Error('download failed');
  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let bytes = 0;
  try {
    for (;;) {
      active(signal);
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_ARCHIVE) throw new Error('archive too large');
      chunks.push(Buffer.from(value));
    }
  } finally {
    await reader.cancel();
  }
  return Buffer.concat(chunks);
}

async function verifyNative(file: string, signal: AbortSignal): Promise<boolean> {
  const result = await createFeishuCliRunner({ executable: file, timeoutMs: 10000 })({
    args: ['--version'],
    signal,
  });
  return result.exitCode === 0 && /^lark-cli version 1\.0\.92\s*$/u.test(result.stdout);
}

async function existingBinary(file: string): Promise<boolean> {
  try {
    const parent = await lstat(path.dirname(file));
    if (!parent.isDirectory() || parent.isSymbolicLink())
      throw new Error('unsafe platform directory');
    const stat = await lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('unsafe binary');
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

async function privateParent(root: string): Promise<string> {
  let directory = root;
  for (const part of ['', 'feishu-cli', VERSION]) {
    directory = path.join(directory, part);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const stat = await lstat(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('unsafe directory');
  }
  return directory;
}

async function cleanupStaging(directory: string): Promise<void> {
  try {
    await rm(directory, { recursive: true, force: true });
  } catch {
    throw new FeishuOnboardingError('installation_failed');
  }
}

export function createFeishuCliInstaller(options: FeishuCliInstallerOptions): {
  executable: string;
  install: (signal: AbortSignal) => Promise<string>;
} {
  const platform = options.platform ?? process.platform;
  const arch = options.arch ?? process.arch;
  const executable = managedFeishuCliPath(options.root, platform, arch);
  const asset = ASSETS[`${platform}-${arch}`];
  return {
    executable,
    install: async (signal) => {
      active(signal);
      if (!asset) throw new FeishuOnboardingError('unsupported_platform');
      let staging: string | undefined;
      const timeout = AbortSignal.timeout(180000);
      const bounded = AbortSignal.any([signal, timeout]);
      try {
        if (!path.isAbsolute(options.root) || options.root === path.parse(options.root).root)
          throw new Error('invalid root');
        const parent = await privateParent(options.root);
        if (await existingBinary(executable)) {
          if (!(await (options.verifyBinary ?? verifyNative)(executable, bounded)))
            throw new Error('existing version');
          active(bounded);
          return executable;
        }
        staging = await mkdtemp(path.join(parent, '.install-'));
        const data = await download(
          `https://github.com/larksuite/cli/releases/download/v${VERSION}/lark-cli-${VERSION}-${asset.name}`,
          bounded,
          options.fetch ?? fetch,
        );
        const digest = createHash('sha256').update(data).digest('hex');
        if (digest !== (options.expectedDigest ?? asset.digest))
          throw new Error('checksum mismatch');
        active(bounded);
        const binary = platform === 'win32' ? await extractZip(data, bounded) : extractTar(data);
        const candidate = path.join(staging, path.basename(executable));
        await writeFile(candidate, binary, { mode: 0o700, flag: 'wx' });
        await chmod(candidate, 0o700);
        active(bounded);
        if (!(await (options.verifyBinary ?? verifyNative)(candidate, bounded)))
          throw new Error('version mismatch');
        active(bounded);
        await rename(staging, path.dirname(executable));
        staging = undefined;
        return executable;
      } catch (error) {
        if (signal.aborted) throw new FeishuOnboardingError('cancelled');
        if (timeout.aborted) throw new FeishuOnboardingError('installation_failed');
        if (error instanceof FeishuOnboardingError) throw error;
        throw new FeishuOnboardingError('installation_failed');
      } finally {
        if (staging) await cleanupStaging(staging);
      }
    },
  };
}
