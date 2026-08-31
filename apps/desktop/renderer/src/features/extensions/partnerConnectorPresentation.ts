import type { PartnerConnectorAdapterT } from '@kodax-space/space-ipc-schema';
import type { MessageKey } from '../../i18n/messages.js';

export const connectorPresentation: Record<
  PartnerConnectorAdapterT,
  {
    placeholder: string;
    packageName: string;
    version: string;
    requirementsKey: MessageKey;
  }
> = {
  'feishu-cli': {
    placeholder: 'https://example.feishu.cn/docx/…',
    packageName: '@larksuite/cli',
    version: '1.0.92',
    requirementsKey: 'connectors.scopeHint',
  },
  'wecom-cli': {
    placeholder: 'https://doc.weixin.qq.com/doc/…',
    packageName: '@wecom/cli',
    version: '1.2.0',
    requirementsKey: 'connectors.wecomHint',
  },
  'dingtalk-cli': {
    placeholder: 'https://alidocs.dingtalk.com/i/nodes/…',
    packageName: 'dingtalk-workspace-cli',
    version: '1.0.61',
    requirementsKey: 'connectors.dingtalkHint',
  },
  'tencent-meeting-cli': {
    placeholder: 'tmeet://meeting/123456789012345',
    packageName: '@tencentcloud/tmeet',
    version: '1.0.15',
    requirementsKey: 'connectors.meetingHint',
  },
};
