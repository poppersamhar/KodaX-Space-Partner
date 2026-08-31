import path from 'node:path';
import { getSpaceDataDir } from '../kodax/data-paths.js';
import { adminPolicyAuditStore } from '../kodax/admin-policy-audit-store.js';
import { getSpaceExtensionStore } from '../space-extensions/runtime.js';
import { pushToRenderer } from '../ipc/push.js';
import { FeishuCli } from './feishu-cli.js';
import { PartnerConnectorService } from './service.js';
import { PartnerConnectorTasks } from './connection-tasks.js';
import { createFeishuOnboardingCli } from './feishu-onboarding-cli.js';

let service: PartnerConnectorService | undefined;
let tasks: PartnerConnectorTasks | undefined;
let onboardingCli: ReturnType<typeof createFeishuOnboardingCli> | undefined;
const cli = () =>
  (onboardingCli ??= createFeishuOnboardingCli({
    root: path.join(getSpaceDataDir(), 'partner-connectors'),
  }));
let policyRevision = 0;
export function invalidateConnectorPolicy(): void {
  policyRevision++;
}
export function getPartnerConnectorService(): PartnerConnectorService {
  return (service ??= new PartnerConnectorService(
    path.join(getSpaceDataDir(), 'partner-connectors'),
    {
      cli: new FeishuCli((request) => cli().runner(request)),
      revokeConnections: (extensionId) =>
        tasks?.cancelForExtension(extensionId) ?? Promise.resolve(),
      getPolicyRevision: () => policyRevision,
      catalog: async (extensionId) =>
        (await getSpaceExtensionStore().getManifest(extensionId)).connectors,
      checkPolicy: async (connectorId, write) => {
        const { policy } = await adminPolicyAuditStore.getPolicy();
        if (
          policy.connectors.deny.includes(connectorId) ||
          (policy.connectors.allow.length > 0 && !policy.connectors.allow.includes(connectorId)) ||
          (write && !policy.connectors.writesAllowed)
        ) {
          throw new Error(
            write
              ? '管理员策略未允许此连接器写入；请在连接器详情查看写入策略'
              : '管理员策略未允许此连接器',
          );
        }
      },
      changed: (context) => pushToRenderer('partner.connectors.changed', context ?? {}),
    },
  ));
}

export function getPartnerConnectorTasks(): PartnerConnectorTasks {
  return (tasks ??= new PartnerConnectorTasks({
    service: getPartnerConnectorService(),
    run: (input) => cli().run(input),
    openExternal: async (url, assertActive) => {
      const { shell } = await import('electron');
      assertActive();
      await shell.openExternal(url);
    },
    changed: (job) => pushToRenderer('partner.connectors.onboarding.changed', { job }),
  }));
}

export async function disposePartnerConnectorTasks(): Promise<void> {
  await tasks?.dispose();
}
