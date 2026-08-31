import { z } from 'zod';

const identity = z
  .string()
  .min(1)
  .max(96)
  .regex(/^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/);
const revision = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);
export const feishuDocumentUrlSchema = z
  .string()
  .max(512)
  .regex(/^https:\/\/[a-z0-9-]+\.feishu\.cn\/docx\/[A-Za-z0-9]{1,128}$/);
export const feishuFolderUrlSchema = z
  .string()
  .max(512)
  .regex(/^https:\/\/[a-z0-9-]+\.feishu\.cn\/drive\/folder\/[A-Za-z0-9]{1,128}$/);

export const partnerConnectorAdapterSchema = z.enum([
  'feishu-cli',
  'wecom-cli',
  'dingtalk-cli',
  'tencent-meeting-cli',
]);
export type PartnerConnectorAdapterT = z.infer<typeof partnerConnectorAdapterSchema>;
export const wecomResourceSchema = z
  .string()
  .max(512)
  .regex(/^(?:wecom:\/\/document\/|https:\/\/doc\.weixin\.qq\.com\/doc\/)[A-Za-z0-9_-]{1,128}$/);
export const dingtalkResourceSchema = z
  .string()
  .max(512)
  .regex(
    /^(?:dingtalk:\/\/document\/|https:\/\/alidocs\.dingtalk\.com\/i\/nodes\/)[A-Za-z0-9_-]{1,128}$/,
  );
export const tencentMeetingResourceSchema = z
  .string()
  .max(512)
  .regex(/^tmeet:\/\/meeting\/[0-9]{1,128}$/);
export const partnerReadResourceSchema: z.ZodType<string> = z.union([
  feishuDocumentUrlSchema,
  wecomResourceSchema,
  dingtalkResourceSchema,
  tencentMeetingResourceSchema,
]);
export function isPartnerConnectorResource(
  adapter: PartnerConnectorAdapterT,
  value: string,
): boolean {
  const schemas = {
    'feishu-cli': feishuDocumentUrlSchema,
    'wecom-cli': wecomResourceSchema,
    'dingtalk-cli': dingtalkResourceSchema,
    'tencent-meeting-cli': tencentMeetingResourceSchema,
  };
  return schemas[adapter].safeParse(value).success;
}

/** Only adapters implemented by the trusted host can be declared by a package. */
export const spaceConnectorDefinitionSchema = z
  .object({
    id: identity,
    adapter: partnerConnectorAdapterSchema,
    name: z.string().trim().min(1).max(80),
    description: z.string().max(280),
  })
  .strict();
export type SpaceConnectorDefinitionT = z.infer<typeof spaceConnectorDefinitionSchema>;

const selectionObject = z
  .object({
    extensionId: identity,
    connectorId: identity,
    connectionId: z.string().uuid(),
    connectionRevision: revision,
    /** Missing adapter is the legacy Feishu format, never an inferred new provider. */
    adapter: partnerConnectorAdapterSchema.optional(),
    documents: z
      .array(
        z.object({ url: partnerReadResourceSchema, access: z.enum(['read', 'append']) }).strict(),
      )
      .max(32),
    createFolderUrl: feishuFolderUrlSchema.optional(),
  })
  .strict();
const uniqueDocuments = (value: z.infer<typeof selectionObject>): boolean =>
  new Set(value.documents.map((document) => document.url.split('/').at(-1))).size ===
  value.documents.length;
const validProviderScope = (value: z.infer<typeof selectionObject>): boolean => {
  const adapter = value.adapter ?? 'feishu-cli';
  return (
    value.documents.every((item) => isPartnerConnectorResource(adapter, item.url)) &&
    (adapter === 'feishu-cli' ||
      (!value.createFolderUrl && value.documents.every((item) => item.access === 'read')))
  );
};
export const partnerConnectorSelectionSchema = selectionObject
  .refine(uniqueDocuments, 'Duplicate document scope')
  .refine(validProviderScope, 'Resource does not match adapter or read-only capability');
export type PartnerConnectorSelectionT = z.infer<typeof partnerConnectorSelectionSchema>;

export const partnerConnectorSnapshotSchema = selectionObject
  .extend({
    name: z.string().min(1).max(80),
    accountLabel: z.string().min(1).max(160),
  })
  .refine(uniqueDocuments, 'Duplicate document scope')
  .refine(validProviderScope, 'Resource does not match adapter or read-only capability');
export type PartnerConnectorSnapshotT = z.infer<typeof partnerConnectorSnapshotSchema>;
export const partnerConnectorSelectionsSchema = z
  .array(partnerConnectorSelectionSchema)
  .max(8)
  .refine(
    (items) => new Set(items.map((item) => item.connectionId)).size === items.length,
    'Duplicate connection',
  );
export const partnerConnectorSnapshotsSchema = z.array(partnerConnectorSnapshotSchema).max(8);
export const partnerConnectorStateSchema = z
  .object({
    connectors: z
      .array(
        z
          .object({
            binding: partnerConnectorSnapshotSchema,
            available: z.boolean(),
            unavailableReason: z.string().max(280).optional(),
          })
          .strict(),
      )
      .max(8),
  })
  .strict();
export type PartnerConnectorStateT = z.infer<typeof partnerConnectorStateSchema>;

export const feishuProfileSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9][A-Za-z0-9_.-]*$/);
export const partnerConnectorConnectionSchema = z
  .object({
    id: z.string().uuid(),
    extensionId: identity,
    connectorId: identity,
    revision,
    adapter: partnerConnectorAdapterSchema.optional(),
    profile: feishuProfileSchema,
    accountLabel: z.string().min(1).max(160),
    connected: z.boolean(),
    permissions: z.object({ read: z.boolean(), create: z.boolean(), append: z.boolean() }).strict(),
  })
  .strict();
export type PartnerConnectorConnectionT = z.infer<typeof partnerConnectorConnectionSchema>;
export const partnerConnectorInspectionSchema = z
  .object({
    installed: z.boolean(),
    version: z.string().max(80).optional(),
    reason: z.string().max(280).optional(),
    profiles: z
      .array(z.object({ name: feishuProfileSchema, label: z.string().max(160) }).strict())
      .max(64),
    connections: z.array(partnerConnectorConnectionSchema).max(64),
  })
  .strict();
export type PartnerConnectorInspectionT = z.infer<typeof partnerConnectorInspectionSchema>;

export const MAX_PARTNER_REMOTE_TEXT_BYTES = 128 * 1024;
const remoteText = z
  .string()
  .max(MAX_PARTNER_REMOTE_TEXT_BYTES)
  .refine(
    (text) =>
      !text.includes('\0') &&
      new TextEncoder().encode(text).length <= MAX_PARTNER_REMOTE_TEXT_BYTES,
    'Remote text exceeds the UTF-8 limit or contains NUL',
  );
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const sessionId = z.string().min(1).max(128);
const projectRoot = z.string().min(1).max(4096);
const context = z.object({ sessionId, projectRoot }).strict();
const owner = {
  id: z.string().uuid(),
  sessionId,
  projectRoot,
  extensionId: identity,
  connectorId: identity,
  connectionId: z.string().uuid(),
};

export const partnerRemoteSourceSchema = z
  .object({
    ...owner,
    documentId: z.string().min(1).max(128),
    url: partnerReadResourceSchema,
    title: z.string().max(280),
    revision: z.number().int().nonnegative(),
    content: remoteText,
    contentHash: hash,
    readAt: z.string().datetime(),
  })
  .strict();
export type PartnerRemoteSourceT = z.infer<typeof partnerRemoteSourceSchema>;
export const partnerRemoteSourceSummarySchema = partnerRemoteSourceSchema.omit({ content: true });
export type PartnerRemoteSourceSummaryT = z.infer<typeof partnerRemoteSourceSummarySchema>;

export const partnerRemoteProposalSchema = z
  .object({
    ...owner,
    connectionRevision: revision,
    operation: z.enum(['create', 'append']),
    targetUrl: z.union([feishuDocumentUrlSchema, feishuFolderUrlSchema]),
    title: z.string().trim().min(1).max(280),
    content: remoteText,
    rationale: z.string().max(1000),
    contentHash: hash,
    scopeHash: hash,
    baseRevision: z.number().int().nonnegative().optional(),
    baseContentHash: hash.optional(),
    status: z.enum([
      'pending',
      'submitting',
      'succeeded',
      'rejected',
      'conflict',
      'unknown',
      'partial',
      'failed',
    ]),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    error: z.string().max(280).optional(),
  })
  .strict();
export type PartnerRemoteProposalT = z.infer<typeof partnerRemoteProposalSchema>;
export const partnerRemoteProposalSummarySchema = partnerRemoteProposalSchema.omit({
  content: true,
});
export type PartnerRemoteProposalSummaryT = z.infer<typeof partnerRemoteProposalSummarySchema>;
export const partnerRemoteReceiptSchema = z
  .object({
    ...owner,
    proposalId: z.string().uuid(),
    operation: z.enum(['create', 'append']),
    documentId: z.string().min(1).max(128),
    url: feishuDocumentUrlSchema,
    title: z.string().max(280),
    revision: z.number().int().nonnegative(),
    completedAt: z.string().datetime(),
  })
  .strict();
export type PartnerRemoteReceiptT = z.infer<typeof partnerRemoteReceiptSchema>;
export const partnerRemoteRecordsSchema = z
  .object({
    sources: z.array(partnerRemoteSourceSummarySchema).max(200),
    proposals: z.array(partnerRemoteProposalSummarySchema).max(200),
    receipts: z.array(partnerRemoteReceiptSchema).max(200),
  })
  .strict();
export type PartnerRemoteRecordsT = z.infer<typeof partnerRemoteRecordsSchema>;
export const partnerRemoteProposalInputSchema = z
  .object({
    connectionId: z.string().uuid(),
    operation: z.enum(['create', 'append']),
    targetUrl: z.union([feishuDocumentUrlSchema, feishuFolderUrlSchema]),
    title: z.string().trim().min(1).max(280),
    content: remoteText,
    rationale: z.string().max(1000).default(''),
  })
  .strict();
export type PartnerRemoteProposalInputT = z.infer<typeof partnerRemoteProposalInputSchema>;

const definitionInput = z.object({ extensionId: identity, connectorId: identity }).strict();
const ok = z.object({ ok: z.literal(true) }).strict();
export const connectorInvokeChannels = {
  'space.extensions.connectors.catalog': {
    name: 'space.extensions.connectors.catalog',
    direction: 'invoke',
    input: z.object({ extensionId: identity }).strict(),
    output: z.object({ connectors: z.array(spaceConnectorDefinitionSchema).max(64) }).strict(),
  },
  'partner.connectors.inspect': {
    name: 'partner.connectors.inspect',
    direction: 'invoke',
    input: definitionInput,
    output: partnerConnectorInspectionSchema,
  },
  'partner.connectors.connect': {
    name: 'partner.connectors.connect',
    direction: 'invoke',
    input: definitionInput.extend({ profile: feishuProfileSchema }),
    output: z.object({ connection: partnerConnectorConnectionSchema }).strict(),
  },
  'partner.connectors.disconnect': {
    name: 'partner.connectors.disconnect',
    direction: 'invoke',
    input: definitionInput.extend({ connectionId: z.string().uuid() }),
    output: ok,
  },
  'partner.connectors.resolve': {
    name: 'partner.connectors.resolve',
    direction: 'invoke',
    input: z.object({ projectRoot, connectors: partnerConnectorSelectionsSchema }).strict(),
    output: partnerConnectorStateSchema,
  },
  'session.partnerConnectors.get': {
    name: 'session.partnerConnectors.get',
    direction: 'invoke',
    input: z.object({ sessionId }).strict(),
    output: partnerConnectorStateSchema,
  },
  'session.partnerConnectors.set': {
    name: 'session.partnerConnectors.set',
    direction: 'invoke',
    input: z.object({ sessionId, connectors: partnerConnectorSelectionsSchema }).strict(),
    output: partnerConnectorStateSchema,
  },
  'partner.connectors.read': {
    name: 'partner.connectors.read',
    direction: 'invoke',
    input: context.extend({
      connectionId: z.string().uuid(),
      documentUrl: partnerReadResourceSchema,
    }),
    output: z.object({ source: partnerRemoteSourceSchema }).strict(),
  },
  'partner.connectors.records': {
    name: 'partner.connectors.records',
    direction: 'invoke',
    input: context,
    output: partnerRemoteRecordsSchema,
  },
  'partner.connectors.sources.get': {
    name: 'partner.connectors.sources.get',
    direction: 'invoke',
    input: context.extend({ id: z.string().uuid() }),
    output: z.object({ source: partnerRemoteSourceSchema.nullable() }).strict(),
  },
  'partner.connectors.proposals.create': {
    name: 'partner.connectors.proposals.create',
    direction: 'invoke',
    input: context.extend(partnerRemoteProposalInputSchema.shape),
    output: z.object({ proposal: partnerRemoteProposalSchema }).strict(),
  },
  'partner.connectors.proposals.get': {
    name: 'partner.connectors.proposals.get',
    direction: 'invoke',
    input: context.extend({ id: z.string().uuid() }),
    output: z.object({ proposal: partnerRemoteProposalSchema.nullable() }).strict(),
  },
  'partner.connectors.proposals.apply': {
    name: 'partner.connectors.proposals.apply',
    direction: 'invoke',
    input: context.extend({ id: z.string().uuid(), expectedContentHash: hash }),
    output: z.object({ proposal: partnerRemoteProposalSchema }).strict(),
  },
  'partner.connectors.proposals.reject': {
    name: 'partner.connectors.proposals.reject',
    direction: 'invoke',
    input: context.extend({ id: z.string().uuid() }),
    output: z.object({ proposal: partnerRemoteProposalSchema }).strict(),
  },
} as const;
export const connectorPushChannels = {
  'session.partnerConnectors.changed': {
    name: 'session.partnerConnectors.changed',
    direction: 'push',
    payload: z.object({ sessionId, state: partnerConnectorStateSchema }).strict(),
  },
  'partner.connectors.changed': {
    name: 'partner.connectors.changed',
    direction: 'push',
    payload: z
      .object({
        extensionId: identity.optional(),
        sessionId: sessionId.optional(),
        projectRoot: projectRoot.optional(),
      })
      .strict(),
  },
} as const;
