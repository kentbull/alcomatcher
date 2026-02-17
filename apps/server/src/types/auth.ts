export type UserRole = "compliance_officer" | "compliance_manager";

export interface AuthUser {
  userId: string;
  email: string;
  role: UserRole;
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

