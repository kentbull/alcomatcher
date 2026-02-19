import test from "node:test";
import assert from "node:assert/strict";
import type { ComplianceEvent } from "../src/types/compliance.js";
import { projectApplication } from "../src/services/projectionService.js";

test("projectApplication is deterministic for identical event streams", () => {
  const events: ComplianceEvent[] = [
    {
      eventId: "e1",
      applicationId: "app-1",
      eventType: "ApplicationCreated",
      payload: { submissionType: "single", syncState: "pending_sync" },
      createdAt: "2026-02-17T10:00:00.000Z"
    },
    {
      eventId: "e2",
      applicationId: "app-1",
      eventType: "ScannerQuickCheckRecorded",
      payload: {
        summary: "fail",
        confidence: 0.82,
        provider: "local_tesseract",
        usedFallback: false,
        extracted: { rawText: "x", hasGovWarning: false },
        checks: [{ id: "government_warning_present", label: "Government Warning", status: "fail", detail: "Missing" }]
      },
      createdAt: "2026-02-17T10:00:01.000Z"
    },
    {
      eventId: "e3",
      applicationId: "app-1",
      eventType: "SyncMerged",
      payload: { syncState: "synced" },
      createdAt: "2026-02-17T10:00:02.000Z"
    }
  ];

  const first = projectApplication("app-1", events);
  const second = projectApplication("app-1", events);

  assert.deepEqual(first, second);
  assert.equal(first.status, "rejected");
  assert.equal(first.syncState, "synced");
  assert.equal(first.latestQuickCheck?.summary, "fail");
});

test("projectApplication maps quick-check needs_review and reviewer override", () => {
  const events: ComplianceEvent[] = [
    {
      eventId: "e1",
      applicationId: "app-2",
      eventType: "ApplicationCreated",
      payload: { submissionType: "single", syncState: "pending_sync" },
      createdAt: "2026-02-17T11:00:00.000Z"
    },
    {
      eventId: "e2",
      applicationId: "app-2",
      eventType: "ScannerQuickCheckRecorded",
      payload: {
        summary: "needs_review",
        confidence: 0.64,
        provider: "cloud_fallback",
        usedFallback: true,
        extracted: { rawText: "x", hasGovWarning: true },
        checks: []
      },
      createdAt: "2026-02-17T11:00:01.000Z"
    },
    {
      eventId: "e3",
      applicationId: "app-2",
      eventType: "ReviewerOverrideRecorded",
      payload: { status: "approved" },
      createdAt: "2026-02-17T11:00:02.000Z"
    }
  ];

  const projection = projectApplication("app-2", events);
  assert.equal(projection.status, "approved");
  assert.equal(projection.syncState, "pending_sync");
  assert.equal(projection.latestQuickCheck?.summary, "needs_review");
});

test("ReviewerOverrideRecorded with status field projects to approved", () => {
  const events: ComplianceEvent[] = [
    {
      eventId: "e1", applicationId: "app-3", eventType: "ApplicationCreated",
      payload: { submissionType: "single", syncState: "pending_sync" },
      createdAt: "2026-02-19T10:00:00.000Z"
    },
    {
      eventId: "e2", applicationId: "app-3", eventType: "ScannerQuickCheckRecorded",
      payload: {
        summary: "needs_review", confidence: 0.55, provider: "local_tesseract",
        usedFallback: false,
        extracted: { rawText: "x", hasGovWarning: true },
        checks: []
      },
      createdAt: "2026-02-19T10:00:01.000Z"
    },
    {
      eventId: "e3", applicationId: "app-3", eventType: "ReviewerOverrideRecorded",
      payload: { decision: "approved", status: "approved", reviewedBy: "mgr-1", notes: "" },
      createdAt: "2026-02-19T10:00:02.000Z"
    }
  ];
  const projection = projectApplication("app-3", events);
  assert.equal(projection.status, "approved");
});
