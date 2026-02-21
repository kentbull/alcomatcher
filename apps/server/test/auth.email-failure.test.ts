import { test } from "node:test";
import assert from "node:assert/strict";
import { authServiceTestables } from "../src/services/authService.js";

test("parseEmailSendFailure preserves provider config error", () => {
  const failure = authServiceTestables.parseEmailSendFailure(new Error("email_provider_not_configured"));
  assert.equal(failure.message, "email_provider_not_configured");
  assert.equal(failure.statusCode, undefined);
});

test("parseEmailSendFailure preserves status and retry metadata", () => {
  const failure = authServiceTestables.parseEmailSendFailure({
    message: "resend_status_429:rate_limited",
    statusCode: 429,
    retryAfterSeconds: 15
  });
  assert.equal(failure.message, "resend_status_429:rate_limited");
  assert.equal(failure.statusCode, 429);
  assert.equal(failure.retryAfterSeconds, 15);
});

test("isTransientEmailFailure treats 429 and 5xx as transient", () => {
  assert.equal(authServiceTestables.isTransientEmailFailure(429), true);
  assert.equal(authServiceTestables.isTransientEmailFailure(500), true);
  assert.equal(authServiceTestables.isTransientEmailFailure(503), true);
});

test("isTransientEmailFailure treats 4xx non-429 as non-transient", () => {
  assert.equal(authServiceTestables.isTransientEmailFailure(400), false);
  assert.equal(authServiceTestables.isTransientEmailFailure(403), false);
});
