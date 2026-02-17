import { Router } from "express";
import { z } from "zod";
import { authService } from "../services/authService.js";
import { requireAuth } from "../middleware/auth.js";

export const authRouter = Router();

const requestOtpSchema = z.object({
  email: z.string().email()
});

const verifyOtpSchema = z.object({
  email: z.string().email(),
  code: z.string().min(4).max(12)
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
