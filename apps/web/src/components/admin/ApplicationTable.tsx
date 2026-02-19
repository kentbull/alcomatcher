import React from "react";
import { useNavigate } from "react-router-dom";
import { StatusBadge } from "./StatusBadge";
import type { ApplicationQueueItem } from "../../types/admin";
import "./ApplicationTable.css";

interface ApplicationTableProps {
  applications: ApplicationQueueItem[];
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  onSort?: (field: string) => void;
}

export const ApplicationTable: React.FC<ApplicationTableProps> = ({
  applications,
  sortBy,
  sortOrder,
  onSort,
}) => {
  const navigate = useNavigate();

  const handleSort = (field: string) => {
    if (onSort) {
      onSort(field);
    }
  };

  const getSortIcon = (field: string) => {
    if (sortBy !== field) return "⇅";
    return sortOrder === "asc" ? "↑" : "↓";
  };

  const formatTimestamp = (timestamp: string): string => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return "just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const getSyncIcon = (syncState: string): string => {
    switch (syncState) {
      case "synced":
        return "✓";
      case "pending_sync":
        return "⏳";
      case "sync_failed":
        return "✗";
      default:
        return "?";
    }
  };

  if (applications.length === 0) {
    return (
      <div className="application-table-empty">
        <p>No applications found matching your filters.</p>
      </div>
    );
  }

  return (
    <div className="application-table-wrapper">
      <table className="admin-table application-table">
        <thead>
          <tr>
            <th onClick={() => handleSort("applicationId")} className="sortable">
              ID {getSortIcon("applicationId")}
            </th>
            <th onClick={() => handleSort("status")} className="sortable">
              Status {getSortIcon("status")}
            </th>
            <th onClick={() => handleSort("syncState")} className="sortable">
              Sync {getSortIcon("syncState")}
            </th>
            <th>Brand</th>
            <th onClick={() => handleSort("confidence")} className="sortable">
              Confidence {getSortIcon("confidence")}
            </th>
            <th onClick={() => handleSort("updatedAt")} className="sortable">
              Updated {getSortIcon("updatedAt")}
            </th>
            <th className="action-column">Action</th>
          </tr>
        </thead>
        <tbody>
          {applications.map((app) => (
            <tr
              key={app.applicationId}
              onClick={() => navigate(`/admin/applications/${app.applicationId}`)}
              className="clickable-row"
            >
              <td className="app-id-cell">
                <span className="app-id" title={app.applicationId}>
                  {app.applicationId.slice(0, 8)}...
                </span>
              </td>
              <td>
                <StatusBadge status={app.status} />
              </td>
              <td>
                <span
                  className={`sync-icon sync-icon--${app.syncState}`}
                  title={app.syncState.replace(/_/g, " ")}
                >
                  {getSyncIcon(app.syncState)}
                </span>
              </td>
              <td className="brand-cell">
                {app.brandName || <span className="text-muted">—</span>}
              </td>
              <td className="confidence-cell">
                {app.confidence !== undefined && app.confidence !== null ? (
                  <span className={`confidence-value confidence-${getConfidenceClass(app.confidence)}`}>
                    {Math.round(app.confidence * 100)}%
                  </span>
                ) : (
                  <span className="text-muted">—</span>
                )}
              </td>
              <td className="timestamp-cell">{formatTimestamp(app.updatedAt)}</td>
              <td className="action-column" onClick={(e) => e.stopPropagation()}>
                <button
                  className="btn-admin btn-admin--secondary btn-admin--small"
                  onClick={() => navigate(`/admin/applications/${app.applicationId}`)}
                >
                  View
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

function getConfidenceClass(confidence: number): string {
  if (confidence >= 0.85) return "high";
  if (confidence >= 0.7) return "medium";
  return "low";
}
