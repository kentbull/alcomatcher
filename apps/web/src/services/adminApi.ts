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
  BatchDetail,
  ListUsersParams,
  ListUsersResponse
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
    const kpis = data.kpis;
    return {
      totalProcessed: kpis.totals?.quickChecks ?? 0,
      approvedThisWeek: (kpis.statusCounts?.approved ?? 0) + (kpis.statusCounts?.matched ?? 0),
      rejectedThisWeek: kpis.statusCounts?.rejected ?? 0,
      needsReview: kpis.statusCounts?.needs_review ?? 0,
      avgConfidence: kpis.scanPerformance?.avgConfidence ?? 0,
      avgOcrLatency: (kpis.scanPerformance?.p50Ms ?? 0) / 1000,
    };
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

    const data = await response.json();

    // Transform nested API response to flat ApplicationDetail format
    // Safely extract extracted data from report
    const extracted = data.report?.extracted || data.report?.latestQuickCheck?.extracted || {};
    const latestQuickCheck = data.report?.latestQuickCheck || {};

    // Transform images to match expected format
    const images = Array.isArray(data.images) ? data.images.map((img: any) => ({
      imageId: img.imageId,
      role: img.role,
      imageIndex: img.index || img.imageIndex || 0,
      qualityStatus: img.qualityStatus,
      qualityIssues: Array.isArray(img.qualityIssues) ? img.qualityIssues : [],
      ocrProvider: img.ocrProvider,
      ocrConfidence: img.ocrConfidence,
      thumbnailUrl: img.thumbUrl,
      fullUrl: img.fullUrl,
    })) : [];

    // Transform checks to match expected format
    const checks = Array.isArray(data.report?.checks) ? data.report.checks : [];

    return {
      applicationId: data.application?.applicationId || applicationId,
      status: data.application?.status || "created",
      syncState: data.application?.syncState || "pending",
      confidence: latestQuickCheck.confidence || 0,
      brandName: extracted.brandName,
      classType: extracted.classType,
      abvText: extracted.abvText,
      netContents: extracted.netContents,
      regulatoryProfile: data.report?.regulatoryProfile || extracted.regulatoryProfile,
      createdByUserId: data.application?.createdByUserId,
      lastDecidedByUserId: data.report?.lastDecidedByUserId,
      createdAt: data.application?.createdAt || data.application?.updatedAt || new Date().toISOString(),
      updatedAt: data.application?.updatedAt || new Date().toISOString(),
      images,
      checks,
    };
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

    const data = await response.json();

    // API returns { events: [...] }, extract the array
    // Defensive check: ensure it's actually an array
    if (data && Array.isArray(data.events)) {
      return data.events;
    }

    // Fallback: return empty array if structure is unexpected
    console.warn('getApplicationEvents: unexpected response structure', data);
    return [];
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
      let detail = response.statusText;
      try {
        const payload = await response.json();
        detail = payload?.detail || payload?.error || detail;
      } catch {
        // Fall back to status text.
      }
      throw new Error(`Failed to approve application: ${detail}`);
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
      let detail = response.statusText;
      try {
        const payload = await response.json();
        detail = payload?.detail || payload?.error || detail;
      } catch {
        // Fall back to status text.
      }
      throw new Error(`Failed to reject application: ${detail}`);
    }
    return response.json();
  },

  // SSE Auth Ticket
  async getStreamTicket(): Promise<string> {
    const response = await fetch(
      `${API_BASE}/events/stream-auth-ticket`,
      getFetchOptions()
    );
    if (!response.ok) throw new Error("Failed to get SSE ticket");
    const data = await response.json();
    return typeof data.ticket === "string" ? data.ticket : "";
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

  // User Management
  async getUsers(params?: ListUsersParams): Promise<ListUsersResponse> {
    const searchParams = new URLSearchParams();

    if (params?.limit !== undefined) searchParams.set("limit", params.limit.toString());
    if (params?.cursor) searchParams.set("cursor", params.cursor);
    if (params?.role) searchParams.set("role", params.role);
    if (typeof params?.verified === "boolean") searchParams.set("verified", String(params.verified));
    if (typeof params?.active === "boolean") searchParams.set("active", String(params.active));

    const url = `${API_BASE}/admin/users${searchParams.toString() ? `?${searchParams.toString()}` : ""}`;
    const response = await fetch(url, getFetchOptions());
    if (!response.ok) {
      let detail = response.statusText;
      try {
        const payload = await response.json();
        detail = payload?.detail || payload?.error || detail;
      } catch {
        // Keep HTTP status text fallback.
      }
      throw new Error(`Failed to fetch users: ${detail}`);
    }

    const data = await response.json();
    return {
      items: Array.isArray(data.items) ? data.items : [],
      nextCursor: typeof data.nextCursor === "string" ? data.nextCursor : null
    };
  },

  async promoteUser(userId: string): Promise<void> {
    const response = await fetch(
      `${API_BASE}/admin/users/${encodeURIComponent(userId)}/promote`,
      getFetchOptions({ method: "POST" })
    );
    if (!response.ok) {
      let detail = response.statusText;
      try {
        const payload = await response.json();
        detail = payload?.detail || payload?.error || detail;
      } catch {
        // Keep HTTP status text fallback.
      }
      throw new Error(`Failed to promote user: ${detail}`);
    }
  },

  async activateUser(userId: string): Promise<void> {
    const response = await fetch(
      `${API_BASE}/admin/users/${encodeURIComponent(userId)}/activate`,
      getFetchOptions({ method: "POST" })
    );
    if (!response.ok) {
      let detail = response.statusText;
      try {
        const payload = await response.json();
        detail = payload?.detail || payload?.error || detail;
      } catch {
        // Keep HTTP status text fallback.
      }
      throw new Error(`Failed to activate user: ${detail}`);
    }
  },

  async deactivateUser(userId: string): Promise<void> {
    const response = await fetch(
      `${API_BASE}/admin/users/${encodeURIComponent(userId)}/deactivate`,
      getFetchOptions({ method: "POST" })
    );
    if (!response.ok) {
      let detail = response.statusText;
      try {
        const payload = await response.json();
        detail = payload?.detail || payload?.error || detail;
      } catch {
        // Keep HTTP status text fallback.
      }
      throw new Error(`Failed to deactivate user: ${detail}`);
    }
  },

  async uploadBatchArchive(file: File, mode: "csv_bundle" | "directory_bundle" = "csv_bundle"): Promise<{
    batchId: string;
    statusUrl: string;
    ingestStatus?: string;
  }> {
    const formData = new FormData();
    formData.append("archive", file);
    formData.append("mode", mode);

    const response = await fetch(`${API_BASE}/batches/upload`, {
      method: "POST",
      credentials: "include",
      body: formData
    });
    if (!response.ok) {
      let detail = response.statusText;
      try {
        const payload = await response.json();
        detail = payload?.detail || payload?.error || detail;
      } catch {
        // Keep HTTP status text fallback.
      }
      throw new Error(`Failed to upload batch archive: ${detail}`);
    }
    return response.json();
  },

  async getBatchStatus(batchId: string, limit: number = 100, offset: number = 0): Promise<BatchDetail> {
    const response = await fetch(
      `${API_BASE}/batches/${encodeURIComponent(batchId)}?limit=${limit}&offset=${offset}`,
      getFetchOptions({
        headers: {}
      })
    );
    if (!response.ok) {
      let detail = response.statusText;
      try {
        const payload = await response.json();
        detail = payload?.detail || payload?.error || detail;
      } catch {
        // Keep HTTP status text fallback.
      }
      throw new Error(`Failed to fetch batch status: ${detail}`);
    }
    const data = await response.json();
    return {
      batchId: data.batchId,
      applicationId: data.applicationId,
      status: data.status,
      ingestStatus: data.ingestStatus,
      totalItems: data.totalItems ?? 0,
      discoveredItems: data.discoveredItems ?? 0,
      queuedItems: data.queuedItems,
      processingItems: data.processingItems,
      completedItems: data.completedItems,
      failedItems: data.failedItems,
      progressPct: data.progressPct,
      errorSummary: data.errorSummary,
      items: Array.isArray(data.items) ? data.items : []
    };
  }
};
