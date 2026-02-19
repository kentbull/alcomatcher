import React, { useEffect, useState, useCallback } from "react";
import { adminApi } from "../../services/adminApi";
import { FilterBar } from "../../components/admin/FilterBar";
import { ApplicationTable } from "../../components/admin/ApplicationTable";
import { PaginationControls } from "../../components/admin/PaginationControls";
import type { ApplicationQueueItem, ApplicationStatus, SyncState } from "../../types/admin";
import "./AdminListView.css";

const ITEMS_PER_PAGE = 50;  // Changed from 20 to 50

export const AdminListView: React.FC = () => {
  const [applications, setApplications] = useState<ApplicationQueueItem[]>([]);
  const [totalCount, setTotalCount] = useState(0);  // NEW - server total
  const [filteredApplications, setFilteredApplications] = useState<ApplicationQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter state
  const [statusFilter, setStatusFilter] = useState<ApplicationStatus | "all">("all");
  const [syncStateFilter, setSyncStateFilter] = useState<SyncState | "all">("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Sorting state
  const [sortBy, setSortBy] = useState<string>("updatedAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);

  // Load applications - refetch when page or status filter changes
  useEffect(() => {
    loadApplications();
  }, [currentPage, statusFilter]);

  useEffect(() => {
    let stream: EventSource | null = null;
    let disposed = false;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const triggerReload = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => { void loadApplications(); }, 1000);
    };

    const connect = async () => {
      try {
        const ticket = await adminApi.getStreamTicket();
        if (disposed) return;
        const url = `/api/events/stream?scope=admin&ticket=${encodeURIComponent(ticket)}`;
        stream = new EventSource(url);
        stream.addEventListener("application.status_changed", triggerReload);
      } catch {
        // SSE is best-effort
      }
    };

    void connect();
    return () => {
      disposed = true;
      if (debounceTimer) clearTimeout(debounceTimer);
      stream?.close();
    };
  }, []); // mount-only; loadApplications is called imperatively

  const loadApplications = async () => {
    try {
      setLoading(true);
      setError(null);

      // Calculate offset for current page
      const offset = (currentPage - 1) * ITEMS_PER_PAGE;

      // Fetch from API with server pagination and status filter
      const result = await adminApi.getQueue({
        status: statusFilter === "all" ? undefined : statusFilter as ApplicationStatus,
        limit: ITEMS_PER_PAGE,
        offset
      });

      setApplications(result.items);
      setTotalCount(result.totalCount);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load applications");
    } finally {
      setLoading(false);
    }
  };

  // Apply client-side filters (syncState and search) and sorting
  // Status filter is already applied server-side
  useEffect(() => {
    let result = [...applications];

    // Apply sync state filter (client-side)
    if (syncStateFilter !== "all") {
      result = result.filter((app) => app.syncState === syncStateFilter);
    }

    // Apply search filter (client-side)
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (app) =>
          app.applicationId.toLowerCase().includes(query) ||
          (app.brandName && app.brandName.toLowerCase().includes(query))
      );
    }

    // Apply sorting
    result.sort((a, b) => {
      let aVal: any = a[sortBy as keyof ApplicationQueueItem];
      let bVal: any = b[sortBy as keyof ApplicationQueueItem];

      // Handle undefined/null values
      if (aVal === undefined || aVal === null) aVal = "";
      if (bVal === undefined || bVal === null) bVal = "";

      // Convert to comparable values
      if (sortBy === "updatedAt") {
        aVal = new Date(aVal).getTime();
        bVal = new Date(bVal).getTime();
      } else if (sortBy === "confidence") {
        aVal = Number(aVal);
        bVal = Number(bVal);
      } else {
        aVal = String(aVal).toLowerCase();
        bVal = String(bVal).toLowerCase();
      }

      if (sortOrder === "asc") {
        return aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
      } else {
        return aVal < bVal ? 1 : aVal > bVal ? -1 : 0;
      }
    });

    setFilteredApplications(result);
  }, [applications, syncStateFilter, searchQuery, sortBy, sortOrder]);

  const handleSort = useCallback((field: string) => {
    setSortBy((prev) => {
      if (prev === field) {
        // Toggle sort order if same field
        setSortOrder((order) => (order === "asc" ? "desc" : "asc"));
        return field;
      } else {
        // Default to descending for new field
        setSortOrder("desc");
        return field;
      }
    });
  }, []);

  // Handler to reset to page 1 when status filter changes
  const handleStatusFilterChange = useCallback((status: ApplicationStatus | "all") => {
    setStatusFilter(status);
    setCurrentPage(1);
  }, []);

  // No need for client-side pagination - we're using server pagination
  // Display the filtered/sorted applications directly
  const paginatedApplications = filteredApplications;

  // Calculate total pages from server's totalCount
  // Note: This is the total BEFORE client-side filters (syncState, search)
  const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE);

  if (loading) {
    return (
      <div className="admin-list-view">
        <div className="admin-list-loading">Loading applications...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="admin-list-view">
        <div className="admin-list-error">
          <p>Error: {error}</p>
          <button className="btn-admin btn-admin--primary" onClick={loadApplications}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-list-view">
      <div className="admin-list-header">
        <h1 className="admin-heading-1">Label Applications</h1>
        <button className="btn-admin btn-admin--secondary" onClick={loadApplications}>
          ↻ Refresh
        </button>
      </div>

      <FilterBar
        statusFilter={statusFilter}
        syncStateFilter={syncStateFilter}
        searchQuery={searchQuery}
        onStatusFilterChange={handleStatusFilterChange}
        onSyncStateFilterChange={setSyncStateFilter}
        onSearchChange={setSearchQuery}
      />

      <div className="admin-card">
        <ApplicationTable
          applications={paginatedApplications}
          sortBy={sortBy}
          sortOrder={sortOrder}
          onSort={handleSort}
        />

        {filteredApplications.length > 0 && (
          <PaginationControls
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={filteredApplications.length}
            itemsPerPage={ITEMS_PER_PAGE}
            onPageChange={setCurrentPage}
          />
        )}
      </div>
    </div>
  );
};
