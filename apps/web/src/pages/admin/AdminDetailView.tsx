import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { adminApi } from "../../services/adminApi";
import { MetadataGrid } from "../../components/admin/MetadataGrid";
import { ComplianceChecksTable } from "../../components/admin/ComplianceChecksTable";
import { ImageViewer } from "../../components/admin/ImageViewer";
import { EventTimeline } from "../../components/admin/EventTimeline";
import { ApprovalControls } from "../../components/admin/ApprovalControls";
import type { ApplicationDetail, ComplianceEvent } from "../../types/admin";
import "./AdminDetailView.css";

export const AdminDetailView: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [application, setApplication] = useState<ApplicationDetail | null>(null);
  const [events, setEvents] = useState<ComplianceEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (id) {
      loadApplicationDetail(id);
    }
  }, [id]);

  const loadApplicationDetail = async (applicationId: string) => {
    try {
      setLoading(true);
      setError(null);

      const [detail, eventHistory] = await Promise.all([
        adminApi.getApplicationDetail(applicationId),
        adminApi.getApplicationEvents(applicationId),
      ]);

      setApplication(detail);
      setEvents(eventHistory);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load application detail");
    } finally {
      setLoading(false);
    }
  };

  const handleRescan = async (imageId: string, reason: string) => {
    if (!id) return;

    try {
      await adminApi.rescanImage(id, imageId, { reason: reason as any });
      // Reload the application detail to see updated results
      await loadApplicationDetail(id);
    } catch (err) {
      console.error("Failed to rescan image:", err);
      alert("Failed to rescan image. Please try again.");
    }
  };

  const handleApprove = async (notes: string) => {
    if (!id) return;

    try {
      await adminApi.approveApplication(id, {
        reviewedBy: "current_user", // Will be filled from auth context
        notes,
      });
      // Reload the application detail to see updated status
      await loadApplicationDetail(id);
    } catch (err) {
      console.error("Failed to approve application:", err);
      throw err;
    }
  };

  const handleReject = async (reason: string, notes: string) => {
    if (!id) return;

    try {
      await adminApi.rejectApplication(id, {
        reason,
        notes,
        reviewedBy: "current_user", // Will be filled from auth context
      });
      // Reload the application detail to see updated status
      await loadApplicationDetail(id);
    } catch (err) {
      console.error("Failed to reject application:", err);
      throw err;
    }
  };

  if (loading) {
    return (
      <div className="admin-detail-view">
        <div className="admin-detail-loading">Loading application detail...</div>
      </div>
    );
  }

  if (error || !application) {
    return (
      <div className="admin-detail-view">
        <div className="admin-detail-error">
          <p>Error: {error || "Application not found"}</p>
          <button
            className="btn-admin btn-admin--primary"
            onClick={() => navigate("/admin/applications")}
          >
            ← Back to List
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-detail-view">
      <div className="admin-detail-header">
        <button
          className="btn-admin btn-admin--secondary"
          onClick={() => navigate("/admin/applications")}
        >
          ← Back to List
        </button>
        <h1 className="admin-heading-1">
          Application {application.applicationId ? application.applicationId.slice(0, 8) + "..." : "Unknown"}
        </h1>
        <button
          className="btn-admin btn-admin--secondary"
          onClick={() => id && loadApplicationDetail(id)}
        >
          ↻ Refresh
        </button>
      </div>

      <section className="detail-section">
        <h2 className="admin-heading-2">Overview</h2>
        <MetadataGrid application={application} />
      </section>

      <section className="detail-section">
        <h2 className="admin-heading-2">Submission Images</h2>
        <ImageViewer
          applicationId={application.applicationId}
          images={application.images}
          onRescan={handleRescan}
        />
      </section>

      <section className="detail-section">
        <h2 className="admin-heading-2">Compliance Checks</h2>
        <div className="admin-card">
          <ComplianceChecksTable checks={application.checks} />
        </div>
      </section>

      <section className="detail-section">
        <h2 className="admin-heading-2">Event Timeline</h2>
        <div className="admin-card">
          <EventTimeline events={events} />
        </div>
      </section>

      <section className="detail-section">
        <h2 className="admin-heading-2">Manual Review Decision</h2>
        <div className="admin-card">
          <ApprovalControls
            applicationId={application.applicationId}
            currentStatus={application.status}
            onApprove={handleApprove}
            onReject={handleReject}
          />
        </div>
      </section>
    </div>
  );
};
