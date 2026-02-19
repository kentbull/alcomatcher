import React from "react";
import { StatusBadge } from "./StatusBadge";
import type { ApplicationDetail } from "../../types/admin";
import "./MetadataGrid.css";

interface MetadataGridProps {
  application: ApplicationDetail;
}

export const MetadataGrid: React.FC<MetadataGridProps> = ({ application }) => {
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  return (
    <div className="metadata-grid">
      <div className="metadata-card">
        <div className="metadata-label">Status</div>
        <div className="metadata-value">
          <StatusBadge status={application.status} />
        </div>
      </div>

      <div className="metadata-card">
        <div className="metadata-label">Confidence</div>
        <div className="metadata-value metadata-value--large">
          <span className={`confidence-value confidence-${getConfidenceClass(application.confidence)}`}>
            {Math.round(application.confidence * 100)}%
          </span>
        </div>
      </div>

      <div className="metadata-card">
        <div className="metadata-label">Last Updated</div>
        <div className="metadata-value">{formatDate(application.updatedAt)}</div>
      </div>

      <div className="metadata-card">
        <div className="metadata-label">Submitted By</div>
        <div className="metadata-value">
          {application.createdByUserId || <span className="text-muted">—</span>}
        </div>
      </div>

      <div className="metadata-card">
        <div className="metadata-label">Regulatory Profile</div>
        <div className="metadata-value">
          {application.regulatoryProfile?.replace(/_/g, " ") || (
            <span className="text-muted">—</span>
          )}
        </div>
      </div>

      <div className="metadata-card">
        <div className="metadata-label">Sync State</div>
        <div className="metadata-value">
          <span className={`sync-badge sync-badge--${application.syncState}`}>
            {application.syncState === "synced" && "✓ Synced"}
            {application.syncState === "pending" && "⏳ Pending"}
            {application.syncState === "sync_failed" && "✗ Failed"}
          </span>
        </div>
      </div>

      {application.brandName && (
        <div className="metadata-card metadata-card--wide">
          <div className="metadata-label">Brand Name</div>
          <div className="metadata-value metadata-value--large">{application.brandName}</div>
        </div>
      )}

      {application.classType && (
        <div className="metadata-card">
          <div className="metadata-label">Class/Type</div>
          <div className="metadata-value">{application.classType}</div>
        </div>
      )}

      {application.abvText && (
        <div className="metadata-card">
          <div className="metadata-label">ABV</div>
          <div className="metadata-value">{application.abvText}</div>
        </div>
      )}

      {application.netContents && (
        <div className="metadata-card">
          <div className="metadata-label">Net Contents</div>
          <div className="metadata-value">{application.netContents}</div>
        </div>
      )}

      <div className="metadata-card">
        <div className="metadata-label">Application ID</div>
        <div className="metadata-value metadata-value--mono">
          {application.applicationId}
        </div>
      </div>

      <div className="metadata-card">
        <div className="metadata-label">Created</div>
        <div className="metadata-value">{formatDate(application.createdAt)}</div>
      </div>
    </div>
  );
};

function getConfidenceClass(confidence: number): string {
  if (confidence >= 0.85) return "high";
  if (confidence >= 0.7) return "medium";
  return "low";
}
