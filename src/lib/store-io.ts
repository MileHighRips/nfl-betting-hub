import { promises as fs } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

type StoreQueueGlobal = typeof globalThis & {
  __nflBettingHubStoreQueues?: Map<string, Promise<void>>;
};

function getStoreQueues(): Map<string, Promise<void>> {
  const globalState = globalThis as StoreQueueGlobal;
  if (!globalState.__nflBettingHubStoreQueues) {
    globalState.__nflBettingHubStoreQueues = new Map();
  }
  return globalState.__nflBettingHubStoreQueues;
}

export function serializeStoreUpdate<T>(storePath: string, update: () => Promise<T>): Promise<T> {
  const queues = getStoreQueues();
  const result = (queues.get(storePath) ?? Promise.resolve()).then(update);
  queues.set(
    storePath,
    result.then(
      () => undefined,
      () => undefined,
    ),
  );
  return result;
}

export async function writeJsonAtomically(storePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(storePath), { recursive: true });
  const temporary = `${storePath}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(temporary, JSON.stringify(value, null, 2), 'utf-8');
    for (let attempt = 0; ; attempt++) {
      try {
        await fs.rename(temporary, storePath);
        return;
      } catch (error) {
        const retryable =
          error instanceof Error &&
          'code' in error &&
          (error.code === 'EPERM' || error.code === 'EBUSY');
        if (!retryable || attempt >= 29) throw error;
        await new Promise<void>((resolve) => setTimeout(resolve, 250));
      }
    }
  } catch (error) {
    try {
      await fs.rm(temporary, { force: true });
    } catch (cleanupError) {
      throw new Error(
        `Failed to write ${storePath} (${String(error)}); failed to remove ${temporary} (${String(cleanupError)})`,
      );
    }
    throw error;
  }
}
