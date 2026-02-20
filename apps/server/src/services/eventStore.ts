import { Pool } from "pg";
import { env } from "../config/env.js";
import type { ApplicationStatus, LabelApplicationDoc, ComplianceEvent, CrdtOperation } from "../types/compliance.js";
/** @deprecated Use LabelApplicationDoc */
type ComplianceApplicationDoc = LabelApplicationDoc;
import type { BatchItemAttemptRecord, BatchItemRecord, BatchJobRecord } from "../types/batch.js";

export class EventStore {
  private readonly pool: Pool;
  private submissionSchemaEnsured = false;
  private batchSchemaEnsured = false;

  constructor() {
    this.pool = new Pool({
      connectionString: env.DATABASE_URL,
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });
  }

  async upsertApplication(doc: LabelApplicationDoc): Promise<void> {
    await this.pool.query(
      `
      INSERT INTO label_applications (
        application_id,
        document_id,
        regulatory_profile,
        submission_type,
        current_status,
        sync_state,
        brand_name,
        class_type,
        updated_at
      )
      VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8, NOW())
      ON CONFLICT (application_id)
      DO UPDATE SET
        current_status = EXCLUDED.current_status,
        sync_state = EXCLUDED.sync_state,
        brand_name = COALESCE(EXCLUDED.brand_name, label_applications.brand_name),
        class_type = COALESCE(EXCLUDED.class_type, label_applications.class_type),
        updated_at = NOW()
      `,
      [doc.applicationId, doc.documentId, doc.regulatoryProfile, doc.submissionType, doc.status, doc.syncState, doc.brandName ?? null, doc.classType ?? null]
    );
  }

  async updateApplicationStatus(applicationId: string, status: ApplicationStatus, syncState: LabelApplicationDoc["syncState"]): Promise<void> {
    await this.pool.query(
      `
      UPDATE label_applications
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

  async listApplications(): Promise<LabelApplicationDoc[]> {
    const { rows } = await this.pool.query<{
      application_id: string;
      document_id: string;
      regulatory_profile: LabelApplicationDoc["regulatoryProfile"];
      submission_type: LabelApplicationDoc["submissionType"];
      current_status: LabelApplicationDoc["status"];
      sync_state: LabelApplicationDoc["syncState"];
      brand_name: string | null;
      class_type: string | null;
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
        brand_name,
        class_type,
        updated_at
      FROM label_applications
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
      brandName: row.brand_name ?? undefined,
      classType: row.class_type ?? undefined,
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
    await this.ensureBatchSchema();
    await this.pool.query(
      `
      INSERT INTO batch_jobs (
        batch_id,
        application_id,
        total_items,
        accepted_items,
        rejected_items,
        ingest_status,
        discovered_items,
        queued_items,
        processing_items,
        completed_items,
        failed_items,
        archive_bytes,
        error_summary,
        status,
        updated_at
      )
      VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW())
      ON CONFLICT (batch_id)
      DO UPDATE SET
        total_items = EXCLUDED.total_items,
        accepted_items = EXCLUDED.accepted_items,
        rejected_items = EXCLUDED.rejected_items,
        ingest_status = EXCLUDED.ingest_status,
        discovered_items = EXCLUDED.discovered_items,
        queued_items = EXCLUDED.queued_items,
        processing_items = EXCLUDED.processing_items,
        completed_items = EXCLUDED.completed_items,
        failed_items = EXCLUDED.failed_items,
        archive_bytes = EXCLUDED.archive_bytes,
        error_summary = EXCLUDED.error_summary,
        status = EXCLUDED.status,
        updated_at = NOW()
      `,
      [
        job.batchId,
        job.applicationId,
        job.totalItems,
        job.acceptedItems,
        job.rejectedItems,
        job.ingestStatus ?? null,
        job.discoveredItems ?? null,
        job.queuedItems ?? null,
        job.processingItems ?? null,
        job.completedItems ?? null,
        job.failedItems ?? null,
        job.archiveBytes ?? null,
        job.errorSummary ?? null,
        job.status
      ]
    );
  }

  async upsertBatchItems(batchId: string, items: BatchItemRecord[]): Promise<void> {
    await this.ensureBatchSchema();
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
            application_id,
            expected_brand_name,
            expected_class_type,
            expected_abv_text,
            expected_net_contents,
            expected_government_warning,
            require_gov_warning,
            front_image_path,
            back_image_path,
            additional_image_paths,
            status,
            last_error_code,
            retry_count,
            error_reason,
            updated_at
          )
          VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6::uuid, $7, $8, $9, $10, $11, $12, $13, $14, $15::jsonb, $16, $17, $18, $19, NOW())
          ON CONFLICT (batch_item_id)
          DO UPDATE SET
            regulatory_profile = EXCLUDED.regulatory_profile,
            application_id = EXCLUDED.application_id,
            expected_brand_name = EXCLUDED.expected_brand_name,
            expected_class_type = EXCLUDED.expected_class_type,
            expected_abv_text = EXCLUDED.expected_abv_text,
            expected_net_contents = EXCLUDED.expected_net_contents,
            expected_government_warning = EXCLUDED.expected_government_warning,
            require_gov_warning = EXCLUDED.require_gov_warning,
            front_image_path = EXCLUDED.front_image_path,
            back_image_path = EXCLUDED.back_image_path,
            additional_image_paths = EXCLUDED.additional_image_paths,
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
            item.imageFilename ?? null,
            item.regulatoryProfile,
            item.applicationId ?? null,
            item.expectedBrandName ?? null,
            item.expectedClassType ?? null,
            item.expectedAbvText ?? null,
            item.expectedNetContents ?? null,
            item.expectedGovernmentWarning ?? null,
            item.requireGovWarning ?? null,
            item.frontImagePath ?? null,
            item.backImagePath ?? null,
            JSON.stringify(item.additionalImagePaths ?? []),
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
    await this.ensureBatchSchema();
    const { rows } = await this.pool.query<{
      batch_id: string;
      application_id: string;
      total_items: number;
      accepted_items: number;
      rejected_items: number;
      status: BatchJobRecord["status"];
      ingest_status: BatchJobRecord["ingestStatus"] | null;
      discovered_items: number | null;
      queued_items: number | null;
      processing_items: number | null;
      completed_items: number | null;
      failed_items: number | null;
      archive_bytes: number | null;
      error_summary: string | null;
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
        ingest_status,
        discovered_items,
        queued_items,
        processing_items,
        completed_items,
        failed_items,
        archive_bytes,
        error_summary,
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
      ingestStatus: row.ingest_status ?? undefined,
      discoveredItems: row.discovered_items ?? undefined,
      queuedItems: row.queued_items ?? undefined,
      processingItems: row.processing_items ?? undefined,
      completedItems: row.completed_items ?? undefined,
      failedItems: row.failed_items ?? undefined,
      archiveBytes: row.archive_bytes ?? undefined,
      errorSummary: row.error_summary ?? undefined,
      status: row.status,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString()
    };
  }

  async listBatchItems(batchId: string, limit = 200, offset = 0): Promise<BatchItemRecord[]> {
    await this.ensureBatchSchema();
    const { rows } = await this.pool.query<{
      batch_item_id: string;
      client_label_id: string;
      image_filename: string | null;
      regulatory_profile: BatchItemRecord["regulatoryProfile"];
      application_id: string | null;
      expected_brand_name: string | null;
      expected_class_type: string | null;
      expected_abv_text: string | null;
      expected_net_contents: string | null;
      expected_government_warning: string | null;
      require_gov_warning: boolean | null;
      front_image_path: string | null;
      back_image_path: string | null;
      additional_image_paths: string[] | null;
      status: BatchItemRecord["status"];
      last_error_code: string | null;
      retry_count: number;
      error_reason: string | null;
      updated_at: Date;
    }>(
      `
      SELECT
        batch_item_id,
        client_label_id,
        image_filename,
        regulatory_profile,
        application_id,
        expected_brand_name,
        expected_class_type,
        expected_abv_text,
        expected_net_contents,
        expected_government_warning,
        require_gov_warning,
        front_image_path,
        back_image_path,
        additional_image_paths,
        status,
        last_error_code,
        retry_count,
        error_reason,
        updated_at
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
      imageFilename: row.image_filename ?? undefined,
      regulatoryProfile: row.regulatory_profile,
      applicationId: row.application_id ?? undefined,
      expectedBrandName: row.expected_brand_name ?? undefined,
      expectedClassType: row.expected_class_type ?? undefined,
      expectedAbvText: row.expected_abv_text ?? undefined,
      expectedNetContents: row.expected_net_contents ?? undefined,
      expectedGovernmentWarning: row.expected_government_warning ?? undefined,
      requireGovWarning: row.require_gov_warning ?? undefined,
      frontImagePath: row.front_image_path ?? undefined,
      backImagePath: row.back_image_path ?? undefined,
      additionalImagePaths: row.additional_image_paths ?? undefined,
      status: row.status,
      lastErrorCode: row.last_error_code ?? undefined,
      retryCount: row.retry_count,
      errorReason: row.error_reason ?? undefined,
      updatedAt: row.updated_at.toISOString()
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
    await this.ensureBatchSchema();
    const { rows } = await this.pool.query<{
      batch_id: string;
      application_id: string;
      total_items: number;
      accepted_items: number;
      rejected_items: number;
      status: BatchJobRecord["status"];
      ingest_status: BatchJobRecord["ingestStatus"] | null;
      discovered_items: number | null;
      queued_items: number | null;
      processing_items: number | null;
      completed_items: number | null;
      failed_items: number | null;
      archive_bytes: number | null;
      error_summary: string | null;
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
        ingest_status,
        discovered_items,
        queued_items,
        processing_items,
        completed_items,
        failed_items,
        archive_bytes,
        error_summary,
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
      ingestStatus: row.ingest_status ?? undefined,
      discoveredItems: row.discovered_items ?? undefined,
      queuedItems: row.queued_items ?? undefined,
      processingItems: row.processing_items ?? undefined,
      completedItems: row.completed_items ?? undefined,
      failedItems: row.failed_items ?? undefined,
      archiveBytes: row.archive_bytes ?? undefined,
      errorSummary: row.error_summary ?? undefined,
      status: row.status,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString()
    }));
  }

  async backfillPendingSyncToSynced(scope: "terminal_only" | "all" = "terminal_only"): Promise<number> {
    if (scope === "all") {
      const { rowCount } = await this.pool.query(
        `
        UPDATE label_applications
        SET sync_state = 'synced',
            updated_at = NOW()
        WHERE sync_state = 'pending_sync'
        `
      );
      return rowCount ?? 0;
    }

    const terminalStatuses: LabelApplicationDoc["status"][] = [
      "matched",
      "approved",
      "rejected",
      "needs_review",
      "batch_completed"
    ];
    const { rowCount } = await this.pool.query(
      `
      UPDATE label_applications
      SET sync_state = 'synced',
          updated_at = NOW()
      WHERE sync_state = 'pending_sync'
        AND current_status = ANY($1::text[])
      `,
      [terminalStatuses]
    );
    return rowCount ?? 0;
  }

  async getSyncStateCounts(): Promise<Record<LabelApplicationDoc["syncState"], number>> {
    const { rows } = await this.pool.query<{
      sync_state: LabelApplicationDoc["syncState"];
      count: string;
    }>(
      `
      SELECT sync_state, COUNT(*)::text AS count
      FROM label_applications
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

  async getStatusCounts(): Promise<Record<LabelApplicationDoc["status"], number>> {
    const { rows } = await this.pool.query<{
      current_status: LabelApplicationDoc["status"];
      count: string;
    }>(
      `
      SELECT current_status, COUNT(*)::text AS count
      FROM label_applications
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

  async upsertSubmissionImage(record: {
    imageId: string;
    applicationId: string;
    role: "front" | "back" | "additional";
    imageIndex: number;
    mimeType: string;
    byteSize: number;
    storagePath: string;
    thumbStoragePath: string;
    sha256: string;
  }): Promise<void> {
    await this.ensureSubmissionImagesSchema();
    await this.pool.query(
      `
      INSERT INTO submission_images (
        image_id,
        application_id,
        role,
        image_index,
        mime_type,
        byte_size,
        storage_path,
        thumb_storage_path,
        sha256,
        created_at
      )
      VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8, $9, NOW())
      ON CONFLICT (image_id)
      DO UPDATE SET
        role = EXCLUDED.role,
        image_index = EXCLUDED.image_index,
        mime_type = EXCLUDED.mime_type,
        byte_size = EXCLUDED.byte_size,
        storage_path = EXCLUDED.storage_path,
        thumb_storage_path = EXCLUDED.thumb_storage_path,
        sha256 = EXCLUDED.sha256
      `,
      [
        record.imageId,
        record.applicationId,
        record.role,
        record.imageIndex,
        record.mimeType,
        record.byteSize,
        record.storagePath,
        record.thumbStoragePath,
        record.sha256
      ]
    );
  }

  async listSubmissionImages(applicationId: string): Promise<
    Array<{
      imageId: string;
      applicationId: string;
      role: "front" | "back" | "additional";
      imageIndex: number;
      mimeType: string;
      byteSize: number;
      storagePath: string;
      thumbStoragePath: string;
      createdAt: string;
    }>
  > {
    await this.ensureSubmissionImagesSchema();
    const { rows } = await this.pool.query<{
      image_id: string;
      application_id: string;
      role: "front" | "back" | "additional";
      image_index: number;
      mime_type: string;
      byte_size: number;
      storage_path: string;
      thumb_storage_path: string;
      created_at: Date;
    }>(
      `
      SELECT
        image_id,
        application_id,
        role,
        image_index,
        mime_type,
        byte_size,
        storage_path,
        thumb_storage_path,
        created_at
      FROM submission_images
      WHERE application_id = $1::uuid
      ORDER BY created_at ASC
      `,
      [applicationId]
    );

    return rows.map((row) => ({
      imageId: row.image_id,
      applicationId: row.application_id,
      role: row.role,
      imageIndex: row.image_index,
      mimeType: row.mime_type,
      byteSize: row.byte_size,
      storagePath: row.storage_path,
      thumbStoragePath: row.thumb_storage_path,
      createdAt: row.created_at.toISOString()
    }));
  }

  async getSubmissionImage(applicationId: string, imageId: string): Promise<{
    imageId: string;
    applicationId: string;
    role: "front" | "back" | "additional";
    imageIndex: number;
    mimeType: string;
    byteSize: number;
    storagePath: string;
    thumbStoragePath: string;
    createdAt: string;
  } | null> {
    await this.ensureSubmissionImagesSchema();
    const { rows } = await this.pool.query<{
      image_id: string;
      application_id: string;
      role: "front" | "back" | "additional";
      image_index: number;
      mime_type: string;
      byte_size: number;
      storage_path: string;
      thumb_storage_path: string;
      created_at: Date;
    }>(
      `
      SELECT
        image_id,
        application_id,
        role,
        image_index,
        mime_type,
        byte_size,
        storage_path,
        thumb_storage_path,
        created_at
      FROM submission_images
      WHERE application_id = $1::uuid
        AND image_id = $2::uuid
      LIMIT 1
      `,
      [applicationId, imageId]
    );
    if (rows.length === 0) return null;
    const row = rows[0];
    return {
      imageId: row.image_id,
      applicationId: row.application_id,
      role: row.role,
      imageIndex: row.image_index,
      mimeType: row.mime_type,
      byteSize: row.byte_size,
      storagePath: row.storage_path,
      thumbStoragePath: row.thumb_storage_path,
      createdAt: row.created_at.toISOString()
    };
  }

  async updateImageQuality(
    imageId: string,
    quality: {
      qualityStatus: "assessing" | "good" | "reshoot";
      qualityIssues?: string[];
      qualityScore?: number;
    }
  ): Promise<void> {
    await this.ensureSubmissionImagesSchema();
    await this.pool.query(
      `
      UPDATE submission_images
      SET quality_status = $2,
          quality_issues = $3::jsonb,
          quality_score = $4
      WHERE image_id = $1::uuid
      `,
      [imageId, quality.qualityStatus, JSON.stringify(quality.qualityIssues ?? null), quality.qualityScore ?? null]
    );
  }

  async markImageSuperseded(imageId: string, supersededById: string): Promise<void> {
    await this.ensureSubmissionImagesSchema();
    await this.pool.query(
      `UPDATE submission_images SET superseded_by = $2::uuid WHERE image_id = $1::uuid`,
      [imageId, supersededById]
    );
  }

  async listExpiredSubmissionImages(retentionDays: number): Promise<
    Array<{ imageId: string; storagePath: string; thumbStoragePath: string }>
  > {
    await this.ensureSubmissionImagesSchema();
    const { rows } = await this.pool.query<{
      image_id: string;
      storage_path: string;
      thumb_storage_path: string;
    }>(
      `
      SELECT image_id, storage_path, thumb_storage_path
      FROM submission_images
      WHERE created_at < NOW() - ($1::text || ' days')::interval
      ORDER BY created_at ASC
      LIMIT 2000
      `,
      [String(Math.max(1, retentionDays))]
    );
    return rows.map((row) => ({
      imageId: row.image_id,
      storagePath: row.storage_path,
      thumbStoragePath: row.thumb_storage_path
    }));
  }

  async deleteSubmissionImages(imageIds: string[]): Promise<number> {
    if (imageIds.length === 0) return 0;
    await this.ensureSubmissionImagesSchema();
    const { rowCount } = await this.pool.query(
      `
      DELETE FROM submission_images
      WHERE image_id = ANY($1::uuid[])
      `,
      [imageIds]
    );
    return rowCount ?? 0;
  }

  private async ensureSubmissionImagesSchema(): Promise<void> {
    if (this.submissionSchemaEnsured) return;
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS submission_images (
        image_id UUID PRIMARY KEY,
        application_id UUID NOT NULL REFERENCES label_applications(application_id),
        role TEXT NOT NULL,
        image_index INTEGER NOT NULL,
        mime_type TEXT NOT NULL,
        byte_size INTEGER NOT NULL,
        storage_path TEXT NOT NULL,
        thumb_storage_path TEXT NOT NULL,
        sha256 TEXT NOT NULL,
        quality_status TEXT NOT NULL DEFAULT 'assessing',
        quality_issues JSONB,
        quality_score FLOAT,
        superseded_by UUID,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_submission_images_application_id_created_at
        ON submission_images(application_id, created_at DESC);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_submission_images_app_role_index_sha
        ON submission_images(application_id, role, image_index, sha256);
    `);
    this.submissionSchemaEnsured = true;
  }

  private async ensureBatchSchema(): Promise<void> {
    if (this.batchSchemaEnsured) return;
    await this.pool.query(`
      ALTER TABLE batch_jobs
        ADD COLUMN IF NOT EXISTS ingest_status TEXT,
        ADD COLUMN IF NOT EXISTS discovered_items INTEGER,
        ADD COLUMN IF NOT EXISTS queued_items INTEGER,
        ADD COLUMN IF NOT EXISTS processing_items INTEGER,
        ADD COLUMN IF NOT EXISTS completed_items INTEGER,
        ADD COLUMN IF NOT EXISTS failed_items INTEGER,
        ADD COLUMN IF NOT EXISTS archive_bytes BIGINT,
        ADD COLUMN IF NOT EXISTS error_summary TEXT;
      ALTER TABLE batch_items
        ADD COLUMN IF NOT EXISTS application_id UUID,
        ADD COLUMN IF NOT EXISTS expected_brand_name TEXT,
        ADD COLUMN IF NOT EXISTS expected_class_type TEXT,
        ADD COLUMN IF NOT EXISTS expected_abv_text TEXT,
        ADD COLUMN IF NOT EXISTS expected_net_contents TEXT,
        ADD COLUMN IF NOT EXISTS expected_government_warning TEXT,
        ADD COLUMN IF NOT EXISTS require_gov_warning BOOLEAN,
        ADD COLUMN IF NOT EXISTS front_image_path TEXT,
        ADD COLUMN IF NOT EXISTS back_image_path TEXT,
        ADD COLUMN IF NOT EXISTS additional_image_paths JSONB;
      CREATE INDEX IF NOT EXISTS idx_batch_items_batch_status_updated_at
        ON batch_items(batch_id, status, updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_batch_items_batch_created_at
        ON batch_items(batch_id, created_at ASC);
      CREATE INDEX IF NOT EXISTS idx_batch_jobs_updated_at
        ON batch_jobs(updated_at DESC);
    `);
    this.batchSchemaEnsured = true;
  }
}

export const eventStore = new EventStore();
