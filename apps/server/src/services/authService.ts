import { createHash, randomInt } from "node:crypto";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { authStore } from "./authStore.js";
import type { AuthUser, UserRole } from "../types/auth.js";

interface SeedUser {
  email: string;
  role: UserRole;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function hashOtp(email: string, code: string): string {
  return createHash("sha256")
    .update(`${normalizeEmail(email)}:${code}:${env.JWT_SECRET}`)
    .digest("hex");
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

export class AuthService {
  private seeded = false;

  private async ensureSeedUsers() {
    if (this.seeded) return;
    const users = parseSeedUsers();
    for (const user of users) {
      await authStore.upsertUser(user.email, user.role);
    }
    this.seeded = true;
  }

  async requestOtp(rawEmail: string): Promise<{ ok: true; debugCode?: string; expiresInMinutes: number }> {
    await this.ensureSeedUsers();
    const email = normalizeEmail(rawEmail);
    const user = await authStore.getUserByEmail(email);
    if (!user || !user.is_active) throw new Error("user_not_found");

    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const codeHash = hashOtp(email, code);
    const expiresAt = new Date(Date.now() + env.OTP_TTL_MINUTES * 60 * 1000).toISOString();
    await authStore.createOtpChallenge({
      userId: user.user_id,
      email,
      codeHash,
      expiresAt,
      maxAttempts: env.OTP_MAX_ATTEMPTS
    });

    return {
      ok: true,
      debugCode: env.AUTH_DEBUG_OTP ? code : undefined,
      expiresInMinutes: env.OTP_TTL_MINUTES
    };
  }

  async verifyOtp(rawEmail: string, code: string): Promise<{ token: string; user: AuthUser }> {
    await this.ensureSeedUsers();
    const email = normalizeEmail(rawEmail);
    const challenge = await authStore.getActiveOtpChallenge(email);
    if (!challenge) throw new Error("otp_challenge_not_found");

    const suppliedHash = hashOtp(email, code.trim());
    if (suppliedHash !== challenge.codeHash) {
      const state = await authStore.incrementOtpAttempts(challenge.challengeId);
      if (state.attemptCount >= state.maxAttempts) {
        await authStore.consumeOtpChallenge(challenge.challengeId);
      }
      throw new Error("otp_invalid");
    }

    await authStore.consumeOtpChallenge(challenge.challengeId);
    const user = await authStore.getUserById(challenge.userId);
    if (!user || !user.is_active) throw new Error("user_not_found");

    const authUser: AuthUser = {
      userId: user.user_id,
      email: user.email,
      role: user.role
    };
    const token = jwt.sign(
      {
        sub: authUser.userId,
        email: authUser.email,
        role: authUser.role
      },
      env.JWT_SECRET,
      { expiresIn: `${env.JWT_EXPIRES_HOURS}h` }
    );

    return {
      token,
      user: authUser
    };
  }

  verifyToken(token: string): AuthUser | null {
    try {
      const decoded = jwt.verify(token, env.JWT_SECRET) as { sub?: string; email?: string; role?: UserRole };
      if (!decoded.sub || !decoded.email || !decoded.role) return null;
      if (decoded.role !== "compliance_officer" && decoded.role !== "compliance_manager") return null;
      return {
        userId: decoded.sub,
        email: decoded.email,
        role: decoded.role
      };
    } catch {
      return null;
    }
  }
}

export const authService = new AuthService();
