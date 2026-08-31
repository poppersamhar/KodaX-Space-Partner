import path from 'node:path';
import { z } from 'zod';
import {
  partnerConnectorConnectionSchema,
  partnerRemoteSourceSchema,
  partnerRemoteProposalSchema,
  partnerRemoteReceiptSchema,
} from '@kodax-space/space-ipc-schema';
import {
  replaceFileWithoutFollowingAliases,
  withFileTransactionLock,
} from '../kodax/atomic-file.js';
import { assertOwnedDirectory, readRegularFile } from '../space-extensions/files.js';

const connectionSchema = partnerConnectorConnectionSchema.extend({
  appId: z.string().max(160),
  openId: z.string().max(160),
});
const databaseSchema = z
  .object({
    version: z.literal(1),
    connections: z.array(connectionSchema).max(64),
    sources: z.array(partnerRemoteSourceSchema).max(1000),
    proposals: z.array(partnerRemoteProposalSchema).max(1000),
    receipts: z.array(partnerRemoteReceiptSchema).max(1000),
    dispatchOwners: z.record(z.string(), z.number().int().positive()),
  })
  .strict();
export type ConnectorDatabase = z.infer<typeof databaseSchema>;
export type ConnectorAccount = z.infer<typeof connectionSchema>;
const MAX_BYTES = 32 * 1024 * 1024;
function writerAlive(pid: number | undefined): boolean {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/** Private, bounded host records. Tokens remain exclusively in the official CLI store. */
export class PartnerConnectorStore {
  private readonly file: string;
  constructor(private readonly root: string) {
    if (!path.isAbsolute(root) || path.resolve(root) === path.parse(root).root)
      throw new Error('Invalid connector data directory');
    this.file = path.join(root, 'records.json');
  }
  async read(): Promise<ConnectorDatabase> {
    try {
      await assertOwnedDirectory(this.root);
      return databaseSchema.parse(
        JSON.parse((await readRegularFile(this.file, MAX_BYTES)).toString('utf8')),
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT')
        return {
          version: 1,
          connections: [],
          sources: [],
          proposals: [],
          receipts: [],
          dispatchOwners: {},
        };
      throw error;
    }
  }
  async mutate<T>(operation: (db: ConnectorDatabase) => T): Promise<T> {
    await assertOwnedDirectory(this.root, true);
    return withFileTransactionLock(this.file, '连接器记录正在更新，请稍后再试', async () => {
      const db = await this.read();
      // A dead writer might already have changed the remote document: never replay it.
      for (const proposal of db.proposals) {
        if (proposal.status !== 'submitting') continue;
        const pid = db.dispatchOwners[proposal.id];
        if (!writerAlive(pid)) {
          proposal.status = 'unknown';
          proposal.error = '上次提交中断，请到飞书核对；不会自动重试';
          proposal.updatedAt = new Date().toISOString();
          delete db.dispatchOwners[proposal.id];
        }
      }
      const result = operation(db);
      const bytes = Buffer.from(JSON.stringify(databaseSchema.parse(db)));
      if (bytes.length > MAX_BYTES) throw new Error('连接器本地记录已达容量限制');
      await replaceFileWithoutFollowingAliases(this.file, bytes, '连接器记录在保存时发生变化');
      return result;
    });
  }
  async readReconciled(): Promise<ConnectorDatabase> {
    const db = await this.read();
    return db.proposals.some(
      (p) => p.status === 'submitting' && !writerAlive(db.dispatchOwners[p.id]),
    )
      ? this.mutate((value) => value)
      : db;
  }
}
