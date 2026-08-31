import path from 'node:path';
import { getSpaceDataDir } from '../kodax/data-paths.js';
import { adminPolicyAuditStore } from '../kodax/admin-policy-audit-store.js';
import { getSpaceExtensionStore } from '../space-extensions/runtime.js';
import { pushToRenderer } from '../ipc/push.js';
import { FeishuCli } from './feishu-cli.js';
import { PartnerConnectorService } from './service.js';

let service: PartnerConnectorService | undefined;
let policyRevision = 0;
export function invalidateConnectorPolicy(): void {
  policyRevision++;
}
export function getPartnerConnectorService(): PartnerConnectorService {
  return (service ??= new PartnerConnectorService(
    path.join(getSpaceDataDir(), 'partner-connectors'),
    {
      cli: new FeishuCli(),
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
