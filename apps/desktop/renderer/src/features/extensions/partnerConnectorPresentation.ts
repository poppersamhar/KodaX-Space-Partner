import type { PartnerConnectorAdapterT } from '@kodax-space/space-ipc-schema';
import type { MessageKey } from '../../i18n/messages.js';

export type ConnectorSetupKind =
  'bundled' | 'private-cli' | 'remote-oauth' | 'configuration-required';

type ConnectorPresentation = {
  placeholder: string;
  requirementsKey: MessageKey;
} & (
  | { setupKind: 'private-cli'; packageName: string; version: string }
  | {
      setupKind: Exclude<ConnectorSetupKind, 'private-cli'>;
      packageName?: never;
      version?: never;
    }
);

export const connectorPresentation: Record<PartnerConnectorAdapterT, ConnectorPresentation> = {
  'feishu-cli': {
    placeholder: 'https://example.feishu.cn/docx/…',
    setupKind: 'bundled',
    requirementsKey: 'connectors.scopeHint',
  },
  'wecom-cli': {
    placeholder: 'https://doc.weixin.qq.com/doc/…',
    setupKind: 'private-cli',
    packageName: '@wecom/cli',
    version: '1.2.0',
    requirementsKey: 'connectors.wecomHint',
  },
  'dingtalk-cli': {
    placeholder: 'https://alidocs.dingtalk.com/i/nodes/…',
    setupKind: 'private-cli',
    packageName: 'dingtalk-workspace-cli',
    version: '1.0.61',
    requirementsKey: 'connectors.dingtalkHint',
  },
  'tencent-meeting-cli': {
    placeholder: 'tmeet://meeting-code/123456789',
    setupKind: 'private-cli',
    packageName: '@tencentcloud/tmeet',
    version: '1.0.15',
    requirementsKey: 'connectors.meetingHint',
  },
  'notion-mcp': {
    placeholder: 'notion://page/0123456789abcdef0123456789abcdef',
    setupKind: 'remote-oauth',
    requirementsKey: 'connectors.notionHint',
  },
  'airtable-mcp': {
    placeholder: 'airtable://base/app…/table/tbl…',
    setupKind: 'remote-oauth',
    requirementsKey: 'connectors.airtableHint',
  },
  'atlassian-mcp': {
    placeholder: 'https://your-site.atlassian.net/browse/PROJ-123',
    setupKind: 'remote-oauth',
    requirementsKey: 'connectors.atlassianHint',
  },
  'slack-mcp': {
    placeholder: 'slack://channel/C…/message/1234567890.123456',
    setupKind: 'configuration-required',
    requirementsKey: 'connectors.slackSetupHint',
  },
  'zoom-mcp': {
    placeholder: 'zoom://meeting/123456789',
    setupKind: 'configuration-required',
    requirementsKey: 'connectors.zoomSetupHint',
  },
};

export function isConfigurationRequiredConnector(adapter: string): boolean {
  return (
    connectorPresentation[adapter as PartnerConnectorAdapterT]?.setupKind ===
    'configuration-required'
  );
}
