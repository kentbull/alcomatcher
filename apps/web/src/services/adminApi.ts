import type {
  KPIMetrics,
  ApplicationQueueItem,
  ApplicationDetail,
  ComplianceEvent,
  ApprovalRequest,
  RejectionRequest,
  RescanRequest,
  ApprovalResponse,
  RescanResponse,
} from "../types/admin";

const API_BASE = "/api";

function getAuthHeaders(): HeadersInit {
  const token = localStorage.getItem("alcomatcher_token");
  if (token) {
    return {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    };
  }
  return {
    "Content-Type": "application/json",
  };
}

export const adminApi = {
  // KPI Metrics
  async getKPIs(windowHours: number = 168): Promise<KPIMetrics> {
    const response = await fetch(
      `${API_BASE}/admin/kpis?windowHours=${windowHours}`,
      {
        headers: getAuthHeaders(),
      }
    );
    if (!response.ok) {
      throw new Error(`Failed to fetch KPIs: ${response.statusText}`);
    }
    const data = await response.json();
    return data.kpis;
  },

  // Application Queue (Paginated)
  async getQueue(params: {
    page?: number;
    limit?: number;
    status?: string;
    syncState?: string;
    search?: string;
  } = {}): Promise<ApplicationQueueItem[]> {
    const searchParams = new URLSearchParams();
    if (params.page) searchParams.set("page", params.page.toString());
    if (params.limit) searchParams.set("limit", params.limit.toString());
    if (params.status) searchParams.set("status", params.status);
    if (params.syncState) searchParams.set("syncState", params.syncState);
    if (params.search) searchParams.set("search", params.search);

    const response = await fetch(
      `${API_BASE}/admin/queue?${searchParams.toString()}`,
      {
        headers: getAuthHeaders(),
      }
    );
    if (!response.ok) {
      throw new Error(`Failed to fetch queue: ${response.statusText}`);
    }
    const data = await response.json();
    // For now, return the queue array. Pagination will be added in Phase 2
    return data.queue || [];
  },

  // Application Detail
  async getApplicationDetail(applicationId: string): Promise<ApplicationDetail> {
    const response = await fetch(
      `${API_BASE}/history/${applicationId}`,
      {
        headers: getAuthHeaders(),
      }
    );
    if (!response.ok) {
      throw new Error(`Failed to fetch application detail: ${response.statusText}`);
    }
    return response.json();
  },

  // Event History
  async getApplicationEvents(applicationId: string): Promise<ComplianceEvent[]> {
    const response = await fetch(
      `${API_BASE}/applications/${applicationId}/events`,
      {
        headers: getAuthHeaders(),
      }
    );
    if (!response.ok) {
      throw new Error(`Failed to fetch application events: ${response.statusText}`);
    }
    return response.json();
  },

  // Image URLs
  getImageUrl(applicationId: string, imageId: string, variant: "thumb" | "full" = "thumb"): string {
    return `${API_BASE}/history/${applicationId}/images/${imageId}?variant=${variant}`;
  },

  // Approve Application
  async approveApplication(
    applicationId: string,
    request: ApprovalRequest
  ): Promise<ApprovalResponse> {
    const response = await fetch(
      `${API_BASE}/admin/applications/${applicationId}/approve`,
      {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify(request),
      }
    );
    if (!response.ok) {
      throw new Error(`Failed to approve application: ${response.statusText}`);
    }
    return response.json();
  },

  // Reject Application
  async rejectApplication(
    applicationId: string,
    request: RejectionRequest
  ): Promise<ApprovalResponse> {
    const response = await fetch(
      `${API_BASE}/admin/applications/${applicationId}/reject`,
      {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify(request),
      }
    );
    if (!response.ok) {
      throw new Error(`Failed to reject application: ${response.statusText}`);
    }
    return response.json();
  },

  // Re-scan Image
  async rescanImage(
    applicationId: string,
    imageId: string,
    request: RescanRequest
  ): Promise<RescanResponse> {
    const response = await fetch(
      `${API_BASE}/admin/applications/${applicationId}/images/${imageId}/rescan`,
      {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify(request),
      }
    );
    if (!response.ok) {
      throw new Error(`Failed to rescan image: ${response.statusText}`);
    }
    return response.json();
  },
};
