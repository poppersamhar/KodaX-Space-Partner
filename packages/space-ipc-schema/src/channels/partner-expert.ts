import { z } from 'zod';
import { skillMetaSchema } from './skill.js';

const identity = z
  .string()
  .min(1)
  .max(96)
  .regex(/^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/);

/** Skill is an optional explicit existing name, never an installation or discovery rule. */
export const spaceExpertDefinitionSchema = z
  .object({
    id: identity,
    revision: z.number().int().min(1).max(1_000_000),
    name: z.string().trim().min(1).max(80),
    description: z.string().max(280),
    prompt: z.string().trim().min(1).max(8_000),
    starterTasks: z.array(z.string().min(1).max(512)).max(4).default([]),
    skillRef: skillMetaSchema.shape.name.optional(),
  })
  .strict();
export type SpaceExpertDefinitionT = z.infer<typeof spaceExpertDefinitionSchema>;

/** The host assigns stable identity and revision; an editor submits content only. */
export const spaceExpertDraftSchema = spaceExpertDefinitionSchema.omit({
  id: true,
  revision: true,
});
export type SpaceExpertDraftT = z.infer<typeof spaceExpertDraftSchema>;

export const spaceExpertSaveInputSchema = z
  .object({
    extensionId: identity,
    expertId: identity.optional(),
    expectedRevision: z.number().int().min(1).max(1_000_000).optional(),
    values: spaceExpertDraftSchema,
  })
  .strict()
  .refine((input) => (input.expertId === undefined) === (input.expectedRevision === undefined), {
    message: 'Editing requires both the expert identity and its expected revision',
  });
export type SpaceExpertSaveInputT = z.infer<typeof spaceExpertSaveInputSchema>;

export const spaceExpertRefSchema = z
  .object({
    extensionId: identity,
    expertId: identity,
    revision: z.number().int().min(1).max(1_000_000),
    useSkill: z.boolean().optional(),
  })
  .strict();
export type SpaceExpertRefT = z.infer<typeof spaceExpertRefSchema>;

export const partnerExpertSnapshotSchema = z
  .object({
    extensionId: identity,
    extensionVersion: z.string().min(1).max(64),
    expert: spaceExpertDefinitionSchema,
    useSkill: z.boolean().optional(),
  })
  .strict();
export type PartnerExpertSnapshotT = z.infer<typeof partnerExpertSnapshotSchema>;

export const spaceExtensionsCatalogChannel = {
  name: 'space.extensions.catalog',
  direction: 'invoke',
  input: z.object({ extensionId: identity }).strict(),
  output: z.object({ experts: z.array(spaceExpertDefinitionSchema).max(256) }).strict(),
} as const;

export const spaceExtensionsResolveExpertChannel = {
  name: 'space.extensions.resolveExpert',
  direction: 'invoke',
  input: spaceExpertRefSchema,
  output: z.object({ expert: partnerExpertSnapshotSchema }).strict(),
} as const;

export const spaceExtensionsExpertSaveChannel = {
  name: 'space.extensions.expert.save',
  direction: 'invoke',
  input: spaceExpertSaveInputSchema,
  output: z.object({ expert: spaceExpertDefinitionSchema }).strict(),
} as const;

export const spaceExtensionsExpertDeleteChannel = {
  name: 'space.extensions.expert.delete',
  direction: 'invoke',
  input: spaceExpertRefSchema,
  output: z.object({ ok: z.literal(true) }).strict(),
} as const;

export const partnerExpertStateSchema = z
  .object({
    expert: partnerExpertSnapshotSchema.nullable(),
    available: z.boolean(),
    unavailableReason: z.string().max(280).optional(),
  })
  .strict();
export type PartnerExpertStateT = z.infer<typeof partnerExpertStateSchema>;

export const sessionPartnerExpertGetChannel = {
  name: 'session.partnerExpert.get',
  direction: 'invoke',
  input: z.object({ sessionId: z.string().min(1).max(128) }).strict(),
  output: partnerExpertStateSchema,
} as const;

export const sessionPartnerExpertSetChannel = {
  name: 'session.partnerExpert.set',
  direction: 'invoke',
  input: z
    .object({
      sessionId: z.string().min(1).max(128),
      expert: spaceExpertRefSchema.nullable(),
    })
    .strict(),
  output: partnerExpertStateSchema,
} as const;

export const sessionPartnerExpertChangedChannel = {
  name: 'session.partnerExpert.changed',
  direction: 'push',
  payload: z
    .object({ sessionId: z.string().min(1).max(128), state: partnerExpertStateSchema })
    .strict(),
} as const;
