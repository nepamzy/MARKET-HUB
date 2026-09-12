import argon2 from "argon2";

/**
 * Argon2id is the OWASP-recommended password hashing algorithm — memory-hard
 * and resistant to GPU cracking, unlike bcrypt's fixed cost factor.
 */
export async function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, { type: argon2.argon2id });
}

export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    return false;
  }
}
