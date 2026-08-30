const ALGORITHM = 'argon2id' as const;

export function hashPassword(password: string): Promise<string> {
  return Bun.password.hash(password, ALGORITHM);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  try {
    return await Bun.password.verify(password, hash);
  } catch {
    return false;
  }
}

const DUMMY_HASH = await hashPassword(`unusable-${crypto.randomUUID()}`);

export async function consumeVerificationTime(password: string): Promise<void> {
  await verifyPassword(password, DUMMY_HASH);
}
