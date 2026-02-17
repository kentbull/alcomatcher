import { Pool } from "pg";
import { env } from "../config/env.js";
import type { ApplicationStatus, ComplianceApplicationDoc, ComplianceEvent, CrdtOperation } from "../types/compliance.js";
import type { BatchItemAttemptRecord, BatchItemRecord, BatchJobRecord } from "../types/batch.js";

export class EventStore {
  private readonly pool: Pool;

  constructor() {
    this.pool = new Pool({ connectionString: env.DATABASE_URL });
  }

  async upsertApplication(doc: ComplianceApplicationDoc): Promise<void> {
    await this.pool.query(
      `
      INSERT INTO compliance_applications (
        application_id,
        document_id,
        regulatory_profile,
        submission_type,
        current_status,
        sync_state,
        updated_at
      )
      VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, NOW())
      ON CONFLICT (application_id)
      DO UPDATE SET
        current_status = EXCLUDED.current_status,
        sync_state = EXCLUDED.sync_state,
        updated_at = NOW()
      `,
      [doc.applicationId, doc.documentId, doc.regulatoryProfile, doc.submissionType, doc.status, doc.syncState]
    );
  }

  async updateApplicationStatus(applicationId: string, status: ApplicationStatus, syncState: ComplianceApplicationDoc["syncState"]): Promise<void> {
    await this.pool.query(
      `
      UPDATE compliance_applications
      SET current_status = $2,
          sync_state = $3,
          updated_at = NOW()
      WHERE application_id = $1::uuid
      `,
      [applicationId, status, syncState]
    );
  }

  async appendEvent(event: ComplianceEvent): Promise<void> {
    await this.pool.query(
      `
      INSERT INTO application_events (
        event_id,
        application_id,
        event_type,
        payload,
        created_at
      )
      VALUES ($1::uuid, $2::uuid, $3, $4::jsonb, $5::timestamptz)
      `,
      [event.eventId, event.applicationId, event.eventType, JSON.stringify(event.payload), event.createdAt]
    );
  }

  async listApplications(): Promise<ComplianceApplicationDoc[]> {
    const { rows } = await this.pool.query<{
      application_id: string;
      document_id: string;
      regulatory_profile: ComplianceApplicationDoc["regulatoryProfile"];
      submission_type: ComplianceApplicationDoc["submissionType"];
      current_status: ComplianceApplicationDoc["status"];
      sync_state: ComplianceApplicationDoc["syncState"];
      updated_at: Date;
    }>(
      `
      SELECT
        application_id,
        document_id,
        regulatory_profile,
        submission_type,
        current_status,
        sync_state,
        updated_at
      FROM compliance_applications
      ORDER BY updated_at DESC
      LIMIT 200
      `
    );

    return rows.map((row) => ({
      applicationId: row.application_id,
      documentId: row.document_id,
      regulatoryProfile: row.regulatory_profile,
      submissionType: row.submission_type,
      status: row.current_status,
      checks: [],
      syncState: row.sync_state,
      updatedAt: row.updated_at.toISOString()
    }));
  }

  async getEvents(applicationId: string): Promise<ComplianceEvent[]> {
    const { rows } = await this.pool.query<{
      event_id: string;
      application_id: string;
      event_type: ComplianceEvent["eventType"];
      payload: Record<string, unknown>;
      created_at: Date;
    }>(
      `
      SELECT
        event_id,
        application_id,
        event_type,
        payload,
        created_at
      FROM application_events
      WHERE application_id = $1::uuid
      ORDER BY created_at ASC
      `,
      [applicationId]
    );

    return rows.map((row) => ({
      eventId: row.event_id,
      applicationId: row.application_id,
      eventType: row.event_type,
      payload: row.payload,
      createdAt: row.created_at.toISOString()
    }));
  }

  async appendCrdtOps(applicationId: string, ops: CrdtOperation[]): Promise<void> {
    if (ops.length === 0) return;

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      for (const op of ops) {
        await client.query(
          `
          INSERT INTO application_crdt_ops (
            op_id,
            application_id,
            actor_id,
            sequence,
            payload,
            created_at
          )
          VALUES ($1::uuid, $2::uuid, $3, $4, $5::jsonb, $6::timestamptz)
          ON CONFLICT (application_id, actor_id, sequence) DO NOTHING
          `,
          [op.opId, applicationId, op.actorId, op.sequence, JSON.stringify(op.payload), op.createdAt]
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async listCrdtOps(applicationId: string, afterSequence: number): Promise<CrdtOperation[]> {
    const { rows } = await this.pool.query<{
      op_id: string;
      application_id: string;
      actor_id: string;
      sequence: string;
      payload: Record<string, unknown>;
      created_at: Date;
    }>(
      `
      SELECT
        op_id,
        application_id,
        actor_id,
        sequence,
        payload,
        created_at
      FROM application_crdt_ops
      WHERE application_id = $1::uuid
        AND sequence > $2
      ORDER BY sequence ASC
      LIMIT 1000
      `,
      [applicationId, afterSequence]
    );

    return rows.map((row) => ({
      opId: row.op_id,
      applicationId: row.application_id,
      actorId: row.actor_id,
      sequence: Number(row.sequence),
      payload: row.payload,
      createdAt: row.created_at.toISOString()
    }));
  }

  async upsertBatchJob(job: BatchJobRecord): Promise<void> {
    await this.pool.query(
      `
      INSERT INTO batch_jobs (
        batch_id,
        application_id,
        total_items,
        accepted_items,
        rejected_items,
        status,
        updated_at
      )
      VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, NOW())
      ON CONFLICT (batch_id)
      DO UPDATE SET
        total_items = EXCLUDED.total_items,
        accepted_items = EXCLUDED.accepted_items,
        rejected_items = EXCLUDED.rejected_items,
        status = EXCLUDED.status,
        updated_at = NOW()
      `,
      [job.batchId, job.applicationId, job.totalItems, job.acceptedItems, job.rejectedItems, job.status]
    );
  }

  async upsertBatchItems(batchId: string, items: BatchItemRecord[]): Promise<void> {
    if (items.length === 0) return;

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      for (const item of items) {
        await client.query(
          `
          INSERT INTO batch_items (
            batch_item_id,
            batch_id,
            client_label_id,
            image_filename,
            regulatory_profile,
            status,
            last_error_code,
            retry_count,
            error_reason,
            updated_at
          )
          VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8, $9, NOW())
          ON CONFLICT (batch_item_id)
          DO UPDATE SET
            regulatory_profile = EXCLUDED.regulatory_profile,
            status = EXCLUDED.status,
            last_error_code = EXCLUDED.last_error_code,
            retry_count = EXCLUDED.retry_count,
            error_reason = EXCLUDED.error_reason,
            updated_at = NOW()
          `,
          [
            item.batchItemId,
            batchId,
            item.clientLabelId,
            item.imageFilename,
            item.regulatoryProfile,
            item.status,
            item.lastErrorCode ?? null,
            item.retryCount,
            item.errorReason ?? null
          ]
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async getBatchJob(batchId: string): Promise<BatchJobRecord | null> {
    const { rows } = await this.pool.query<{
      batch_id: string;
      application_id: string;
      total_items: number;
      accepted_items: number;
      rejected_items: number;
      status: BatchJobRecord["status"];
      created_at: Date;
      updated_at: Date;
    }>(
      `
      SELECT
        batch_id,
        application_id,
        total_items,
        accepted_items,
        rejected_items,
        status,
        created_at,
        updated_at
      FROM batch_jobs
      WHERE batch_id = $1::uuid
      LIMIT 1
      `,
      [batchId]
    );

    if (rows.length === 0) return null;
    const row = rows[0];
    return {
      batchId: row.batch_id,
      applicationId: row.application_id,
      totalItems: row.total_items,
      acceptedItems: row.accepted_items,
      rejectedItems: row.rejected_items,
      status: row.status,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString()
    };
  }

  async listBatchItems(batchId: string, limit = 200, offset = 0): Promise<BatchItemRecord[]> {
    const { rows } = await this.pool.query<{
      batch_item_id: string;
      client_label_id: string;
      image_filename: string;
      regulatory_profile: BatchItemRecord["regulatoryProfile"];
      status: BatchItemRecord["status"];
      last_error_code: string | null;
      retry_count: number;
      error_reason: string | null;
    }>(
      `
      SELECT
        batch_item_id,
        client_label_id,
        image_filename,
        regulatory_profile,
        status,
        last_error_code,
        retry_count,
        error_reason
      FROM batch_items
      WHERE batch_id = $1::uuid
      ORDER BY created_at ASC
      LIMIT $2
      OFFSET $3
      `,
      [batchId, limit, offset]
    );

    return rows.map((row) => ({
      batchItemId: row.batch_item_id,
      clientLabelId: row.client_label_id,
      imageFilename: row.image_filename,
      regulatoryProfile: row.regulatory_profile,
      status: row.status,
      lastErrorCode: row.last_error_code ?? undefined,
      retryCount: row.retry_count,
      errorReason: row.error_reason ?? undefined
    }));
  }

  async appendBatchItemAttempt(attempt: BatchItemAttemptRecord): Promise<void> {
    await this.pool.query(
      `
      INSERT INTO batch_item_attempts (
        attempt_id,
        batch_item_id,
        attempt_no,
        outcome,
        error_code,
        error_reason,
        created_at
      )
      VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7::timestamptz)
      `,
      [
        attempt.attemptId,
        attempt.batchItemId,
        attempt.attemptNo,
        attempt.outcome,
        attempt.errorCode ?? null,
        attempt.errorReason ?? null,
        attempt.createdAt
      ]
    );
  }

  async listBatchItemAttempts(batchItemId: string): Promise<BatchItemAttemptRecord[]> {
    const { rows } = await this.pool.query<{
      attempt_id: string;
      batch_item_id: string;
      attempt_no: number;
      outcome: BatchItemAttemptRecord["outcome"];
      error_code: string | null;
      error_reason: string | null;
      created_at: Date;
    }>(
      `
      SELECT
        attempt_id,
        batch_item_id,
        attempt_no,
        outcome,
        error_code,
        error_reason,
        created_at
      FROM batch_item_attempts
      WHERE batch_item_id = $1::uuid
      ORDER BY attempt_no ASC
      `,
      [batchItemId]
    );

    return rows.map((row) => ({
      attemptId: row.attempt_id,
      batchItemId: row.batch_item_id,
      attemptNo: row.attempt_no,
      outcome: row.outcome,
      errorCode: row.error_code ?? undefined,
      errorReason: row.error_reason ?? undefined,
      createdAt: row.created_at.toISOString()
    }));
  }

  async listBatchJobs(limit = 100): Promise<BatchJobRecord[]> {
    const { rows } = await this.pool.query<{
      batch_id: string;
      application_id: string;
      total_items: number;
      accepted_items: number;
      rejected_items: number;
      status: BatchJobRecord["status"];
      created_at: Date;
      updated_at: Date;
    }>(
      `
      SELECT
        batch_id,
        application_id,
        total_items,
        accepted_items,
        rejected_items,
        status,
        created_at,
        updated_at
      FROM batch_jobs
      ORDER BY updated_at DESC
      LIMIT $1
      `,
      [limit]
    );

    return rows.map((row) => ({
      batchId: row.batch_id,
      applicationId: row.application_id,
      totalItems: row.total_items,
      acceptedItems: row.accepted_items,
      rejectedItems: row.rejected_items,
      status: row.status,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString()
    }));
  }

  async backfillPendingSyncToSynced(): Promise<number> {
    const { rowCount } = await this.pool.query(
      `
      UPDATE compliance_applications
      SET sync_state = 'synced',
          updated_at = NOW()
      WHERE sync_state = 'pending_sync'
      `
    );
    return rowCount ?? 0;
  }

  async getSyncStateCounts(): Promise<Record<ComplianceApplicationDoc["syncState"], number>> {
    const { rows } = await this.pool.query<{
      sync_state: ComplianceApplicationDoc["syncState"];
      count: string;
    }>(
      `
      SELECT sync_state, COUNT(*)::text AS count
      FROM compliance_applications
      GROUP BY sync_state
      `
    );

    const counts: Record<ComplianceApplicationDoc["syncState"], number> = {
      synced: 0,
      pending_sync: 0,
      sync_failed: 0
    };
    for (const row of rows) {
      counts[row.sync_state] = Number(row.count);
    }
    return counts;
  }

  async getStatusCounts(): Promise<Record<ComplianceApplicationDoc["status"], number>> {
    const { rows } = await this.pool.query<{
      current_status: ComplianceApplicationDoc["status"];
      count: string;
    }>(
      `
      SELECT current_status, COUNT(*)::text AS count
      FROM compliance_applications
      GROUP BY current_status
      `
    );

    const counts = {
      captured: 0,
      scanned: 0,
      matched: 0,
      approved: 0,
      rejected: 0,
      needs_review: 0,
      batch_received: 0,
      batch_processing: 0,
      batch_partially_failed: 0,
      batch_completed: 0
    };
    for (const row of rows) {
      counts[row.current_status] = Number(row.count);
    }
    return counts;
  }

  async listRecentQuickCheckMetrics(hours = 24): Promise<
    Array<{
      confidence: number;
      usedFallback: boolean;
      processingMs?: number;
      stageTimings?: {
        sessionCreateMs?: number;
        frontUploadMs?: number;
        frontOcrMs?: number;
        backUploadMs?: number;
        backOcrMs?: number;
        additionalUploadTotalMs?: number;
        finalizeMs?: number;
        decisionTotalMs?: number;
      };
      telemetryQuality?: "complete" | "partial";
    }>
  > {
    const { rows } = await this.pool.query<{
      payload: {
        confidence?: number;
        usedFallback?: boolean;
        processingMs?: number;
        stageTimings?: {
          sessionCreateMs?: number;
          frontUploadMs?: number;
          frontOcrMs?: number;
          backUploadMs?: number;
          backOcrMs?: number;
          additionalUploadTotalMs?: number;
          finalizeMs?: number;
          decisionTotalMs?: number;
        };
        telemetryQuality?: "complete" | "partial";
      };
    }>(
      `
      SELECT payload
      FROM application_events
      WHERE event_type = 'ScannerQuickCheckRecorded'
        AND created_at >= NOW() - ($1::text || ' hours')::interval
      ORDER BY created_at DESC
      LIMIT 5000
      `,
      [String(hours)]
    );

    return rows.map((row) => ({
      confidence: typeof row.payload?.confidence === "number" ? row.payload.confidence : 0,
      usedFallback: Boolean(row.payload?.usedFallback),
      processingMs: typeof row.payload?.processingMs === "number" ? row.payload.processingMs : undefined,
      stageTimings: row.payload?.stageTimings,
      telemetryQuality: row.payload?.telemetryQuality === "complete" ? "complete" : "partial"
    }));
  }
}

export const eventStore = new EventStore();
