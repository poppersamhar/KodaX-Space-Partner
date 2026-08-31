import type { FeishuOnboardingInput } from './feishu-onboarding-cli.js';
import { MAX_PARTNER_REMOTE_TEXT_BYTES } from '@kodax-space/space-ipc-schema';

/** Implemented, host-owned read adapters; never supplied by an extension or a model. */
export type ReadConnectorId = 'wecom-cli' | 'dingtalk-cli' | 'tencent-meeting-cli';
export interface ReadConnectorIdentity {
  authorityId: string;
  subjectId: string;
  label: string;
}
export interface ReadConnectorStatus {
  installed: boolean;
  version?: string;
  identity?: ReadConnectorIdentity;
  reason?: string;
}
export interface ReadConnectorInput {
  profile: string;
  expected: ReadConnectorIdentity;
  documentUrl: string;
  beforeRead: () => Promise<void>;
  assertRead: () => void;
}
export interface ReadConnectorDocument {
  documentId: string;
  url: string;
  title: string;
  /** Zero means no provider numeric revision; never claim optimistic write support. */
  revision: number;
  content: string;
}

/** A bounded snapshot, never silently truncated or reported as the full oversized source. */
export function checkReadConnectorDocument(document: ReadConnectorDocument): ReadConnectorDocument {
  if (
    document.title.length > 280 ||
    Buffer.byteLength(document.content, 'utf8') > MAX_PARTNER_REMOTE_TEXT_BYTES
  )
    throw new ReadConnectorError('resource_too_large');
  if (document.content.includes('\0') || /[\u0000-\u001f\u007f]/u.test(document.title))
    throw new ReadConnectorError('invalid_response');
  return document;
}
export interface ReadConnector {
  readonly id: ReadConnectorId;
  inspect(profile: string, signal?: AbortSignal): Promise<ReadConnectorStatus>;
  run(input: FeishuOnboardingInput): Promise<void>;
  isAuthorizationUrl(value: unknown): value is string;
  /** Strict canonical reference validation. No arbitrary URL, command or JSON forwarding. */
  acceptsResource(value: string): boolean;
  read(input: ReadConnectorInput): Promise<ReadConnectorDocument>;
}

const messages = {
  needs_install: '需要安装 Space 专用连接组件，确认后才会下载。',
  unsupported_platform: '当前系统暂不支持此连接组件。',
  installation_failed: '连接组件安装或校验失败，尚未进入网页授权。',
  authorization_failed: '连接未完成，请检查官方授权页面或重新连接。',
  invalid_response: '服务返回了无法验证的结果，请重新连接。',
  cancelled: '已取消连接；网页上已经授予的权限不会因此撤销。',
  expired: '本次连接已超时，请重新发起。',
  identity_changed: '账号身份已变化，请重新连接并确认资源范围。',
  invalid_resource: '资源引用无效或不属于此连接器。',
  read_failed: '读取失败，请确认账号对该资源具有查看权限。',
  resource_too_large:
    '资料超出当前读取上限（正文 128 KiB、标题 280 字符），请选择较小的资料；未保存截断内容。',
} as const;

/** Only fixed safe messages cross the host boundary; never raw CLI output. */
export class ReadConnectorError extends Error {
  constructor(readonly code: keyof typeof messages) {
    super(messages[code]);
    this.name = 'ReadConnectorError';
  }
}
