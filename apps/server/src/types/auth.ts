export type UserRole = "compliance_officer" | "compliance_manager";

export interface AuthUser {
  userId: string;
  email: string;
  role: UserRole;
  tokenVersion?: number;
}

export interface OtpChallenge {
  challengeId: string;
  userId: string;
  email: string;
  codeHash: string;
  attemptCount: number;
  maxAttempts: number;
  expiresAt: string;
  consumedAt?: string;
}

export interface AuthUserRecord {
  userId: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  emailVerifiedAt?: string;
  createdAt: string;
  updatedAt: string;
  tokenVersion: number;
}
