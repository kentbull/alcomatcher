import React from "react";
import type { ApplicationStatus, SyncState } from "../../types/admin";
import "./FilterBar.css";

interface FilterBarProps {
  statusFilter?: ApplicationStatus | "all";
  syncStateFilter?: SyncState | "all";
  searchQuery?: string;
  onStatusFilterChange: (status: ApplicationStatus | "all") => void;
  onSyncStateFilterChange: (syncState: SyncState | "all") => void;
  onSearchChange: (query: string) => void;
}

export const FilterBar: React.FC<FilterBarProps> = ({
  statusFilter = "all",
  syncStateFilter = "all",
  searchQuery = "",
  onStatusFilterChange,
  onSyncStateFilterChange,
  onSearchChange,
}) => {
  return (
    <div className="filter-bar">
      <div className="filter-group">
        <label htmlFor="status-filter" className="filter-label">
          Status
        </label>
        <select
          id="status-filter"
          className="filter-select"
          value={statusFilter}
          onChange={(e) => onStatusFilterChange(e.target.value as ApplicationStatus | "all")}
        >
          <option value="all">All Statuses</option>
          <option value="needs_review">Needs Review</option>
          <option value="matched">Matched</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="processing">Processing</option>
          <option value="created">Created</option>
        </select>
      </div>

      <div className="filter-group">
        <label htmlFor="sync-state-filter" className="filter-label">
          Sync State
        </label>
        <select
          id="sync-state-filter"
          className="filter-select"
          value={syncStateFilter}
          onChange={(e) => onSyncStateFilterChange(e.target.value as SyncState | "all")}
        >
          <option value="all">All States</option>
          <option value="synced">Synced</option>
          <option value="pending">Pending Sync</option>
          <option value="sync_failed">Sync Failed</option>
        </select>
      </div>

      <div className="filter-group filter-group--search">
        <label htmlFor="search-input" className="filter-label">
          Search
        </label>
        <input
          id="search-input"
          type="text"
          className="filter-input"
          placeholder="Application ID or brand name..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
        />
      </div>
    </div>
  );
};
