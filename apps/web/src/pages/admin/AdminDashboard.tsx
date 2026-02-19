import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { adminApi } from "../../services/adminApi";
import { MetricsCard } from "../../components/admin/MetricsCard";
import type { KPIMetrics, ApplicationQueueItem } from "../../types/admin";
import "./AdminDashboard.css";

export const AdminDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [metrics, setMetrics] = useState<KPIMetrics | null>(null);
  const [recentApplications, setRecentApplications] = useState<ApplicationQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      setError(null);

      const [kpis, queue] = await Promise.all([
        adminApi.getKPIs(168), // 7 days
        adminApi.getQueue({ limit: 5 }),
      ]);

      setMetrics(kpis);
      setRecentApplications(queue.slice(0, 5));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load dashboard data");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="admin-dashboard">
        <div className="admin-dashboard-loading">Loading dashboard...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="admin-dashboard">
        <div className="admin-dashboard-error">
          <p>Error: {error}</p>
          <button onClick={loadDashboardData}>Retry</button>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-dashboard">
      <h1 className="admin-heading-1">Compliance Dashboard</h1>

      <div className="metrics-grid">
        <MetricsCard
          label="Total Processed"
          value={metrics?.totalProcessed ?? 0}
          icon="📊"
        />
        <MetricsCard
          label="Approved This Week"
          value={metrics?.approvedThisWeek ?? 0}
          icon="✓"
          variant="success"
        />
        <MetricsCard
          label="Rejected This Week"
          value={metrics?.rejectedThisWeek ?? 0}
          icon="✗"
          variant="danger"
        />
        <MetricsCard
          label="Needs Review"
          value={metrics?.needsReview ?? 0}
          icon="⚠"
          variant="warning"
        />
        <MetricsCard
          label="Avg Confidence"
          value={`${Math.round((metrics?.avgConfidence ?? 0) * 100)}%`}
          icon="🎯"
        />
        <MetricsCard
          label="Avg OCR Latency"
          value={`${(metrics?.avgOcrLatency ?? 0).toFixed(1)}s`}
          icon="⚡"
        />
      </div>

      <div className="recent-applications-section">
        <div className="recent-applications-header">
          <h2 className="admin-heading-2">Recent Applications</h2>
          <button
            className="btn-admin btn-admin--secondary"
            onClick={() => navigate("/admin/applications")}
          >
            View All →
          </button>
        </div>

        {recentApplications.length === 0 ? (
          <div className="admin-card">
            <p className="admin-text-muted">No recent applications found.</p>
          </div>
        ) : (
          <div className="admin-card">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Application ID</th>
                  <th>Status</th>
                  <th>Confidence</th>
                  <th>Updated</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {recentApplications.map((app) => (
                  <tr key={app.applicationId}>
                    <td>{app.applicationId}</td>
                    <td>
                      <span className={`status-badge status-badge--${getStatusVariant(app.status)}`}>
                        {app.status.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td>{Math.round(app.confidence * 100)}%</td>
                    <td>{formatTimestamp(app.updatedAt)}</td>
                    <td>
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
        )}
      </div>
    </div>
  );
};

function getStatusVariant(status: string): string {
  switch (status) {
    case "matched":
    case "approved":
      return "pass";
    case "rejected":
      return "fail";
    case "needs_review":
      return "review";
    default:
      return "default";
  }
}

function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}
