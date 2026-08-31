import { randomUUID } from 'node:crypto';
import type { PartnerConnectorOnboardingT } from '@kodax-space/space-ipc-schema';
import {
  FeishuOnboardingError,
  isFeishuOnboardingAuthorizationUrl,
  type FeishuOnboardingInput,
  type FeishuOnboardingProgress,
} from './feishu-onboarding-cli.js';
import { PartnerConnectorCommitError, type PartnerConnectorService } from './service.js';

type Owner = { extensionId: string; connectorId: string };
type Identity = Owner & { id: string };
interface Task {
  job: PartnerConnectorOnboardingT;
  readonly profile: string;
  readonly controller: AbortController;
  readonly deadline: number;
  promise: Promise<void>;
  timer?: ReturnType<typeof setTimeout>;
  authorizationUrl?: string;
  abortReason?: 'cancelled' | 'expired';
}
interface Dependencies {
  service: Pick<PartnerConnectorService, 'assertConnectionAllowed' | 'connect'>;
  run(input: FeishuOnboardingInput): Promise<void>;
  openExternal(url: string, assertActive: () => void): Promise<void>;
  changed?(job: PartnerConnectorOnboardingT): void;
}
const MAX_TASKS = 32;
const MAX_TASK_MS = 25 * 60 * 1000;
const terminal = (job: PartnerConnectorOnboardingT): boolean =>
  ['needs_install', 'connected', 'cancelled', 'expired', 'failed'].includes(job.phase);
const sameOwner = (a: Owner, b: Owner): boolean =>
  a.extensionId === b.extensionId && a.connectorId === b.connectorId;

/** Ephemeral host jobs. Codes/URLs are never persisted, projected to IPC or replayed after restart. */
export class PartnerConnectorTasks {
  private readonly tasks = new Map<string, Task>();
  private disposed = false;
  constructor(private readonly deps: Dependencies) {}

  start(input: Owner & { installCli?: boolean }): PartnerConnectorOnboardingT {
    if (this.disposed) throw new Error('连接服务已关闭');
    const active = [...this.tasks.values()].find((task) => !terminal(task.job));
    if (active) {
      if (sameOwner(active.job, input)) return structuredClone(active.job);
      throw new Error('已有飞书连接流程正在进行，请先完成或取消');
    }
    if (this.tasks.size >= MAX_TASKS) this.tasks.delete(this.tasks.keys().next().value!);
    const id = randomUUID();
    const task: Task = {
      job: {
        id,
        extensionId: input.extensionId,
        connectorId: input.connectorId,
        phase: 'preparing',
        canReopen: false,
      },
      profile: `space-${randomUUID()}`,
      controller: new AbortController(),
      deadline: Date.now() + MAX_TASK_MS,
      promise: Promise.resolve(),
    };
    this.tasks.set(id, task);
    this.scheduleExpiry(task, task.deadline);
    task.promise = Promise.resolve().then(() => this.execute(task, input.installCli === true));
    this.publish(task, {});
    return structuredClone(task.job);
  }

  get(input: Identity): PartnerConnectorOnboardingT {
    return structuredClone(this.requireTask(input).job);
  }
  async cancel(input: Identity): Promise<PartnerConnectorOnboardingT> {
    const task = this.requireTask(input);
    this.abort(task, 'cancelled');
    await task.promise;
    return structuredClone(task.job);
  }
  async reopen(input: Identity): Promise<void> {
    const task = this.requireTask(input);
    this.assertLive(task);
    if (
      !task.authorizationUrl ||
      !task.job.canReopen ||
      !isFeishuOnboardingAuthorizationUrl(task.authorizationUrl)
    )
      throw new Error('没有可重新打开的有效授权页面');
    try {
      await this.deps.openExternal(task.authorizationUrl, () => this.assertLive(task));
    } catch {
      throw new Error('无法打开系统浏览器，请点击重新打开授权页');
    }
  }
  async cancelForExtension(extensionId?: string): Promise<void> {
    const tasks = [...this.tasks.values()].filter(
      (task) => extensionId === undefined || task.job.extensionId === extensionId,
    );
    tasks.forEach((task) => this.abort(task, 'cancelled'));
    await Promise.all(tasks.map((task) => task.promise));
  }
  async dispose(): Promise<void> {
    this.disposed = true;
    await this.cancelForExtension();
  }

  private requireTask(input: Identity): Task {
    const task = this.tasks.get(input.id);
    if (!task || !sameOwner(task.job, input)) throw new Error('连接任务不存在或不属于此连接器');
    return task;
  }
  private assertLive(task: Task): void {
    if (task.controller.signal.aborted || terminal(task.job) || this.disposed)
      throw new FeishuOnboardingError(task.abortReason ?? 'cancelled');
    if (
      Date.now() >= task.deadline ||
      (task.job.expiresAt && Date.now() >= Date.parse(task.job.expiresAt))
    ) {
      this.abort(task, 'expired');
      throw new FeishuOnboardingError('expired');
    }
  }
  private publish(task: Task, patch: Partial<PartnerConnectorOnboardingT>): void {
    task.job = { ...task.job, ...patch };
    this.deps.changed?.(structuredClone(task.job));
  }
  private abort(task: Task, reason: 'cancelled' | 'expired'): void {
    if (terminal(task.job) || task.controller.signal.aborted) return;
    task.abortReason = reason;
    task.authorizationUrl = undefined;
    clearTimeout(task.timer);
    task.controller.abort();
    this.publish(task, { canReopen: false });
  }
  private scheduleExpiry(task: Task, deadline: number): void {
    clearTimeout(task.timer);
    task.timer = setTimeout(() => this.abort(task, 'expired'), Math.max(0, deadline - Date.now()));
    task.timer.unref();
  }
  private progress(task: Task, progress: FeishuOnboardingProgress): void {
    this.assertLive(task);
    if (
      progress.authorizationUrl &&
      (!['waiting_app', 'waiting_authorization'].includes(progress.phase) ||
        !isFeishuOnboardingAuthorizationUrl(progress.authorizationUrl))
    )
      throw new FeishuOnboardingError('invalid_response');
    const deadline = progress.expiresAt ? Date.parse(progress.expiresAt) : task.deadline;
    if (!Number.isFinite(deadline) || deadline > task.deadline)
      throw new FeishuOnboardingError('invalid_response');
    if (deadline <= Date.now()) throw new FeishuOnboardingError('expired');
    task.authorizationUrl = progress.authorizationUrl;
    this.publish(task, {
      phase: progress.phase,
      canReopen: !!progress.authorizationUrl,
      expiresAt: progress.expiresAt,
      error: undefined,
    });
    this.scheduleExpiry(task, deadline);
    if (task.authorizationUrl)
      void this.reopen(task.job).catch(() => {
        if (!terminal(task.job) && !task.controller.signal.aborted)
          this.publish(task, { error: '无法打开系统浏览器，请点击重新打开授权页' });
      });
  }
  private finish(task: Task, patch: Partial<PartnerConnectorOnboardingT>): void {
    clearTimeout(task.timer);
    task.authorizationUrl = undefined;
    this.publish(task, { ...patch, canReopen: false, expiresAt: undefined });
  }
  private async execute(task: Task, installCli: boolean): Promise<void> {
    try {
      this.assertLive(task);
      await this.deps.service.assertConnectionAllowed(task.job.extensionId, task.job.connectorId);
      this.assertLive(task);
      await this.deps.run({
        profile: task.profile,
        installCli,
        signal: task.controller.signal,
        onProgress: (event) => this.progress(task, event),
      });
      this.assertLive(task);
      this.progress(task, { phase: 'verifying' });
      await this.deps.service.connect(
        {
          extensionId: task.job.extensionId,
          connectorId: task.job.connectorId,
          profile: task.profile,
        },
        {
          signal: task.controller.signal,
          assertActive: () => this.assertLive(task),
          complete: (connection) => this.finish(task, { phase: 'connected', connection }),
        },
      );
    } catch (error) {
      const code =
        error instanceof PartnerConnectorCommitError
          ? 'authorization_failed'
          : (task.abortReason ??
            (error instanceof FeishuOnboardingError ? error.code : 'authorization_failed'));
      this.finish(task, {
        phase:
          code === 'needs_install' || code === 'cancelled' || code === 'expired' ? code : 'failed',
        error:
          error instanceof PartnerConnectorCommitError
            ? error.message
            : new FeishuOnboardingError(code).message,
      });
    }
  }
}
