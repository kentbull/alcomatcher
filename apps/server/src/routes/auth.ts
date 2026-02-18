import { Router } from "express";
import { z } from "zod";
import { authService } from "../services/authService.js";
import { requireAuth, requireManager } from "../middleware/auth.js";

export const authRouter = Router();

const emailSchema = z.string().email();

const requestOtpSchema = z.object({
  email: emailSchema
});

const verifyOtpSchema = z.object({
  email: emailSchema,
  code: z.string().min(4).max(12)
});

const registerRequestSchema = z.object({
  email: emailSchema
});

const listUsersQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().optional(),
  role: z.enum(["compliance_officer", "compliance_manager"]).optional(),
  verified: z.enum(["true", "false"]).optional(),
  active: z.enum(["true", "false"]).optional()
});

authRouter.post("/api/auth/register/request", async (req, res) => {
  const parsed = registerRequestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    const result = await authService.requestRegistration(parsed.data.email, {
      ip: req.ip,
      userAgent: req.get("user-agent") ?? undefined
    });
    return res.status(202).json({ status: "queued", ...result });
  } catch (error) {
    if (error instanceof Error && error.message === "rate_limited") {
      return res.status(429).json({ error: "rate_limited" });
    }
    return res.status(500).json({
      error: "registration_request_failed",
      detail: error instanceof Error ? error.message : "unknown_error"
    });
  }
});

authRouter.get("/api/auth/register/verify", async (req, res) => {
  const token = typeof req.query.token === "string" ? req.query.token : "";
  if (!token.trim()) {
    return res.status(400).type("html").send("<h1>Invalid link</h1><p>Missing verification token.</p>");
  }

  try {
    const result = await authService.verifyRegistrationToken(token);
    if (!result) {
      return res.status(400).type("html").send("<h1>Verification failed</h1><p>This link is invalid or expired.</p>");
    }

    const loginUrl = `/login?verified=1&email=${encodeURIComponent(result.email)}`;
    return res.redirect(302, loginUrl);
  } catch {
    return res.status(500).type("html").send("<h1>Verification error</h1><p>Please retry shortly.</p>");
  }
});

authRouter.post("/api/auth/otp/request", async (req, res) => {
  const parsed = requestOtpSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    const result = await authService.requestOtp(parsed.data.email);
    return res.status(202).json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "user_not_found") {
      return res.status(404).json({ error: "user_not_found" });
    }
    if (error instanceof Error && error.message === "email_not_verified") {
      return res.status(403).json({ error: "email_not_verified" });
    }
    if (error instanceof Error && error.message === "rate_limited") {
      return res.status(429).json({ error: "rate_limited" });
    }
    if (error instanceof Error && error.message === "otp_delivery_unavailable") {
      return res.status(503).json({ error: "otp_delivery_unavailable" });
    }
    return res.status(500).json({
      error: "otp_request_failed",
      detail: error instanceof Error ? error.message : "unknown_error"
    });
  }
});

authRouter.post("/api/auth/otp/verify", async (req, res) => {
  const parsed = verifyOtpSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    const result = await authService.verifyOtp(parsed.data.email, parsed.data.code);
    const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
    res.setHeader(
      "Set-Cookie",
      `alcomatcher_token=${encodeURIComponent(result.token)}; Path=/; HttpOnly; SameSite=Lax${secure}; Max-Age=${8 * 60 * 60}`
    );
    return res.json(result);
  } catch (error) {
    if (error instanceof Error && (error.message === "otp_invalid" || error.message === "otp_challenge_not_found")) {
      return res.status(401).json({ error: "otp_invalid_or_expired" });
    }
    if (error instanceof Error && error.message === "apple_review_otp_not_configured") {
      return res.status(500).json({ error: "apple_review_otp_not_configured" });
    }
    if (error instanceof Error && error.message === "user_not_found") {
      return res.status(404).json({ error: "user_not_found" });
    }
    if (error instanceof Error && error.message === "email_not_verified") {
      return res.status(403).json({ error: "email_not_verified" });
    }
    if (error instanceof Error && error.message === "rate_limited") {
      return res.status(429).json({ error: "rate_limited" });
    }
    return res.status(500).json({
      error: "otp_verify_failed",
      detail: error instanceof Error ? error.message : "unknown_error"
    });
  }
});

authRouter.get("/api/auth/me", requireAuth, (req, res) => {
  return res.json({ user: req.authUser });
});

authRouter.post("/api/auth/logout", requireAuth, (_req, res) => {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader("Set-Cookie", `alcomatcher_token=; Path=/; HttpOnly; SameSite=Lax${secure}; Max-Age=0`);
  return res.status(204).send();
});

authRouter.get("/api/events/stream-auth-ticket", requireAuth, (req, res) => {
  if (!req.authUser) return res.status(401).json({ error: "auth_required" });
  const ticket = authService.mintSseTicket(req.authUser);
  return res.json({ ticket, expiresInSeconds: 120 });
});

authRouter.get("/api/admin/users", requireManager, async (req, res) => {
  const parsed = listUsersQuerySchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const verified = parsed.data.verified ? parsed.data.verified === "true" : undefined;
  const active = parsed.data.active ? parsed.data.active === "true" : undefined;

  const users = await authService.listUsers({
    limit: parsed.data.limit,
    cursor: parsed.data.cursor,
    role: parsed.data.role,
    verified,
    active
  });

  return res.json(users);
});

authRouter.post("/api/admin/users/:userId/promote", requireManager, async (req, res) => {
  if (!req.authUser) return res.status(401).json({ error: "auth_required" });
  const updated = await authService.promoteUser(req.params.userId, req.authUser.userId);
  if (!updated) return res.status(404).json({ error: "user_not_found" });
  return res.json({ user: updated });
});

authRouter.post("/api/admin/users/:userId/activate", requireManager, async (req, res) => {
  if (!req.authUser) return res.status(401).json({ error: "auth_required" });
  const updated = await authService.setUserActive(req.params.userId, true, req.authUser.userId);
  if (!updated) return res.status(404).json({ error: "user_not_found" });
  return res.json({ user: updated });
});

authRouter.post("/api/admin/users/:userId/deactivate", requireManager, async (req, res) => {
  if (!req.authUser) return res.status(401).json({ error: "auth_required" });
  const updated = await authService.setUserActive(req.params.userId, false, req.authUser.userId);
  if (!updated) return res.status(404).json({ error: "user_not_found" });
  return res.json({ user: updated });
});
