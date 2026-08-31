import { z } from 'zod';
import { partnerConnectorConnectionSchema } from './partner-connector.js';

const identity = z
  .string()
  .min(1)
  .max(96)
  .regex(/^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/);
const owner = z.object({ extensionId: identity, connectorId: identity }).strict();
const jobIdentity = owner.extend({ id: z.string().uuid() });

/** Presentation-only state. Authorization links, codes and tokens stay in the trusted host. */
export const partnerConnectorOnboardingSchema = jobIdentity.extend({
  phase: z.enum([
    'preparing',
    'needs_install',
    'installing',
    'waiting_app',
    'waiting_authorization',
    'verifying',
    'connected',
    'cancelled',
    'expired',
    'failed',
  ]),
  canReopen: z.boolean(),
  expiresAt: z.string().datetime().optional(),
  error: z.string().max(280).optional(),
  connection: partnerConnectorConnectionSchema.optional(),
});
export type PartnerConnectorOnboardingT = z.infer<typeof partnerConnectorOnboardingSchema>;
const jobResult = z.object({ job: partnerConnectorOnboardingSchema }).strict();

export const connectorOnboardingInvokeChannels = {
  'partner.connectors.accounts': {
    name: 'partner.connectors.accounts',
    direction: 'invoke',
    input: owner,
    output: z.object({ connections: z.array(partnerConnectorConnectionSchema).max(64) }).strict(),
  },
  'partner.connectors.onboarding.start': {
    name: 'partner.connectors.onboarding.start',
    direction: 'invoke',
    input: owner.extend({ installCli: z.boolean().default(false) }),
    output: jobResult,
  },
  'partner.connectors.onboarding.get': {
    name: 'partner.connectors.onboarding.get',
    direction: 'invoke',
    input: jobIdentity,
    output: jobResult,
  },
  'partner.connectors.onboarding.cancel': {
    name: 'partner.connectors.onboarding.cancel',
    direction: 'invoke',
    input: jobIdentity,
    output: jobResult,
  },
  'partner.connectors.onboarding.reopen': {
    name: 'partner.connectors.onboarding.reopen',
    direction: 'invoke',
    input: jobIdentity,
    output: z.object({ ok: z.literal(true) }).strict(),
  },
} as const;

export const connectorOnboardingPushChannels = {
  'partner.connectors.onboarding.changed': {
    name: 'partner.connectors.onboarding.changed',
    direction: 'push',
    payload: jobResult,
  },
} as const;
