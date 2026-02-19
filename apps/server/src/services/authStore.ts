import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { env } from "../config/env.js";
import type { AuthUserRecord, OtpChallenge, UserRole } from "../types/auth.js";

interface UserRow {
  user_id: string;
  email: string;
  role: UserRole;
  is_active: boolean;
  email_verified_at: Date | null;
  created_at: Date;
  updated_at: Date;
  token_version: number;
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

interface VerificationChallengeRow {
  challenge_id: string;
  user_id: string;
  email: string;
  token_hash: string;
  verification_token: string | null;
  expires_at: Date;
  consumed_at: Date | null;
  email_job_status: "queued" | "sent" | "failed";
  email_job_error: string | null;
  send_attempt_count: number;
  last_attempt_at: Date | null;
  next_attempt_at: Date | null;
  mobile_signup: boolean;
  created_at: Date;
}

interface OtpEmailJobRow {
  job_id: string;
  challenge_id: string;
  user_id: string;
  email: string;
  otp_code: string | null;
  status: "queued" | "sending" | "sent" | "failed";
  provider_message_id: string | null;
  attempt_count: number;
  last_attempt_at: Date | null;
  next_attempt_at: Date | null;
  last_error: string | null;
  created_at: Date;
}

function mapUserRow(row: UserRow): AuthUserRecord {
  return {
    userId: row.user_id,
    email: row.email,
    role: row.role,
    isActive: row.is_active,
    emailVerifiedAt: row.email_verified_at?.toISOString(),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    tokenVersion: row.token_version
  };
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
        email_verified_at TIMESTAMPTZ,
        token_version INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await this.pool.query(`ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;`);
    await this.pool.query(`ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0;`);
    await this.pool.query(`ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();`);
    await this.pool.query(`
      UPDATE auth_users
      SET updated_at = NOW()
      WHERE updated_at IS NULL;
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

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS otp_email_jobs (
        job_id UUID PRIMARY KEY,
        challenge_id UUID NOT NULL REFERENCES otp_challenges(challenge_id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES auth_users(user_id),
        email TEXT NOT NULL,
        otp_code TEXT,
        status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sending', 'sent', 'failed')),
        provider_message_id TEXT,
        attempt_count INTEGER NOT NULL DEFAULT 0,
        last_attempt_at TIMESTAMPTZ,
        next_attempt_at TIMESTAMPTZ,
        last_error TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (challenge_id)
      );
    `);

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS email_verification_challenges (
        challenge_id UUID PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES auth_users(user_id),
        email TEXT NOT NULL,
        token_hash TEXT NOT NULL UNIQUE,
        verification_token TEXT,
        expires_at TIMESTAMPTZ NOT NULL,
        consumed_at TIMESTAMPTZ,
        email_job_status TEXT NOT NULL DEFAULT 'queued',
        email_job_error TEXT,
        send_attempt_count INTEGER NOT NULL DEFAULT 0,
        last_attempt_at TIMESTAMPTZ,
        next_attempt_at TIMESTAMPTZ,
        requested_ip TEXT,
        requested_user_agent TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS auth_role_audit (
        audit_id UUID PRIMARY KEY,
        target_user_id UUID NOT NULL REFERENCES auth_users(user_id),
        old_role TEXT NOT NULL CHECK (old_role IN ('compliance_officer', 'compliance_manager')),
        new_role TEXT NOT NULL CHECK (new_role IN ('compliance_officer', 'compliance_manager')),
        changed_by_user_id UUID NOT NULL REFERENCES auth_users(user_id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await this.pool.query("CREATE INDEX IF NOT EXISTS idx_auth_users_email ON auth_users(email);");
    await this.pool.query(
      "CREATE INDEX IF NOT EXISTS idx_otp_challenges_email_created_at ON otp_challenges(email, created_at DESC);"
    );
    await this.pool.query(
      "CREATE INDEX IF NOT EXISTS idx_otp_email_jobs_status_next_attempt_created_at ON otp_email_jobs(status, next_attempt_at, created_at);"
    );
    await this.pool.query("CREATE INDEX IF NOT EXISTS idx_otp_email_jobs_challenge_id ON otp_email_jobs(challenge_id);");
    await this.pool.query(
      "CREATE INDEX IF NOT EXISTS idx_email_verification_challenges_email_created_at ON email_verification_challenges(email, created_at DESC);"
    );
    await this.pool.query(
      "CREATE INDEX IF NOT EXISTS idx_email_verification_challenges_job_status_created_at ON email_verification_challenges(email_job_status, created_at ASC);"
    );
    await this.pool.query("ALTER TABLE email_verification_challenges ADD COLUMN IF NOT EXISTS send_attempt_count INTEGER NOT NULL DEFAULT 0;");
    await this.pool.query("ALTER TABLE email_verification_challenges ADD COLUMN IF NOT EXISTS last_attempt_at TIMESTAMPTZ;");
    await this.pool.query("ALTER TABLE email_verification_challenges ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMPTZ;");
    await this.pool.query(
      "CREATE INDEX IF NOT EXISTS idx_email_verification_challenges_retry_window ON email_verification_challenges(email_job_status, next_attempt_at, created_at);"
    );
    await this.pool.query("ALTER TABLE email_verification_challenges ADD COLUMN IF NOT EXISTS verification_token TEXT;");
    await this.pool.query("ALTER TABLE otp_email_jobs ADD COLUMN IF NOT EXISTS otp_code TEXT;");
    await this.pool.query("ALTER TABLE otp_email_jobs ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'queued';");
    await this.pool.query("ALTER TABLE otp_email_jobs ADD COLUMN IF NOT EXISTS provider_message_id TEXT;");
    await this.pool.query("ALTER TABLE otp_email_jobs ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 0;");
    await this.pool.query("ALTER TABLE otp_email_jobs ADD COLUMN IF NOT EXISTS last_attempt_at TIMESTAMPTZ;");
    await this.pool.query("ALTER TABLE otp_email_jobs ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMPTZ;");
    await this.pool.query("ALTER TABLE otp_email_jobs ADD COLUMN IF NOT EXISTS last_error TEXT;");
    await this.pool.query("ALTER TABLE email_verification_challenges ADD COLUMN IF NOT EXISTS mobile_signup BOOLEAN NOT NULL DEFAULT FALSE;");

    this.schemaReady = true;
  }

  async upsertUser(email: string, role: UserRole): Promise<void> {
    await this.ensureSchema();
    await this.pool.query(
      `
      INSERT INTO auth_users (user_id, email, role, is_active, email_verified_at, created_at, updated_at)
      VALUES ($1::uuid, $2, $3, TRUE, NOW(), NOW(), NOW())
      ON CONFLICT (email)
      DO UPDATE SET role = EXCLUDED.role,
                    is_active = TRUE,
                    email_verified_at = COALESCE(auth_users.email_verified_at, NOW()),
                    updated_at = NOW()
      `,
      [randomUUID(), email.toLowerCase(), role]
    );
  }

  async createOrGetRegisteredUser(email: string): Promise<AuthUserRecord> {
    await this.ensureSchema();
    const normalized = email.toLowerCase();
    const existing = await this.getUserByEmail(normalized);
    if (existing) return existing;

    const inserted = await this.pool.query<UserRow>(
      `
      INSERT INTO auth_users (user_id, email, role, is_active, created_at, updated_at)
      VALUES ($1::uuid, $2, 'compliance_officer', TRUE, NOW(), NOW())
      RETURNING user_id, email, role, is_active, email_verified_at, created_at, updated_at, token_version
      `,
      [randomUUID(), normalized]
    );
    return mapUserRow(inserted.rows[0]);
  }

  async getUserByEmail(email: string): Promise<AuthUserRecord | null> {
    await this.ensureSchema();
    const { rows } = await this.pool.query<UserRow>(
      `
      SELECT user_id, email, role, is_active, email_verified_at, created_at, updated_at, token_version
      FROM auth_users
      WHERE email = $1
      LIMIT 1
      `,
      [email.toLowerCase()]
    );
    return rows[0] ? mapUserRow(rows[0]) : null;
  }

  async getUserById(userId: string): Promise<AuthUserRecord | null> {
    await this.ensureSchema();
    const { rows } = await this.pool.query<UserRow>(
      `
      SELECT user_id, email, role, is_active, email_verified_at, created_at, updated_at, token_version
      FROM auth_users
      WHERE user_id = $1::uuid
      LIMIT 1
      `,
      [userId]
    );
    return rows[0] ? mapUserRow(rows[0]) : null;
  }

  async markUserEmailVerified(userId: string): Promise<void> {
    await this.ensureSchema();
    await this.pool.query(
      `
      UPDATE auth_users
      SET email_verified_at = COALESCE(email_verified_at, NOW()),
          updated_at = NOW()
      WHERE user_id = $1::uuid
      `,
      [userId]
    );
  }

  async createOtpChallenge(input: {
    userId: string;
    email: string;
    codeHash: string;
    expiresAt: string;
    maxAttempts: number;
  }): Promise<string> {
    await this.ensureSchema();
    const challengeId = randomUUID();
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
      [challengeId, input.userId, input.email.toLowerCase(), input.codeHash, input.maxAttempts, input.expiresAt]
    );
    return challengeId;
  }

  async createOtpEmailJob(input: {
    challengeId: string;
    userId: string;
    email: string;
    otpCode: string;
    nextAttemptAt?: string;
  }): Promise<string> {
    await this.ensureSchema();
    const jobId = randomUUID();
    await this.pool.query(
      `
      INSERT INTO otp_email_jobs (
        job_id,
        challenge_id,
        user_id,
        email,
        otp_code,
        status,
        attempt_count,
        next_attempt_at,
        created_at
      )
      VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, 'queued', 0, $6::timestamptz, NOW())
      ON CONFLICT (challenge_id)
      DO UPDATE SET otp_code = EXCLUDED.otp_code,
                    status = 'queued',
                    next_attempt_at = EXCLUDED.next_attempt_at,
                    last_error = NULL
      `,
      [jobId, input.challengeId, input.userId, input.email.toLowerCase(), input.otpCode, input.nextAttemptAt ?? new Date().toISOString()]
    );
    return jobId;
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

  async getOtpChallengeById(challengeId: string): Promise<OtpChallenge | null> {
    await this.ensureSchema();
    const { rows } = await this.pool.query<OtpChallengeRow>(
      `
      SELECT challenge_id, user_id, email, code_hash, attempt_count, max_attempts, expires_at, consumed_at
      FROM otp_challenges
      WHERE challenge_id = $1::uuid
      LIMIT 1
      `,
      [challengeId]
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

  async consumeOtpChallengeAndClearOtpJobs(challengeId: string): Promise<void> {
    await this.ensureSchema();
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `
        UPDATE otp_challenges
        SET consumed_at = NOW()
        WHERE challenge_id = $1::uuid
        `,
        [challengeId]
      );
      await client.query(
        `
        UPDATE otp_email_jobs
        SET status = CASE WHEN status = 'sent' THEN status ELSE 'failed' END,
            otp_code = NULL,
            next_attempt_at = NULL,
            last_error = CASE WHEN status = 'sent' THEN last_error ELSE COALESCE(last_error, 'challenge_consumed') END
        WHERE challenge_id = $1::uuid
          AND status IN ('queued', 'sending')
        `,
        [challengeId]
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async claimPendingOtpEmailJobs(
    limit: number
  ): Promise<Array<{ jobId: string; challengeId: string; userId: string; email: string; otpCode: string; attemptCount: number }>> {
    await this.ensureSchema();
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const selected = await client.query<OtpEmailJobRow>(
        `
        SELECT job_id, challenge_id, user_id, email, otp_code, status, provider_message_id, attempt_count, last_attempt_at, next_attempt_at, last_error, created_at
        FROM otp_email_jobs
        WHERE status = 'queued'
          AND otp_code IS NOT NULL
          AND (next_attempt_at IS NULL OR next_attempt_at <= NOW())
        ORDER BY created_at ASC
        LIMIT $1
        FOR UPDATE SKIP LOCKED
        `,
        [limit]
      );
      if (selected.rows.length === 0) {
        await client.query("COMMIT");
        return [];
      }

      const jobIds = selected.rows.map((row) => row.job_id);
      await client.query(
        `
        UPDATE otp_email_jobs
        SET status = 'sending'
        WHERE job_id = ANY($1::uuid[])
        `,
        [jobIds]
      );
      await client.query("COMMIT");
      return selected.rows.map((row) => ({
          jobId: row.job_id,
          challengeId: row.challenge_id,
          userId: row.user_id,
          email: row.email,
          otpCode: String(row.otp_code),
          attemptCount: row.attempt_count
        }));
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async markOtpEmailSent(jobId: string, providerMessageId?: string): Promise<void> {
    await this.ensureSchema();
    await this.pool.query(
      `
      UPDATE otp_email_jobs
      SET status = 'sent',
          provider_message_id = COALESCE($2, provider_message_id),
          attempt_count = attempt_count + 1,
          last_attempt_at = NOW(),
          next_attempt_at = NULL,
          otp_code = NULL,
          last_error = NULL
      WHERE job_id = $1::uuid
      `,
      [jobId, providerMessageId ?? null]
    );
  }

  async markOtpEmailRetry(jobId: string, errorMessage: string, retryAfterSeconds: number): Promise<void> {
    await this.ensureSchema();
    await this.pool.query(
      `
      UPDATE otp_email_jobs
      SET status = 'queued',
          attempt_count = attempt_count + 1,
          last_attempt_at = NOW(),
          next_attempt_at = NOW() + ($3 * INTERVAL '1 second'),
          last_error = $2
      WHERE job_id = $1::uuid
      `,
      [jobId, errorMessage.slice(0, 500), Math.max(1, retryAfterSeconds)]
    );
  }

  async markOtpEmailFailed(jobId: string, errorMessage: string): Promise<void> {
    await this.ensureSchema();
    await this.pool.query(
      `
      UPDATE otp_email_jobs
      SET status = 'failed',
          attempt_count = attempt_count + 1,
          last_attempt_at = NOW(),
          next_attempt_at = NULL,
          otp_code = NULL,
          last_error = $2
      WHERE job_id = $1::uuid
      `,
      [jobId, errorMessage.slice(0, 500)]
    );
  }

  async createEmailVerificationChallenge(input: {
    userId: string;
    email: string;
    tokenHash: string;
    expiresAt: string;
    requestedIp?: string;
    requestedUserAgent?: string;
    verificationToken: string;
    mobileSignup?: boolean;
  }): Promise<void> {
    await this.ensureSchema();
    await this.pool.query(
      `
      INSERT INTO email_verification_challenges (
        challenge_id,
        user_id,
        email,
        token_hash,
        verification_token,
        expires_at,
        email_job_status,
        send_attempt_count,
        next_attempt_at,
        requested_ip,
        requested_user_agent,
        mobile_signup,
        created_at
      )
      VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6::timestamptz, 'queued', 0, NOW(), $7, $8, $9, NOW())
      `,
      [
        randomUUID(),
        input.userId,
        input.email.toLowerCase(),
        input.tokenHash,
        input.verificationToken,
        input.expiresAt,
        input.requestedIp ?? null,
        input.requestedUserAgent ?? null,
        input.mobileSignup ?? false
      ]
    );
  }

  async consumeEmailVerificationChallengeByTokenHash(tokenHash: string): Promise<{ userId: string; email: string } | null> {
    await this.ensureSchema();
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const select = await client.query<VerificationChallengeRow>(
        `
        SELECT challenge_id, user_id, email, token_hash, verification_token, expires_at, consumed_at, email_job_status, email_job_error, created_at
        FROM email_verification_challenges
        WHERE token_hash = $1
        LIMIT 1
        FOR UPDATE
        `,
        [tokenHash]
      );
      const row = select.rows[0];
      if (!row || row.consumed_at || row.expires_at.getTime() <= Date.now()) {
        await client.query("ROLLBACK");
        return null;
      }

      await client.query(
        `
        UPDATE email_verification_challenges
        SET consumed_at = NOW()
        WHERE challenge_id = $1::uuid
        `,
        [row.challenge_id]
      );
      await client.query(
        `
        UPDATE auth_users
        SET email_verified_at = COALESCE(email_verified_at, NOW()),
            updated_at = NOW()
        WHERE user_id = $1::uuid
        `,
        [row.user_id]
      );

      await client.query("COMMIT");
      return { userId: row.user_id, email: row.email };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async listPendingVerificationEmails(limit: number): Promise<Array<{ challengeId: string; email: string }>> {
    await this.ensureSchema();
    const { rows } = await this.pool.query<{ challenge_id: string; email: string }>(
      `
      SELECT challenge_id, email
      FROM email_verification_challenges
      WHERE email_job_status = 'queued'
        AND consumed_at IS NULL
        AND expires_at > NOW()
        AND (next_attempt_at IS NULL OR next_attempt_at <= NOW())
      ORDER BY created_at ASC
      LIMIT $1
      `,
      [limit]
    );
    return rows.map((row) => ({ challengeId: row.challenge_id, email: row.email }));
  }

  async getVerificationChallenge(challengeId: string): Promise<{ challengeId: string; email: string; verificationToken: string; expiresAt: string; mobileSignup: boolean } | null> {
    await this.ensureSchema();
    const { rows } = await this.pool.query<VerificationChallengeRow>(
      `
      SELECT challenge_id, user_id, email, token_hash, verification_token, expires_at, consumed_at, email_job_status, email_job_error, send_attempt_count, last_attempt_at, next_attempt_at, mobile_signup, created_at
      FROM email_verification_challenges
      WHERE challenge_id = $1::uuid
      LIMIT 1
      `,
      [challengeId]
    );
    const row = rows[0];
    if (!row || !row.verification_token) return null;
    return {
      challengeId: row.challenge_id,
      email: row.email,
      verificationToken: row.verification_token,
      expiresAt: row.expires_at.toISOString(),
      mobileSignup: row.mobile_signup
    };
  }

  async markVerificationEmailSent(challengeId: string): Promise<void> {
    await this.ensureSchema();
    await this.pool.query(
      `
      UPDATE email_verification_challenges
      SET email_job_status = 'sent',
          email_job_error = NULL,
          verification_token = NULL,
          last_attempt_at = NOW(),
          next_attempt_at = NULL
      WHERE challenge_id = $1::uuid
      `,
      [challengeId]
    );
  }

  async markVerificationEmailFailed(
    challengeId: string,
    errorMessage: string,
    options?: { retryAfterSeconds?: number; maxAttempts?: number }
  ): Promise<void> {
    await this.ensureSchema();
    const retryAfter = Math.max(1, options?.retryAfterSeconds ?? 30);
    const maxAttempts = Math.max(1, options?.maxAttempts ?? 5);
    await this.pool.query(
      `
      UPDATE email_verification_challenges
      SET send_attempt_count = send_attempt_count + 1,
          email_job_status = CASE
            WHEN send_attempt_count + 1 >= $3 THEN 'failed'
            ELSE 'queued'
          END,
          email_job_error = $2,
          last_attempt_at = NOW(),
          next_attempt_at = CASE
            WHEN send_attempt_count + 1 >= $3 THEN NULL
            ELSE NOW() + ($4 * INTERVAL '1 second')
          END
      WHERE challenge_id = $1::uuid
      `,
      [challengeId, errorMessage.slice(0, 500), maxAttempts, retryAfter]
    );
  }

  async listUsers(options: {
    limit: number;
    cursor?: string;
    role?: UserRole;
    verified?: boolean;
    active?: boolean;
  }): Promise<{ items: AuthUserRecord[]; nextCursor: string | null }> {
    await this.ensureSchema();
    const params: Array<string | number | boolean | null> = [];
    const clauses: string[] = ["1=1"];

    if (options.role) {
      params.push(options.role);
      clauses.push(`role = $${params.length}`);
    }
    if (typeof options.verified === "boolean") {
      clauses.push(options.verified ? "email_verified_at IS NOT NULL" : "email_verified_at IS NULL");
    }
    if (typeof options.active === "boolean") {
      params.push(options.active);
      clauses.push(`is_active = $${params.length}`);
    }

    if (options.cursor) {
      const [createdAt, userId] = options.cursor.split("|");
      if (createdAt && userId) {
        params.push(createdAt);
        params.push(userId);
        const tsIndex = params.length - 1;
        const idIndex = params.length;
        clauses.push(`(created_at, user_id) < ($${tsIndex}::timestamptz, $${idIndex}::uuid)`);
      }
    }

    params.push(options.limit + 1);
    const limitIndex = params.length;

    const { rows } = await this.pool.query<UserRow>(
      `
      SELECT user_id, email, role, is_active, email_verified_at, created_at, updated_at, token_version
      FROM auth_users
      WHERE ${clauses.join(" AND ")}
      ORDER BY created_at DESC, user_id DESC
      LIMIT $${limitIndex}
      `,
      params
    );

    const mapped = rows.map(mapUserRow);
    const hasMore = mapped.length > options.limit;
    const items = hasMore ? mapped.slice(0, options.limit) : mapped;
    const tail = items[items.length - 1];
    const nextCursor = hasMore && tail ? `${tail.createdAt}|${tail.userId}` : null;
    return { items, nextCursor };
  }

  async promoteUser(targetUserId: string, changedByUserId: string): Promise<AuthUserRecord | null> {
    await this.ensureSchema();
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const existing = await client.query<UserRow>(
        `
        SELECT user_id, email, role, is_active, email_verified_at, created_at, updated_at, token_version
        FROM auth_users
        WHERE user_id = $1::uuid
        LIMIT 1
        FOR UPDATE
        `,
        [targetUserId]
      );
      const row = existing.rows[0];
      if (!row) {
        await client.query("ROLLBACK");
        return null;
      }

      if (row.role !== "compliance_manager") {
        await client.query(
          `
          UPDATE auth_users
          SET role = 'compliance_manager',
              token_version = token_version + 1,
              updated_at = NOW()
          WHERE user_id = $1::uuid
          `,
          [targetUserId]
        );

        await client.query(
          `
          INSERT INTO auth_role_audit (audit_id, target_user_id, old_role, new_role, changed_by_user_id, created_at)
          VALUES ($1::uuid, $2::uuid, $3, 'compliance_manager', $4::uuid, NOW())
          `,
          [randomUUID(), targetUserId, row.role, changedByUserId]
        );
      }

      const updated = await client.query<UserRow>(
        `
        SELECT user_id, email, role, is_active, email_verified_at, created_at, updated_at, token_version
        FROM auth_users
        WHERE user_id = $1::uuid
        LIMIT 1
        `,
        [targetUserId]
      );
      await client.query("COMMIT");
      return updated.rows[0] ? mapUserRow(updated.rows[0]) : null;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async setUserActive(targetUserId: string, isActive: boolean, changedByUserId: string): Promise<AuthUserRecord | null> {
    await this.ensureSchema();
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const updated = await client.query<UserRow>(
        `
        UPDATE auth_users
        SET is_active = $2,
            token_version = token_version + 1,
            updated_at = NOW()
        WHERE user_id = $1::uuid
        RETURNING user_id, email, role, is_active, email_verified_at, created_at, updated_at, token_version
        `,
        [targetUserId, isActive]
      );
      if (!updated.rows[0]) {
        await client.query("ROLLBACK");
        return null;
      }

      await client.query(
        `
        INSERT INTO auth_role_audit (audit_id, target_user_id, old_role, new_role, changed_by_user_id, created_at)
        VALUES ($1::uuid, $2::uuid, $3, $4, $5::uuid, NOW())
        `,
        [randomUUID(), targetUserId, updated.rows[0].role, updated.rows[0].role, changedByUserId]
      );
      await client.query("COMMIT");
      return mapUserRow(updated.rows[0]);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async countUsers(): Promise<number> {
    await this.ensureSchema();
    const { rows } = await this.pool.query<{ count: string }>("SELECT COUNT(*)::text AS count FROM auth_users");
    return Number(rows[0]?.count ?? 0);
  }

  async countActiveManagers(): Promise<number> {
    await this.ensureSchema();
    const { rows } = await this.pool.query<{ count: string }>(
      `
      SELECT COUNT(*)::text AS count
      FROM auth_users
      WHERE role = 'compliance_manager'
        AND is_active = TRUE
      `
    );
    return Number(rows[0]?.count ?? 0);
  }

  async deleteUserAccountAndOwnedData(userId: string): Promise<{ deleted: boolean; deletedApplicationIds: string[] }> {
    await this.ensureSchema();
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const existing = await client.query<{ user_id: string; role: UserRole; is_active: boolean }>(
        `
        SELECT user_id, role, is_active
        FROM auth_users
        WHERE user_id = $1::uuid
        LIMIT 1
        FOR UPDATE
        `,
        [userId]
      );
      const user = existing.rows[0];
      if (!user) {
        await client.query("ROLLBACK");
        return { deleted: false, deletedApplicationIds: [] };
      }

      if (user.role === "compliance_manager" && user.is_active) {
        const managers = await client.query<{ count: string }>(
          `
          SELECT COUNT(*)::text AS count
          FROM auth_users
          WHERE role = 'compliance_manager'
            AND is_active = TRUE
          `
        );
        const activeManagers = Number(managers.rows[0]?.count ?? 0);
        if (activeManagers <= 1) {
          throw new Error("last_manager_cannot_delete");
        }
      }

      const ownedAppsResult = await client.query<{ application_id: string }>(
        `
        WITH owner_events AS (
          SELECT
            application_id,
            COALESCE(NULLIF(payload->>'ownerUserId', ''), NULLIF(payload->>'actorUserId', '')) AS owner_user_id,
            created_at,
            event_id
          FROM application_events
          WHERE event_type IN ('OwnershipClaimed', 'ApplicationCreated')
        ),
        latest_owner AS (
          SELECT DISTINCT ON (application_id)
            application_id,
            owner_user_id
          FROM owner_events
          WHERE owner_user_id IS NOT NULL
          ORDER BY application_id, created_at DESC, event_id DESC
        )
        SELECT application_id
        FROM latest_owner
        WHERE owner_user_id = $1
        `,
        [userId]
      );
      const applicationIds = ownedAppsResult.rows.map((row) => row.application_id);

      if (applicationIds.length > 0) {
        await client.query(
          `
          DELETE FROM batch_item_attempts
          WHERE batch_item_id IN (
            SELECT bi.batch_item_id
            FROM batch_items bi
            JOIN batch_jobs bj ON bj.batch_id = bi.batch_id
            WHERE bj.application_id = ANY($1::uuid[])
          )
          `,
          [applicationIds]
        );
        await client.query(
          `
          DELETE FROM batch_items
          WHERE batch_id IN (
            SELECT batch_id
            FROM batch_jobs
            WHERE application_id = ANY($1::uuid[])
          )
          `,
          [applicationIds]
        );
        await client.query("DELETE FROM batch_jobs WHERE application_id = ANY($1::uuid[])", [applicationIds]);
        await client.query("DELETE FROM submission_images WHERE application_id = ANY($1::uuid[])", [applicationIds]);
        await client.query("DELETE FROM application_crdt_ops WHERE application_id = ANY($1::uuid[])", [applicationIds]);
        await client.query("DELETE FROM application_events WHERE application_id = ANY($1::uuid[])", [applicationIds]);
        await client.query("DELETE FROM label_applications WHERE application_id = ANY($1::uuid[])", [applicationIds]);
      }

      await client.query("DELETE FROM otp_email_jobs WHERE user_id = $1::uuid", [userId]);
      await client.query("DELETE FROM otp_challenges WHERE user_id = $1::uuid", [userId]);
      await client.query("DELETE FROM email_verification_challenges WHERE user_id = $1::uuid", [userId]);
      await client.query("DELETE FROM auth_role_audit WHERE target_user_id = $1::uuid OR changed_by_user_id = $1::uuid", [userId]);

      const deleted = await client.query("DELETE FROM auth_users WHERE user_id = $1::uuid", [userId]);
      await client.query("COMMIT");
      return { deleted: (deleted.rowCount ?? 0) > 0, deletedApplicationIds: applicationIds };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async pruneExpiredVerificationChallenges(): Promise<number> {
    await this.ensureSchema();
    const { rowCount } = await this.pool.query(
      `
      DELETE FROM email_verification_challenges
      WHERE expires_at < NOW() - INTERVAL '1 day'
      `
    );
    return rowCount ?? 0;
  }
}

export const authStore = new AuthStore();
