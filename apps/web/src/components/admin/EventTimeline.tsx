import React from "react";
import type { ComplianceEvent } from "../../types/admin";
import "./EventTimeline.css";

interface EventTimelineProps {
  events: ComplianceEvent[];
}

export const EventTimeline: React.FC<EventTimelineProps> = ({ events }) => {
  if (events.length === 0) {
    return (
      <div className="event-timeline-empty">
        <p>No events recorded for this application.</p>
      </div>
    );
  }

  // Sort events by timestamp (newest first)
  const sortedEvents = [...events].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  return (
    <div className="event-timeline">
      {sortedEvents.map((event, index) => (
        <EventTimelineItem
          key={event.eventId}
          event={event}
          isLast={index === sortedEvents.length - 1}
        />
      ))}
    </div>
  );
};

interface EventTimelineItemProps {
  event: ComplianceEvent;
  isLast: boolean;
}

const EventTimelineItem: React.FC<EventTimelineItemProps> = ({ event, isLast }) => {
  const icon = getEventIcon(event.eventType);
  const color = getEventColor(event.eventType);
  const details = formatEventDetails(event);

  return (
    <div className="timeline-item">
      <div className="timeline-marker">
        <div className={`timeline-icon timeline-icon--${color}`}>{icon}</div>
        {!isLast && <div className="timeline-line" />}
      </div>
      <div className="timeline-content">
        <div className="timeline-header">
          <h4 className="timeline-title">{formatEventType(event.eventType)}</h4>
          <span className="timeline-timestamp">{formatTimestamp(event.createdAt)}</span>
        </div>
        {details.length > 0 && (
          <ul className="timeline-details">
            {details.map((detail, index) => (
              <li key={index} className="timeline-detail">
                <span className="timeline-detail-key">{detail.key}:</span>{" "}
                <span className="timeline-detail-value">{detail.value}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

function getEventIcon(eventType: string): string {
  switch (eventType) {
    case "ApplicationCreated":
      return "📝";
    case "ImageNormalizationCompleted":
      return "🖼️";
    case "OcrCompleted":
      return "🔍";
    case "ExtractionCompleted":
      return "📋";
    case "ComplianceChecksCompleted":
      return "✓";
    case "ScannerQuickCheckRecorded":
      return "⚡";
    case "ReviewerOverrideRecorded":
      return "👤";
    case "SyncMerged":
      return "🔄";
    case "CloudFallbackRequested":
      return "☁️";
    default:
      return "•";
  }
}

function getEventColor(eventType: string): string {
  switch (eventType) {
    case "ApplicationCreated":
      return "default";
    case "ComplianceChecksCompleted":
    case "ScannerQuickCheckRecorded":
      return "success";
    case "ReviewerOverrideRecorded":
      return "warning";
    case "CloudFallbackRequested":
      return "info";
    default:
      return "default";
  }
}

function formatEventType(eventType: string): string {
  // Convert camelCase to Title Case with spaces
  return eventType
    .replace(/([A-Z])/g, " $1")
    .trim()
    .replace(/^./, (str) => str.toUpperCase());
}

function formatTimestamp(timestamp: string): string {
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
  return date.toLocaleString();
}

function formatEventDetails(event: ComplianceEvent): Array<{ key: string; value: string }> {
  const details: Array<{ key: string; value: string }> = [];
  const payload = event.payload;

  switch (event.eventType) {
    case "ApplicationCreated":
      if (payload.regulatoryProfile) {
        details.push({
          key: "Regulatory Profile",
          value: String(payload.regulatoryProfile).replace(/_/g, " "),
        });
      }
      if (payload.submissionType) {
        details.push({ key: "Submission Type", value: String(payload.submissionType) });
      }
      if (payload.createdByUserId) {
        details.push({ key: "Created By", value: String(payload.createdByUserId) });
      }
      break;

    case "ImageNormalizationCompleted":
      if (payload.role) {
        details.push({ key: "Role", value: String(payload.role) });
      }
      if (payload.originalSize && payload.normalizedSize) {
        details.push({
          key: "Size",
          value: `${formatBytes(Number(payload.originalSize))} → ${formatBytes(Number(payload.normalizedSize))}`,
        });
      }
      break;

    case "OcrCompleted":
      if (payload.imageRole) {
        details.push({ key: "Image", value: `${payload.imageRole} label` });
      }
      if (payload.provider) {
        details.push({ key: "Provider", value: String(payload.provider) });
      }
      if (payload.confidence !== undefined) {
        details.push({
          key: "Confidence",
          value: `${Math.round(Number(payload.confidence) * 100)}%`,
        });
      }
      if (payload.usedFallback) {
        details.push({ key: "Used fallback", value: payload.usedFallback ? "Yes" : "No" });
      }
      break;

    case "ExtractionCompleted":
      if (payload.brandName) {
        details.push({ key: "Brand Name", value: String(payload.brandName) });
      }
      if (payload.classType) {
        details.push({ key: "Class/Type", value: String(payload.classType) });
      }
      if (payload.abvText) {
        details.push({ key: "ABV", value: String(payload.abvText) });
      } else {
        details.push({ key: "ABV", value: "Not detected" });
      }
      if (payload.netContents) {
        details.push({ key: "Net Contents", value: String(payload.netContents) });
      }
      if (payload.hasGovWarning !== undefined) {
        details.push({
          key: "Gov Warning",
          value: payload.hasGovWarning ? "Present" : "Not found",
        });
      }
      break;

    case "ComplianceChecksCompleted":
      if (payload.summary) {
        details.push({ key: "Summary", value: String(payload.summary) });
      }
      if (payload.hardFailures !== undefined) {
        details.push({
          key: "Hard failures",
          value: `${payload.hardFailures} check(s)`,
        });
      }
      if (payload.totalChecks) {
        details.push({ key: "Total checks", value: `${payload.totalChecks} evaluated` });
      }
      break;

    case "ScannerQuickCheckRecorded":
      if (payload.decision) {
        details.push({ key: "Decision", value: String(payload.decision) });
      }
      if (payload.confidence !== undefined) {
        details.push({
          key: "Confidence",
          value: `${Math.round(Number(payload.confidence) * 100)}%`,
        });
      }
      break;

    case "ReviewerOverrideRecorded":
      if (payload.decision) {
        details.push({ key: "Decision", value: String(payload.decision) });
      }
      if (payload.reviewedBy) {
        details.push({ key: "Reviewed By", value: String(payload.reviewedBy) });
      }
      if (payload.notes) {
        details.push({ key: "Notes", value: String(payload.notes) });
      }
      break;

    case "SyncMerged":
      if (payload.status) {
        details.push({ key: "Status", value: String(payload.status) });
      }
      break;

    case "CloudFallbackRequested":
      if (payload.reason) {
        details.push({ key: "Reason", value: String(payload.reason) });
      }
      break;
  }

  return details;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
