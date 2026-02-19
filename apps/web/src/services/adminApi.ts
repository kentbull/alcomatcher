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
  ApplicationStatus,
  SyncState,
} from "../types/admin";

const API_BASE = "/api";

function getAuthHeaders(): HeadersInit {
  // No need for Authorization header - using HttpOnly cookies
  return {
    "Content-Type": "application/json",
  };
}

function getFetchOptions(options: RequestInit = {}): RequestInit {
  return {
    ...options,
    credentials: "include", // Always include cookies
    headers: {
      ...getAuthHeaders(),
      ...options.headers,
    },
  };
}

export const adminApi = {
  // KPI Metrics
  async getKPIs(windowHours: number = 168): Promise<KPIMetrics> {
    const response = await fetch(
      `${API_BASE}/admin/kpis?windowHours=${windowHours}`,
      getFetchOptions()
    );
    if (!response.ok) {
      throw new Error(`Failed to fetch KPIs: ${response.statusText}`);
    }
    const data = await response.json();
    return data.kpis;
  },

  // Application Queue (Paginated)
  async getQueue(params?: {
    status?: ApplicationStatus;
    syncState?: SyncState;
    search?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ items: ApplicationQueueItem[]; totalCount: number }> {
    const searchParams = new URLSearchParams();

    if (params?.status) {
      searchParams.set("status", params.status);
    }
    if (params?.limit !== undefined) {
      searchParams.set("limit", params.limit.toString());
    }
    if (params?.offset !== undefined) {
      searchParams.set("offset", params.offset.toString());
    }

    const url = `${API_BASE}/admin/queue${searchParams.toString() ? "?" + searchParams.toString() : ""}`;
    const response = await fetch(url, getFetchOptions());

    if (!response.ok) {
      throw new Error("Failed to fetch queue");
    }

    const data = await response.json();

    // Check if response has pagination metadata
    if (data.pagination) {
      return {
        items: data.queue || [],
        totalCount: data.pagination.totalCount
      };
    }

    // Fallback for non-paginated response (backward compatible)
    return {
      items: data.queue || [],
      totalCount: data.queue?.length || 0
    };
  },

  // Application Detail
  async getApplicationDetail(applicationId: string): Promise<ApplicationDetail> {
    const response = await fetch(
      `${API_BASE}/history/${applicationId}`,
      getFetchOptions()
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
      getFetchOptions()
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
      getFetchOptions({
        method: "POST",
        body: JSON.stringify(request),
      })
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
      getFetchOptions({
        method: "POST",
        body: JSON.stringify(request),
      })
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
      getFetchOptions({
        method: "POST",
        body: JSON.stringify(request),
      })
    );
    if (!response.ok) {
      throw new Error(`Failed to rescan image: ${response.statusText}`);
    }
    return response.json();
  },
};
