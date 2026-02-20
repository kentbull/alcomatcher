import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { adminApi } from "../../services/adminApi";
import type { BatchDetail } from "../../types/admin";
import "./AdminBatchUploadView.css";

const POLL_MS = 1500;

export const AdminBatchUploadView: React.FC = () => {
  const navigate = useNavigate();
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<"csv_bundle" | "directory_bundle">("csv_bundle");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [batch, setBatch] = useState<BatchDetail | null>(null);

  const completion = useMemo(() => {
    if (!batch || !batch.totalItems) return 0;
    return batch.progressPct ?? Math.round((((batch.completedItems ?? 0) + (batch.failedItems ?? 0)) / batch.totalItems) * 100);
  }, [batch]);

  const onUpload = async () => {
    if (!file) {
      setError("Choose a .zip archive first.");
      return;
    }

    try {
      setBusy(true);
      setError(null);
      const created = await adminApi.uploadBatchArchive(file, mode);
      setBatchId(created.batchId);

      let done = false;
      while (!done) {
        const next = await adminApi.getBatchStatus(created.batchId, 100, 0);
        setBatch(next);
        done = next.ingestStatus === "completed" || next.ingestStatus === "partially_failed" || next.ingestStatus === "failed";
        if (!done) {
          await new Promise((resolve) => setTimeout(resolve, POLL_MS));
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Batch upload failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="admin-batch-view">
      <div className="admin-batch-header">
        <div>
          <h1 className="admin-heading-1">Batch Upload</h1>
          <p className="admin-text-muted admin-batch-subtitle">Queue 200-300 labels per upload, designed to scale to 500+.</p>
        </div>
        <button className="btn-admin btn-admin--secondary" onClick={() => navigate("/admin/applications")}>Applications</button>
      </div>

      <div className="admin-card admin-batch-form">
        <p className="admin-text-muted">
          Upload a ZIP with either a CSV manifest + image bundle or directory-based folders containing <code>label.txt</code> and images.
        </p>

        <label className="batch-label" htmlFor="batch-archive">Archive (.zip)</label>
        <input
          className="batch-input"
          id="batch-archive"
          type="file"
          accept=".zip,application/zip"
          disabled={busy}
          onChange={(event) => setFile(event.currentTarget.files?.[0] ?? null)}
        />
        <div className="admin-text-muted admin-batch-file">
          {file ? `Selected: ${file.name}` : "No archive selected"}
        </div>

        <label className="batch-label" htmlFor="batch-mode">Mode</label>
        <select className="batch-select" id="batch-mode" value={mode} disabled={busy} onChange={(event) => setMode(event.currentTarget.value as typeof mode)}>
          <option value="csv_bundle">CSV Bundle</option>
          <option value="directory_bundle">Directory Bundle</option>
        </select>

        <button className="btn-admin btn-admin--primary" disabled={busy || !file} onClick={onUpload}>
          {busy ? "Uploading / Processing..." : "Start Batch Upload"}
        </button>

        {error && <p className="admin-batch-error">{error}</p>}
      </div>

      {batchId && (
        <div className="admin-card admin-batch-status">
          <div className="admin-batch-status-head">
            <h2 className="admin-heading-2">Batch {batchId.slice(0, 8)}...</h2>
            <span className={`status-badge ${toIngestStatusClass(batch?.ingestStatus)}`}>{batch?.ingestStatus ?? "received"}</span>
          </div>

          <div className="admin-batch-progress">
            <div className="admin-batch-progress-fill" style={{ width: `${completion}%` }} />
          </div>
          <p className="admin-text-muted">{completion}% complete</p>
          {batch?.errorSummary ? <p className="admin-batch-error">Batch Error: {batch.errorSummary}</p> : null}

          {batch && (
            <div className="admin-batch-metrics">
              <span>Total: {batch.totalItems}</span>
              <span>Queued: {batch.queuedItems ?? 0}</span>
              <span>Processing: {batch.processingItems ?? 0}</span>
              <span>Completed: {batch.completedItems ?? 0}</span>
              <span>Failed: {batch.failedItems ?? 0}</span>
            </div>
          )}

          <div className="admin-batch-items">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Status</th>
                  <th>Retry</th>
                  <th>Application</th>
                  <th>Error</th>
                </tr>
              </thead>
              <tbody>
                {(batch?.items ?? []).map((item) => (
                  <tr key={item.batchItemId}>
                    <td>{item.clientLabelId}</td>
                    <td><span className={`status-badge ${toItemStatusClass(item.status)}`}>{item.status}</span></td>
                    <td>{item.retryCount}</td>
                    <td>
                      {item.applicationId ? (
                        <button
                          className="btn-admin btn-admin--secondary btn-admin--small"
                          onClick={() => navigate(`/admin/applications/${item.applicationId}`)}
                        >
                          View
                        </button>
                      ) : "-"}
                    </td>
                    <td>{item.errorReason ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

function toItemStatusClass(status: string) {
  if (status === "completed") return "status-badge--pass";
  if (status === "failed") return "status-badge--fail";
  if (status === "processing") return "status-badge--review";
  return "status-badge--default";
}

function toIngestStatusClass(status?: string) {
  if (status === "completed") return "status-badge--pass";
  if (status === "failed" || status === "partially_failed") return "status-badge--fail";
  if (status === "processing" || status === "parsing" || status === "queued") return "status-badge--review";
  return "status-badge--default";
}
