import { Pool } from "pg";
import { env } from "../config/env.js";
import type { ApplicationStatus, ComplianceApplicationDoc, ComplianceEvent, CrdtOperation } from "../types/compliance.js";

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
}

export const eventStore = new EventStore();
