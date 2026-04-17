/**
 * Master-key rotation CLI.
 *
 *   pnpm --filter @mynah/app rotate-master-key -- --old=<hex> --new=<hex>
 *
 * Decrypts every encrypted_payload / *_ciphertext row under the old key and
 * re-encrypts with the new key. Runs in a single transaction so a mid-run
 * failure rolls back and leaves all ciphertexts readable under the old key.
 *
 * Afterwards: update CREDENTIAL_MASTER_KEY in .env to the new hex and
 * restart the api + worker containers.
 */
import 'dotenv/config';
import { childLogger } from '../config/logger.js';
import { encrypt, decrypt } from '../credentials/cipher.js';
import { closeDb, getDb } from '../db/connection.js';
import {
  legendCredentials,
  legendEmailAccounts,
  platformSecrets,
} from '../db/schema.js';

const log = childLogger('rotate-master-key');

interface Args {
  oldKey: string;
  newKey: string;
}

function parseArgs(argv: readonly string[]): Args {
  const map = new Map<string, string>();
  for (const arg of argv) {
    const match = arg.match(/^--(old|new)=(.+)$/);
    if (match) map.set(match[1]!, match[2]!);
  }
  const oldKey = map.get('old');
  const newKey = map.get('new');
  if (!oldKey || !newKey) {
    throw new Error('Usage: rotate-master-key --old=<hex> --new=<hex>');
  }
  if (oldKey === newKey) throw new Error('--old and --new must differ');
  return { oldKey, newKey };
}

async function rotate(args: Args): Promise<void> {
  const db = getDb();
  const counters = { platformSecrets: 0, legendCredentials: 0, legendEmailAccounts: 0 };

  await db.transaction(async (tx) => {
    // --- platform_secrets ---
    const ps = await tx.select().from(platformSecrets);
    for (const row of ps) {
      const plaintext = decrypt(row.encryptedPayload, args.oldKey);
      const reEncrypted = encrypt(plaintext, args.newKey);
      await tx
        .update(platformSecrets)
        .set({ encryptedPayload: reEncrypted })
        .where(eqById(platformSecrets, row.id));
      counters.platformSecrets++;
    }

    // --- legend_credentials ---
    const lc = await tx.select().from(legendCredentials);
    for (const row of lc) {
      const plaintext = decrypt(row.encryptedPayload, args.oldKey);
      const reEncrypted = encrypt(plaintext, args.newKey);
      await tx
        .update(legendCredentials)
        .set({ encryptedPayload: reEncrypted })
        .where(eqById(legendCredentials, row.id));
      counters.legendCredentials++;
    }

    // --- legend_email_accounts (multiple ciphertext columns) ---
    const lea = await tx.select().from(legendEmailAccounts);
    for (const row of lea) {
      const patch: Record<string, string | null> = {
        passwordCiphertext: encrypt(decrypt(row.passwordCiphertext, args.oldKey), args.newKey),
      };
      if (row.recoveryPhoneCiphertext) {
        patch.recoveryPhoneCiphertext = encrypt(
          decrypt(row.recoveryPhoneCiphertext, args.oldKey),
          args.newKey,
        );
      }
      if (row.recoveryEmailCiphertext) {
        patch.recoveryEmailCiphertext = encrypt(
          decrypt(row.recoveryEmailCiphertext, args.oldKey),
          args.newKey,
        );
      }
      await tx.update(legendEmailAccounts).set(patch).where(eqById(legendEmailAccounts, row.id));
      counters.legendEmailAccounts++;
    }
  });

  log.info({ counters }, 'rotation complete');
  log.info(
    'now: update CREDENTIAL_MASTER_KEY in .env to the new hex, then restart api + worker',
  );
}

// Drizzle eq helper without a circular import.
import { eq } from 'drizzle-orm';
function eqById(
  table: { id: { name: string } },
  id: string,
): ReturnType<typeof eq> {
  // biome-ignore lint/suspicious/noExplicitAny: column type narrowing is noisy here
  return eq((table as any).id, id);
}

async function main(): Promise<void> {
  try {
    const args = parseArgs(process.argv.slice(2));
    log.info('starting rotation');
    await rotate(args);
    await closeDb();
    process.exit(0);
  } catch (err) {
    log.error({ err }, 'rotation failed');
    await closeDb().catch(() => undefined);
    process.exit(1);
  }
}

void main();
