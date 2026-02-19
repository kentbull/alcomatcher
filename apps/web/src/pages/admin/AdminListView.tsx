import React, { useEffect, useState, useCallback } from "react";
import { adminApi } from "../../services/adminApi";
import { FilterBar } from "../../components/admin/FilterBar";
import { ApplicationTable } from "../../components/admin/ApplicationTable";
import { PaginationControls } from "../../components/admin/PaginationControls";
import type { ApplicationQueueItem, ApplicationStatus, SyncState } from "../../types/admin";
import "./AdminListView.css";

const ITEMS_PER_PAGE = 20;

export const AdminListView: React.FC = () => {
  const [applications, setApplications] = useState<ApplicationQueueItem[]>([]);
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

  // Load applications
  useEffect(() => {
    loadApplications();
  }, []);

  const loadApplications = async () => {
    try {
      setLoading(true);
      setError(null);
      const queue = await adminApi.getQueue();
      setApplications(queue);
      setFilteredApplications(queue);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load applications");
    } finally {
      setLoading(false);
    }
  };

  // Apply filters and sorting whenever dependencies change
  useEffect(() => {
    let result = [...applications];

    // Apply status filter
    if (statusFilter !== "all") {
      result = result.filter((app) => app.status === statusFilter);
    }

    // Apply sync state filter
    if (syncStateFilter !== "all") {
      result = result.filter((app) => app.syncState === syncStateFilter);
    }

    // Apply search filter
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
    setCurrentPage(1); // Reset to first page when filters change
  }, [applications, statusFilter, syncStateFilter, searchQuery, sortBy, sortOrder]);

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

  // Paginate results
  const totalPages = Math.ceil(filteredApplications.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const paginatedApplications = filteredApplications.slice(startIndex, endIndex);

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
        onStatusFilterChange={setStatusFilter}
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
