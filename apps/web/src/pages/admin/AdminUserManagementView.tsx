import React, { useEffect, useState } from "react";
import { adminApi } from "../../services/adminApi";
import type { AdminUser, AdminUserRole } from "../../types/admin";
import "./AdminUserManagementView.css";

type TriStateFilter = "all" | "true" | "false";

const DEFAULT_LIMIT = 200;

export const AdminUserManagementView: React.FC = () => {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [pendingActionUserId, setPendingActionUserId] = useState<string | null>(null);

  const [roleFilter, setRoleFilter] = useState<AdminUserRole | "all">("all");
  const [verifiedFilter, setVerifiedFilter] = useState<TriStateFilter>("all");
  const [activeFilter, setActiveFilter] = useState<TriStateFilter>("all");

  useEffect(() => {
    void loadUsers();
  }, [roleFilter, verifiedFilter, activeFilter]);

  const parseTriState = (value: TriStateFilter): boolean | undefined => {
    if (value === "all") return undefined;
    return value === "true";
  };

  const loadUsers = async (clearStatus: boolean = true) => {
    try {
      setLoading(true);
      setError(null);
      if (clearStatus) {
        setStatusMessage(null);
      }

      const response = await adminApi.getUsers({
        limit: DEFAULT_LIMIT,
        role: roleFilter === "all" ? undefined : roleFilter,
        verified: parseTriState(verifiedFilter),
        active: parseTriState(activeFilter)
      });

      setUsers(response.items);
      if (response.nextCursor) {
        setStatusMessage(`Showing first ${response.items.length} users. Refine filters to narrow results.`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load users");
    } finally {
      setLoading(false);
    }
  };

  const runAction = async (userId: string, action: "promote" | "activate" | "deactivate") => {
    try {
      setPendingActionUserId(userId);
      setError(null);
      setStatusMessage(`Applying ${action}...`);

      if (action === "promote") {
        await adminApi.promoteUser(userId);
      } else if (action === "activate") {
        await adminApi.activateUser(userId);
      } else {
        await adminApi.deactivateUser(userId);
      }

      setStatusMessage(`User ${action} action completed.`);
      await loadUsers(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to ${action} user`);
    } finally {
      setPendingActionUserId(null);
    }
  };

  return (
    <div className="admin-user-management-view">
      <div className="admin-user-management-header">
        <h1 className="admin-heading-1">User Management</h1>
        <button className="btn-admin btn-admin--secondary" onClick={() => void loadUsers()} disabled={loading}>
          ↻ Refresh
        </button>
      </div>

      <div className="admin-card admin-user-filters">
        <label>
          Role
          <select
            value={roleFilter}
            onChange={(event) => setRoleFilter(event.target.value as AdminUserRole | "all")}
            disabled={loading}
          >
            <option value="all">All Roles</option>
            <option value="compliance_officer">Compliance Officer</option>
            <option value="compliance_manager">Compliance Manager</option>
          </select>
        </label>

        <label>
          Verified
          <select
            value={verifiedFilter}
            onChange={(event) => setVerifiedFilter(event.target.value as TriStateFilter)}
            disabled={loading}
          >
            <option value="all">Verified + Unverified</option>
            <option value="true">Verified</option>
            <option value="false">Unverified</option>
          </select>
        </label>

        <label>
          Active
          <select
            value={activeFilter}
            onChange={(event) => setActiveFilter(event.target.value as TriStateFilter)}
            disabled={loading}
          >
            <option value="all">Active + Inactive</option>
            <option value="true">Active</option>
            <option value="false">Inactive</option>
          </select>
        </label>
      </div>

      {error && (
        <div className="admin-user-management-feedback admin-user-management-feedback--error">
          {error}
        </div>
      )}

      {!error && statusMessage && (
        <div className="admin-user-management-feedback admin-user-management-feedback--info">
          {statusMessage}
        </div>
      )}

      <div className="admin-card">
        {loading ? (
          <div className="admin-user-management-loading">Loading users...</div>
        ) : users.length === 0 ? (
          <div className="admin-user-management-empty">No users found for this filter set.</div>
        ) : (
          <div className="admin-user-management-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Verified</th>
                  <th>Active</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => {
                  const isPending = pendingActionUserId === user.userId;
                  return (
                    <tr key={user.userId}>
                      <td>{user.email}</td>
                      <td>
                        <span className="status-badge status-badge--default">{user.role}</span>
                      </td>
                      <td>{user.emailVerifiedAt ? "Yes" : "No"}</td>
                      <td>{user.isActive ? "Yes" : "No"}</td>
                      <td>{new Date(user.createdAt).toLocaleString()}</td>
                      <td className="admin-user-actions">
                        {user.role === "compliance_officer" && (
                          <button
                            className="btn-admin btn-admin--secondary btn-admin--small"
                            onClick={() => void runAction(user.userId, "promote")}
                            disabled={isPending || loading}
                          >
                            Promote
                          </button>
                        )}

                        {user.isActive ? (
                          <button
                            className="btn-admin btn-admin--danger btn-admin--small"
                            onClick={() => void runAction(user.userId, "deactivate")}
                            disabled={isPending || loading}
                          >
                            Deactivate
                          </button>
                        ) : (
                          <button
                            className="btn-admin btn-admin--primary btn-admin--small"
                            onClick={() => void runAction(user.userId, "activate")}
                            disabled={isPending || loading}
                          >
                            Activate
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
