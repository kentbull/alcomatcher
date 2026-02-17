import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { env } from "../config/env.js";
import type { OtpChallenge, UserRole } from "../types/auth.js";

interface UserRow {
  user_id: string;
  email: string;
  role: UserRole;
  is_active: boolean;
  created_at: Date;
}

interface OtpChallengeRow {
  challenge_id: string;
  user_id: string;
  email: string;
  code_hash: string;
  attempt_count: number;
  max_attempts: number;
  expires_at: Date;
  consumed_at: Date | null;
}

export class AuthStore {
  private readonly pool: Pool;
  private schemaReady = false;

  constructor() {
    this.pool = new Pool({ connectionString: env.DATABASE_URL });
  }

  private async ensureSchema(): Promise<void> {
    if (this.schemaReady) return;
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS auth_users (
        user_id UUID PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        role TEXT NOT NULL CHECK (role IN ('compliance_officer', 'compliance_manager')),
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS otp_challenges (
        challenge_id UUID PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES auth_users(user_id),
        email TEXT NOT NULL,
        code_hash TEXT NOT NULL,
        attempt_count INTEGER NOT NULL DEFAULT 0,
        max_attempts INTEGER NOT NULL DEFAULT 5,
        expires_at TIMESTAMPTZ NOT NULL,
        consumed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await this.pool.query("CREATE INDEX IF NOT EXISTS idx_auth_users_email ON auth_users(email);");
    await this.pool.query(
      "CREATE INDEX IF NOT EXISTS idx_otp_challenges_email_created_at ON otp_challenges(email, created_at DESC);"
    );
    this.schemaReady = true;
  }

  async upsertUser(email: string, role: UserRole): Promise<void> {
    await this.ensureSchema();
    await this.pool.query(
      `
      INSERT INTO auth_users (user_id, email, role, is_active, created_at)
      VALUES ($1::uuid, $2, $3, TRUE, NOW())
      ON CONFLICT (email)
      DO UPDATE SET role = EXCLUDED.role,
                    is_active = TRUE
      `,
      [randomUUID(), email.toLowerCase(), role]
    );
  }

  async getUserByEmail(email: string): Promise<UserRow | null> {
    await this.ensureSchema();
    const { rows } = await this.pool.query<UserRow>(
      `
      SELECT user_id, email, role, is_active, created_at
      FROM auth_users
      WHERE email = $1
      LIMIT 1
      `,
      [email.toLowerCase()]
    );
    return rows[0] ?? null;
  }

  async getUserById(userId: string): Promise<UserRow | null> {
    await this.ensureSchema();
    const { rows } = await this.pool.query<UserRow>(
      `
      SELECT user_id, email, role, is_active, created_at
      FROM auth_users
      WHERE user_id = $1::uuid
      LIMIT 1
      `,
      [userId]
    );
    return rows[0] ?? null;
  }

  async createOtpChallenge(input: {
    userId: string;
    email: string;
    codeHash: string;
    expiresAt: string;
    maxAttempts: number;
  }): Promise<void> {
    await this.ensureSchema();
    await this.pool.query(
      `
      INSERT INTO otp_challenges (
        challenge_id,
        user_id,
        email,
        code_hash,
        attempt_count,
        max_attempts,
        expires_at,
        created_at
      )
      VALUES ($1::uuid, $2::uuid, $3, $4, 0, $5, $6::timestamptz, NOW())
      `,
      [randomUUID(), input.userId, input.email.toLowerCase(), input.codeHash, input.maxAttempts, input.expiresAt]
    );
  }

  async getActiveOtpChallenge(email: string): Promise<OtpChallenge | null> {
    await this.ensureSchema();
    const { rows } = await this.pool.query<OtpChallengeRow>(
      `
      SELECT challenge_id, user_id, email, code_hash, attempt_count, max_attempts, expires_at, consumed_at
      FROM otp_challenges
      WHERE email = $1
        AND consumed_at IS NULL
        AND expires_at > NOW()
      ORDER BY created_at DESC
      LIMIT 1
      `,
      [email.toLowerCase()]
    );
    const row = rows[0];
    if (!row) return null;
    return {
      challengeId: row.challenge_id,
      userId: row.user_id,
      email: row.email,
      codeHash: row.code_hash,
      attemptCount: row.attempt_count,
      maxAttempts: row.max_attempts,
      expiresAt: row.expires_at.toISOString(),
      consumedAt: row.consumed_at ? row.consumed_at.toISOString() : undefined
    };
  }

  async incrementOtpAttempts(challengeId: string): Promise<{ attemptCount: number; maxAttempts: number }> {
    await this.ensureSchema();
    const { rows } = await this.pool.query<{ attempt_count: number; max_attempts: number }>(
      `
      UPDATE otp_challenges
      SET attempt_count = attempt_count + 1
      WHERE challenge_id = $1::uuid
      RETURNING attempt_count, max_attempts
      `,
      [challengeId]
    );
    const row = rows[0];
    if (!row) return { attemptCount: 0, maxAttempts: 0 };
    return {
      attemptCount: row.attempt_count,
      maxAttempts: row.max_attempts
    };
  }

  async consumeOtpChallenge(challengeId: string): Promise<void> {
    await this.ensureSchema();
    await this.pool.query(
      `
      UPDATE otp_challenges
      SET consumed_at = NOW()
      WHERE challenge_id = $1::uuid
      `,
      [challengeId]
    );
  }
}

export const authStore = new AuthStore();
