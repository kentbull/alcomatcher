import type { NextFunction, Request, Response } from "express";
import { authService } from "../services/authService.js";
import type { UserRole } from "../types/auth.js";

function bearerTokenFromRequest(req: Request): string | null {
  const header = req.header("authorization");
  if (!header) return null;
  const [scheme, token] = header.split(" ");
  if (!scheme || !token || scheme.toLowerCase() !== "bearer") return null;
  return token;
}

function cookieTokenFromRequest(req: Request): string | null {
  const rawCookie = req.header("cookie");
  if (!rawCookie) return null;
  const segments = rawCookie.split(";").map((part) => part.trim());
  for (const segment of segments) {
    if (!segment.startsWith("alcomatcher_token=")) continue;
    const value = segment.slice("alcomatcher_token=".length);
    return decodeURIComponent(value);
  }
  return null;
}

export function attachAuthUser(req: Request, _res: Response, next: NextFunction) {
  const token = bearerTokenFromRequest(req) ?? cookieTokenFromRequest(req);
  req.authUser = token ? authService.verifyToken(token) ?? undefined : undefined;
  next();
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.authUser) {
    return res.status(401).json({ error: "auth_required" });
  }
  next();
}

export function requireRole(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.authUser) {
      return res.status(401).json({ error: "auth_required" });
    }
    if (!roles.includes(req.authUser.role)) {
      return res.status(403).json({ error: "forbidden_role" });
    }
    next();
  };
}

export function requireManager(req: Request, res: Response, next: NextFunction) {
  return requireRole("compliance_manager")(req, res, next);
}
