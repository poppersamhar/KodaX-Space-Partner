import { existsSync } from 'node:fs';
import { createFeishuCliRunner, type FeishuCliRunner } from './feishu-cli-runner.js';
import { createFeishuCliInstaller } from './feishu-cli-install.js';
import {
  createFeishuAuthProcess,
  FeishuOnboardingError,
  type FeishuAuthProcess,
} from './feishu-auth-process.js';
export { FeishuOnboardingError } from './feishu-auth-process.js';

export interface FeishuOnboardingProgress {
  phase: 'preparing' | 'installing' | 'waiting_app' | 'waiting_authorization' | 'verifying';
  authorizationUrl?: string;
  expiresAt?: string;
}
export interface FeishuOnboardingInput {
  profile: string;
  installCli: boolean;
  signal: AbortSignal;
  onProgress: (event: FeishuOnboardingProgress) => void;
}

const SCOPES = ['docx:document:readonly', 'docx:document:create', 'docx:document:write_only'];

/** Only generated Feishu onboarding pages may be handed to the external browser. */
export function isFeishuOnboardingAuthorizationUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 8192 || /[\s\\\u0000-\u001f\u007f]/u.test(value))
    return false;
  try {
    const url = new URL(value);
    const keys = [...url.searchParams.keys()];
    const allowed =
      url.hostname === 'open.feishu.cn'
        ? ['user_code', 'lpv', 'ocv', 'from']
        : ['user_code', 'flow_id'];
    return (
      url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      !url.hash &&
      (!url.port || url.port === '443') &&
      ((url.hostname === 'open.feishu.cn' && url.pathname === '/page/cli') ||
        (url.hostname === 'accounts.feishu.cn' && url.pathname === '/oauth/v1/device/verify')) &&
      keys.length === new Set(keys).size &&
      keys.every((key) => allowed.includes(key)) &&
      [...url.searchParams.values()].every(
        (item) => !!item && !/[\s\u0000-\u001f\u007f]/u.test(item),
      ) &&
      url.searchParams.getAll('user_code').length === 1 &&
      !!url.searchParams.get('user_code')
    );
  } catch {
    return false;
  }
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new FeishuOnboardingError('invalid_response');
  return value as Record<string, unknown>;
}
function json(value: string): Record<string, unknown> {
  try {
    return object(JSON.parse(value) as unknown);
  } catch {
    throw new FeishuOnboardingError('invalid_response');
  }
}
function active(signal: AbortSignal): void {
  if (signal.aborted) throw new FeishuOnboardingError('cancelled');
}

async function compatible(run: FeishuCliRunner, signal: AbortSignal): Promise<boolean> {
  try {
    const result = await run({ args: ['--version'], signal });
    return result.exitCode === 0 && /^lark-cli version 1\.0\.92\s*$/u.test(result.stdout);
  } catch {
    return false;
  }
}

async function requireUnusedProfile(
  run: FeishuCliRunner,
  profile: string,
  signal: AbortSignal,
): Promise<void> {
  try {
    const result = await run({ args: ['profile', 'list'], signal });
    const values: unknown = JSON.parse(result.stdout);
    if (
      result.exitCode !== 0 ||
      !Array.isArray(values) ||
      values.length > 1024 ||
      values.some((value) => object(value).name === profile)
    )
      throw new FeishuOnboardingError('invalid_response');
  } catch {
    throw new FeishuOnboardingError('invalid_response');
  }
}

async function requireCreatedProfile(
  run: FeishuCliRunner,
  input: FeishuOnboardingInput,
  appId: string,
): Promise<void> {
  try {
    const result = await run({ args: ['profile', 'list'], signal: input.signal });
    active(input.signal);
    const values: unknown = JSON.parse(result.stdout);
    if (result.exitCode !== 0 || !Array.isArray(values) || values.length > 1024)
      throw new Error('profiles');
    const matches = values.map(object).filter((value) => value.name === input.profile);
    if (matches.length !== 1 || matches[0].appId !== appId || matches[0].brand !== 'feishu')
      throw new Error('changed profile');
  } catch {
    active(input.signal);
    throw new FeishuOnboardingError('invalid_response');
  }
}

async function createApp(run: FeishuAuthProcess, input: FeishuOnboardingInput): Promise<string> {
  let stdout = '';
  let stderr = '';
  let url: string | undefined;
  const line = (value: string) => {
    const candidate = value.trim();
    if (!candidate.startsWith('https://')) return;
    if (
      !isFeishuOnboardingAuthorizationUrl(candidate) ||
      new URL(candidate).hostname !== 'open.feishu.cn' ||
      (url && candidate !== url)
    ) {
      throw new FeishuOnboardingError('invalid_response');
    }
    if (!url) {
      url = candidate;
      input.onProgress({
        phase: 'waiting_app',
        authorizationUrl: url,
        expiresAt: new Date(Date.now() + 600000).toISOString(),
      });
    }
  };
  const result = await run({
    args: ['config', 'init', '--new', '--brand', 'feishu', '--name', input.profile],
    signal: input.signal,
    timeoutMs: 630000,
    onOutput: (stream, chunk) => {
      if (stream === 'stdout') stdout += chunk;
      else {
        stderr += chunk;
        const lines = stderr.split(/\r?\n/u);
        stderr = lines.pop() ?? '';
        lines.forEach(line);
      }
    },
  });
  line(stderr);
  active(input.signal);
  if (result.exitCode !== 0) throw new FeishuOnboardingError('authorization_failed');
  const saved = json(stdout);
  if (
    !url ||
    saved.brand !== 'feishu' ||
    typeof saved.appId !== 'string' ||
    !/^cli_[\w-]{1,128}$/u.test(saved.appId) ||
    saved.appSecret !== '****'
  ) {
    throw new FeishuOnboardingError('invalid_response');
  }
  return saved.appId;
}

async function authorizeUser(run: FeishuAuthProcess, input: FeishuOnboardingInput): Promise<void> {
  let buffered = '';
  let url: string | undefined;
  let complete = false;
  let failure: FeishuOnboardingError | undefined;
  const line = (text: string) => {
    if (!text.trim()) return;
    const value = json(text);
    if (value.event === 'device_authorization') {
      const candidate = value.verification_uri_complete;
      if (
        !isFeishuOnboardingAuthorizationUrl(candidate) ||
        new URL(candidate).hostname !== 'accounts.feishu.cn' ||
        url ||
        !Number.isSafeInteger(value.expires_in) ||
        Number(value.expires_in) < 1 ||
        Number(value.expires_in) > 3600
      ) {
        throw new FeishuOnboardingError('invalid_response');
      }
      url = candidate;
      input.onProgress({
        phase: 'waiting_authorization',
        authorizationUrl: url,
        expiresAt: new Date(
          Date.now() + Math.min(Number(value.expires_in), 600) * 1000,
        ).toISOString(),
      });
    } else if (value.event === 'authorization_complete') {
      if (complete || !url || !Array.isArray(value.granted) || !Array.isArray(value.missing))
        throw new FeishuOnboardingError('invalid_response');
      complete = true;
      if (
        value.missing.length ||
        SCOPES.some((scope) => !(value.granted as unknown[]).includes(scope))
      )
        failure = new FeishuOnboardingError('missing_permissions');
    } else if (value.event === 'authorization_failed')
      failure = new FeishuOnboardingError(
        typeof value.error === 'string' && /expired|timed out/iu.test(value.error)
          ? 'expired'
          : 'authorization_failed',
      );
    else throw new FeishuOnboardingError('invalid_response');
  };
  const result = await run({
    args: [`--profile=${input.profile}`, 'auth', 'login', '--json', '--scope', SCOPES.join(' ')],
    signal: input.signal,
    timeoutMs: 630000,
    onOutput: (stream, chunk) => {
      if (stream !== 'stdout') return;
      buffered += chunk;
      const lines = buffered.split(/\r?\n/u);
      buffered = lines.pop() ?? '';
      lines.forEach(line);
    },
  });
  line(buffered);
  active(input.signal);
  if (failure) throw failure;
  if (result.exitCode !== 0) throw new FeishuOnboardingError('authorization_failed');
  if (!complete) throw new FeishuOnboardingError('invalid_response');
}

export interface FeishuOnboardingCliOptions {
  root: string;
  env?: NodeJS.ProcessEnv;
  runnerFactory?: (executable: string) => FeishuCliRunner;
  authProcessFactory?: (executable: string) => FeishuAuthProcess;
  installer?: ReturnType<typeof createFeishuCliInstaller>;
}

/** Host-only dependencies are injectable; no caller-supplied shell, URL or scopes enter run. */
export function createFeishuOnboardingCli(options: FeishuOnboardingCliOptions): {
  runner: FeishuCliRunner;
  run: (input: FeishuOnboardingInput) => Promise<void>;
} {
  const source = options.env ?? process.env;
  const installer = options.installer ?? createFeishuCliInstaller({ root: options.root });
  const privatePath = installer.executable;
  let installedPrivate = false;
  const claimedProfiles = new Set<string>();
  const executable = () =>
    source.KODAX_SPACE_FEISHU_CLI ||
    (installedPrivate || existsSync(privatePath) ? privatePath : 'lark-cli');
  const runnerFactory =
    options.runnerFactory ?? ((file) => createFeishuCliRunner({ executable: file, env: source }));
  const authFactory =
    options.authProcessFactory ??
    ((file) => createFeishuAuthProcess({ executable: file, env: source }));
  return {
    runner: (request) => runnerFactory(executable())(request),
    run: async (input) => {
      try {
        active(input.signal);
        if (
          !/^space-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(
            input.profile,
          )
        ) {
          throw new FeishuOnboardingError('invalid_response');
        }
        input.onProgress({ phase: 'preparing' });
        const ready = await compatible(runnerFactory(executable()), input.signal);
        active(input.signal);
        if (!ready) {
          if (source.KODAX_SPACE_FEISHU_CLI)
            throw new FeishuOnboardingError('authorization_failed');
          if (!input.installCli) throw new FeishuOnboardingError('needs_install');
          input.onProgress({ phase: 'installing' });
          await installer.install(input.signal);
          installedPrivate = true;
          if (!(await compatible(runnerFactory(executable()), input.signal)))
            throw new FeishuOnboardingError('installation_failed');
        }
        active(input.signal);
        await requireUnusedProfile(runnerFactory(executable()), input.profile, input.signal);
        active(input.signal);
        if (claimedProfiles.has(input.profile)) throw new FeishuOnboardingError('invalid_response');
        claimedProfiles.add(input.profile);
        const appId = await createApp(authFactory(executable()), input);
        await requireCreatedProfile(runnerFactory(executable()), input, appId);
        active(input.signal);
        await authorizeUser(authFactory(executable()), input);
        await requireCreatedProfile(runnerFactory(executable()), input, appId);
        active(input.signal);
        input.onProgress({ phase: 'verifying' });
      } catch (error) {
        active(input.signal);
        if (error instanceof FeishuOnboardingError) throw error;
        throw new FeishuOnboardingError('authorization_failed');
      }
    },
  };
}
