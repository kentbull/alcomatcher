import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { authStore } from "./authStore.js";
import type { AuthUser, AuthUserRecord, UserRole } from "../types/auth.js";

interface SeedUser {
  email: string;
  role: UserRole;
}

interface JwtClaims {
  sub?: string;
  email?: string;
  role?: UserRole;
  tokenVersion?: number;
  typ?: string;
}

interface RateCounter {
  count: number;
  resetAt: number;
}

interface EmailSendFailure {
  message: string;
  statusCode?: number;
  retryAfterSeconds?: number;
}

const rateBuckets = new Map<string, RateCounter>();
const OTP_RETRY_DELAYS_SECONDS = [2, 5, 10] as const;

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function hashOtp(email: string, code: string): string {
  return createHash("sha256")
    .update(`${normalizeEmail(email)}:${code}:${env.JWT_SECRET}`)
    .digest("hex");
}

function hashToken(token: string): string {
  return createHash("sha256").update(`${token}:${env.JWT_SECRET}`).digest("hex");
}

function parseSeedUsers(): SeedUser[] {
  return env.AUTH_SEED_USERS.split(";")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [emailRaw, roleRaw] = entry.split(":");
      const email = normalizeEmail(emailRaw ?? "");
      const role: UserRole = roleRaw === "compliance_manager" ? "compliance_manager" : "compliance_officer";
      return { email, role };
    })
    .filter((entry) => Boolean(entry.email));
}

function isAppleReviewEmail(email: string): boolean {
  return normalizeEmail(email) === normalizeEmail(env.APPLE_REVIEW_EMAIL);
}

function isAppleReviewOverrideEnabled(): boolean {
  return Boolean(env.APPLE_REVIEW_OTP_ENABLED);
}

function staticOtpMatches(supplied: string, configured: string): boolean {
  const left = Buffer.from(supplied.trim(), "utf8");
  const right = Buffer.from(configured.trim(), "utf8");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function checkRateLimit(key: string, max: number, windowSeconds: number): boolean {
  const now = Date.now();
  const existing = rateBuckets.get(key);
  if (!existing || existing.resetAt <= now) {
    rateBuckets.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
    return true;
  }
  if (existing.count >= max) return false;
  existing.count += 1;
  return true;
}

function requireResendConfigured() {
  if (!env.RESEND_API_KEY || !env.RESEND_FROM_EMAIL) {
    throw new Error("email_provider_not_configured");
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function computeRetryBackoffSeconds(status: number | null, attempt: number): number {
  if (status === 429) {
    // Respect Resend low per-second caps while allowing queue progression.
    return Math.min(300, Math.max(2, 2 * attempt));
  }
  return Math.min(300, Math.max(5, 5 * attempt));
}

function computeOtpRetryDelaySeconds(attempt: number): number {
  return OTP_RETRY_DELAYS_SECONDS[Math.max(0, Math.min(OTP_RETRY_DELAYS_SECONDS.length - 1, attempt - 1))] ?? 10;
}

function isTransientEmailFailure(statusCode?: number): boolean {
  if (typeof statusCode !== "number") return true;
  return statusCode === 408 || statusCode === 429 || statusCode >= 500;
}

function assertOtpEligible(user: AuthUserRecord | null): asserts user is AuthUserRecord {
  if (!user || !user.isActive) throw new Error("user_not_found");
  if (!user.emailVerifiedAt) throw new Error("email_not_verified");
}

export class AuthService {
  private seeded = false;

  private async ensureSeedUsers() {
    if (this.seeded) return;
    const users = parseSeedUsers();
    for (const user of users) {
      await authStore.upsertUser(user.email, user.role);
    }
    if (isAppleReviewOverrideEnabled()) {
      await authStore.upsertUser(env.APPLE_REVIEW_EMAIL, "compliance_officer");
    }
    this.seeded = true;
  }

  private signAuthToken(user: AuthUserRecord): string {
    return jwt.sign(
      {
        sub: user.userId,
        email: user.email,
        role: user.role,
        tokenVersion: user.tokenVersion
      },
      env.JWT_SECRET,
      { expiresIn: `${env.JWT_EXPIRES_HOURS}h` }
    );
  }

  private async sendOtpEmail(email: string, code: string): Promise<{ providerMessageId?: string }> {
    requireResendConfigured();
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: env.RESEND_FROM_EMAIL,
        to: [email],
        subject: "Your AlcoMatcher OTP code",
        html: `<p>Your AlcoMatcher sign-in code is:</p><p style="font-size:24px;letter-spacing:2px;"><strong>${code}</strong></p><p>This code expires in ${env.OTP_TTL_MINUTES} minutes.</p>`
      })
    });

    if (!response.ok) {
      const text = await response.text();
      const retryAfterRaw = response.headers.get("retry-after");
      const retryAfter = retryAfterRaw ? Number(retryAfterRaw) : undefined;
      const failure: EmailSendFailure = {
        message: `resend_status_${response.status}:${text.slice(0, 220)}`,
        statusCode: response.status,
        retryAfterSeconds: Number.isFinite(retryAfter) ? Math.max(1, Number(retryAfter)) : undefined
      };
      throw failure;
    }

    const payload = (await response.json().catch(() => ({}))) as { id?: string };
    return { providerMessageId: typeof payload.id === "string" ? payload.id : undefined };
  }

  private async sendRegistrationVerificationEmail(email: string, verificationToken: string): Promise<void> {
    requireResendConfigured();
    const verifyUrl = `${env.APP_BASE_URL}/api/auth/register/verify?token=${encodeURIComponent(verificationToken)}`;
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: env.RESEND_FROM_EMAIL,
        to: [email],
        subject: "Verify your AlcoMatcher account",
        html: `<p>Welcome to AlcoMatcher.</p><p>Verify your account:</p><p><a href="${verifyUrl}">Verify Email</a></p><p>This link expires in ${env.EMAIL_VERIFY_TTL_MINUTES} minutes.</p>`
      })
    });

    if (!response.ok) {
      const text = await response.text();
      const retryAfterRaw = response.headers.get("retry-after");
      const retryAfter = retryAfterRaw ? Number(retryAfterRaw) : undefined;
      const failure: EmailSendFailure = {
        message: `resend_status_${response.status}:${text.slice(0, 220)}`,
        statusCode: response.status,
        retryAfterSeconds: Number.isFinite(retryAfter) ? Math.max(1, Number(retryAfter)) : undefined
      };
      throw failure;
    }
  }

  async requestRegistration(rawEmail: string, context?: { ip?: string; userAgent?: string }): Promise<{ ok: true; expiresInMinutes: number; debugVerifyUrl?: string }> {
    await this.ensureSeedUsers();
    const email = normalizeEmail(rawEmail);
    if (!checkRateLimit(`register:${email}`, env.REGISTER_RATE_LIMIT_MAX, env.REGISTER_RATE_LIMIT_WINDOW_SEC)) {
      throw new Error("rate_limited");
    }

    const user = await authStore.createOrGetRegisteredUser(email);
    if (user.emailVerifiedAt) {
      return { ok: true, expiresInMinutes: env.EMAIL_VERIFY_TTL_MINUTES };
    }

    const token = randomBytes(32).toString("base64url");
    const tokenHash = hashToken(token);
    const expiresAt = new Date(Date.now() + env.EMAIL_VERIFY_TTL_MINUTES * 60 * 1000).toISOString();
    await authStore.createEmailVerificationChallenge({
      userId: user.userId,
      email,
      tokenHash,
      verificationToken: token,
      expiresAt,
      requestedIp: context?.ip,
      requestedUserAgent: context?.userAgent
    });

    return {
      ok: true,
      expiresInMinutes: env.EMAIL_VERIFY_TTL_MINUTES,
      debugVerifyUrl: env.AUTH_DEBUG_OTP ? `${env.APP_BASE_URL}/api/auth/register/verify?token=${encodeURIComponent(token)}` : undefined
    };
  }

  async verifyRegistrationToken(token: string): Promise<{ email: string } | null> {
    const tokenHash = hashToken(token.trim());
    const consumed = await authStore.consumeEmailVerificationChallengeByTokenHash(tokenHash);
    return consumed ? { email: consumed.email } : null;
  }

  async requestOtp(rawEmail: string): Promise<{ ok: true; status: "sent" | "queued"; debugCode?: string; expiresInMinutes: number }> {
    await this.ensureSeedUsers();
    const email = normalizeEmail(rawEmail);

    if (!checkRateLimit(`otp_request:${email}`, env.OTP_RATE_LIMIT_MAX, env.OTP_RATE_LIMIT_WINDOW_SEC)) {
      throw new Error("rate_limited");
    }

    if (isAppleReviewOverrideEnabled() && isAppleReviewEmail(email)) {
      return {
        ok: true,
        status: "sent",
        debugCode: env.AUTH_DEBUG_OTP ? env.APPLE_REVIEW_OTP : undefined,
        expiresInMinutes: env.OTP_TTL_MINUTES
      };
    }

    const user = await authStore.getUserByEmail(email);
    assertOtpEligible(user);

    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const codeHash = hashOtp(email, code);
    const expiresAt = new Date(Date.now() + env.OTP_TTL_MINUTES * 60 * 1000).toISOString();
    const challengeId = await authStore.createOtpChallenge({
      userId: user.userId,
      email,
      codeHash,
      expiresAt,
      maxAttempts: env.OTP_MAX_ATTEMPTS
    });
    const jobId = await authStore.createOtpEmailJob({
      challengeId,
      userId: user.userId,
      email,
      otpCode: code
    });

    try {
      const sent = await this.sendOtpEmail(email, code);
      await authStore.markOtpEmailSent(jobId, sent.providerMessageId);
      return {
        ok: true,
        status: "sent",
        debugCode: env.AUTH_DEBUG_OTP ? code : undefined,
        expiresInMinutes: env.OTP_TTL_MINUTES
      };
    } catch (error) {
      const known = error as EmailSendFailure;
      const retryAfterSeconds = typeof known.retryAfterSeconds === "number" ? known.retryAfterSeconds : computeOtpRetryDelaySeconds(1);
      if (isTransientEmailFailure(known.statusCode)) {
        await authStore.markOtpEmailRetry(jobId, known.message ?? "otp_send_failed", retryAfterSeconds);
        return {
          ok: true,
          status: "queued",
          debugCode: env.AUTH_DEBUG_OTP ? code : undefined,
          expiresInMinutes: env.OTP_TTL_MINUTES
        };
      }
      await authStore.markOtpEmailFailed(jobId, known.message ?? "otp_send_failed");
      throw new Error("otp_delivery_unavailable");
    }
  }

  async verifyOtp(rawEmail: string, code: string): Promise<{ token: string; user: AuthUser }> {
    await this.ensureSeedUsers();
    const email = normalizeEmail(rawEmail);

    if (!checkRateLimit(`otp_verify:${email}`, env.OTP_VERIFY_RATE_LIMIT_MAX, env.OTP_VERIFY_RATE_LIMIT_WINDOW_SEC)) {
      throw new Error("rate_limited");
    }

    if (isAppleReviewOverrideEnabled() && isAppleReviewEmail(email)) {
      const configuredOtp = (env.APPLE_REVIEW_OTP ?? "").trim();
      if (!configuredOtp) throw new Error("apple_review_otp_not_configured");
      if (!staticOtpMatches(code, configuredOtp)) throw new Error("otp_invalid");

      const user = await authStore.getUserByEmail(email);
      assertOtpEligible(user);
      const authUser: AuthUser = {
        userId: user.userId,
        email: user.email,
        role: user.role,
        tokenVersion: user.tokenVersion
      };
      const token = this.signAuthToken(user);
      return { token, user: authUser };
    }

    const challenge = await authStore.getActiveOtpChallenge(email);
    if (!challenge) throw new Error("otp_challenge_not_found");

    const suppliedHash = hashOtp(email, code.trim());
    if (suppliedHash !== challenge.codeHash) {
      const state = await authStore.incrementOtpAttempts(challenge.challengeId);
      if (state.attemptCount >= state.maxAttempts) {
        await authStore.consumeOtpChallengeAndClearOtpJobs(challenge.challengeId);
      }
      throw new Error("otp_invalid");
    }

    await authStore.consumeOtpChallengeAndClearOtpJobs(challenge.challengeId);
    const user = await authStore.getUserById(challenge.userId);
    assertOtpEligible(user);

    const authUser: AuthUser = {
      userId: user.userId,
      email: user.email,
      role: user.role,
      tokenVersion: user.tokenVersion
    };
    return {
      token: this.signAuthToken(user),
      user: authUser
    };
  }

  async resolveAuthUserFromToken(token: string): Promise<AuthUser | null> {
    try {
      const decoded = jwt.verify(token, env.JWT_SECRET) as JwtClaims;
      if (!decoded.sub || !decoded.email || !decoded.role) return null;
      if (decoded.role !== "compliance_officer" && decoded.role !== "compliance_manager") return null;
      const user = await authStore.getUserById(decoded.sub);
      if (!user || !user.isActive) return null;
      const tokenVersion = typeof decoded.tokenVersion === "number" ? decoded.tokenVersion : 0;
      if (tokenVersion !== user.tokenVersion) return null;
      return {
        userId: user.userId,
        email: user.email,
        role: user.role,
        tokenVersion: user.tokenVersion
      };
    } catch {
      return null;
    }
  }

  mintSseTicket(user: AuthUser): string {
    return jwt.sign(
      {
        typ: "sse_ticket",
        sub: user.userId,
        email: user.email,
        role: user.role,
        tokenVersion: user.tokenVersion ?? 0
      },
      env.JWT_SECRET,
      { expiresIn: "2m" }
    );
  }

  async verifySseTicket(ticket: string): Promise<AuthUser | null> {
    try {
      const decoded = jwt.verify(ticket, env.JWT_SECRET) as JwtClaims;
      if (decoded.typ !== "sse_ticket") return null;
      if (!decoded.sub || !decoded.email || !decoded.role) return null;
      if (decoded.role !== "compliance_officer" && decoded.role !== "compliance_manager") return null;
      const user = await authStore.getUserById(decoded.sub);
      if (!user || !user.isActive) return null;
      return {
        userId: user.userId,
        email: user.email,
        role: user.role,
        tokenVersion: user.tokenVersion
      };
    } catch {
      return null;
    }
  }

  async listUsers(options: { limit: number; cursor?: string; role?: UserRole; verified?: boolean; active?: boolean }) {
    await this.ensureSeedUsers();
    return authStore.listUsers(options);
  }

  async promoteUser(targetUserId: string, actorUserId: string) {
    await this.ensureSeedUsers();
    return authStore.promoteUser(targetUserId, actorUserId);
  }

  async setUserActive(targetUserId: string, isActive: boolean, actorUserId: string) {
    await this.ensureSeedUsers();
    return authStore.setUserActive(targetUserId, isActive, actorUserId);
  }

  async dispatchPendingVerificationEmails(limit = 10): Promise<{ processed: number; sent: number; failed: number }> {
    await this.ensureSeedUsers();
    try {
      requireResendConfigured();
    } catch {
      return { processed: 0, sent: 0, failed: 0 };
    }

    const queued = await authStore.listPendingVerificationEmails(limit);
    let sent = 0;
    let failed = 0;
    let attempt = 0;

    for (const job of queued) {
      attempt += 1;
      const challenge = await authStore.getVerificationChallenge(job.challengeId);
      if (!challenge) continue;

      try {
        await this.sendRegistrationVerificationEmail(challenge.email, challenge.verificationToken);
        await authStore.markVerificationEmailSent(job.challengeId);
        sent += 1;
      } catch (error) {
        const known = error as EmailSendFailure;
        const retryAfterSeconds =
          typeof known.retryAfterSeconds === "number"
            ? known.retryAfterSeconds
            : computeRetryBackoffSeconds(typeof known.statusCode === "number" ? known.statusCode : null, attempt);
        await authStore.markVerificationEmailFailed(job.challengeId, known.message ?? "registration_send_failed", {
          retryAfterSeconds,
          maxAttempts: 6
        });
        failed += 1;
      }

      // Stay under Resend per-second limits even on success bursts.
      await sleep(550);
    }

    return {
      processed: queued.length,
      sent,
      failed
    };
  }

  async dispatchPendingOtpEmails(limit = 20): Promise<{ processed: number; sent: number; failed: number; retried: number }> {
    await this.ensureSeedUsers();
    try {
      requireResendConfigured();
    } catch {
      return { processed: 0, sent: 0, failed: 0, retried: 0 };
    }

    const jobs = await authStore.claimPendingOtpEmailJobs(limit);
    let sent = 0;
    let failed = 0;
    let retried = 0;

    for (const job of jobs) {
      const challenge = await authStore.getOtpChallengeById(job.challengeId);
      if (!challenge || challenge.consumedAt || Date.parse(challenge.expiresAt) <= Date.now()) {
        await authStore.markOtpEmailFailed(job.jobId, "challenge_expired_or_consumed");
        failed += 1;
        continue;
      }

      try {
        const result = await this.sendOtpEmail(job.email, job.otpCode);
        await authStore.markOtpEmailSent(job.jobId, result.providerMessageId);
        sent += 1;
      } catch (error) {
        const known = error as EmailSendFailure;
        const nextAttempt = job.attemptCount + 1;
        if (isTransientEmailFailure(known.statusCode) && nextAttempt < OTP_RETRY_DELAYS_SECONDS.length + 1) {
          await authStore.markOtpEmailRetry(job.jobId, known.message ?? "otp_send_failed", computeOtpRetryDelaySeconds(nextAttempt));
          retried += 1;
        } else {
          await authStore.markOtpEmailFailed(job.jobId, known.message ?? "otp_send_failed");
          failed += 1;
        }
      }

      await sleep(120);
    }

    return { processed: jobs.length, sent, failed, retried };
  }

  async pruneExpiredVerificationChallenges(): Promise<number> {
    return authStore.pruneExpiredVerificationChallenges();
  }
}

export const authService = new AuthService();
