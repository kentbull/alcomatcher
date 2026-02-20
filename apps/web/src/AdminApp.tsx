import React, { useEffect, useState, Suspense, lazy } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AdminNavbar } from "./components/admin/AdminNavbar";
import { ErrorBoundary } from "./components/admin/ErrorBoundary";
import "./styles.css";

// Code splitting: Lazy load admin pages
const AdminDashboard = lazy(() => import("./pages/admin/AdminDashboard").then(m => ({ default: m.AdminDashboard })));
const AdminListView = lazy(() => import("./pages/admin/AdminListView").then(m => ({ default: m.AdminListView })));
const AdminDetailView = lazy(() => import("./pages/admin/AdminDetailView").then(m => ({ default: m.AdminDetailView })));
const AdminBatchUploadView = lazy(() => import("./pages/admin/AdminBatchUploadView").then(m => ({ default: m.AdminBatchUploadView })));
const AdminUserManagementView = lazy(() => import("./pages/admin/AdminUserManagementView").then(m => ({ default: m.AdminUserManagementView })));

interface AuthUser {
  userId: string;
  email: string;
  role: string;
}

export const AdminApp: React.FC = () => {
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      // Check auth with server (cookie is sent automatically)
      const response = await fetch("/api/auth/me", {
        credentials: "include", // Ensure cookies are sent
      });

      if (response.ok) {
        const data = await response.json();
        setAuthUser(data.user);
      } else {
        setAuthUser(null);
      }
    } catch (error) {
      console.error("Auth check failed:", error);
      setAuthUser(null);
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });
    } catch (error) {
      console.error("Logout failed:", error);
    }
    setAuthUser(null);
    window.location.href = "/";
  };

  if (loading) {
    return (
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        background: "var(--admin-bg)",
        color: "var(--text-primary)",
      }}>
        Loading...
      </div>
    );
  }

  const isAuthenticated = authUser !== null;
  const isManager = authUser?.role === "compliance_manager";

  return (
    <BrowserRouter>
      <ErrorBoundary>
        <div>
          <AdminNavbar
            isAuthenticated={isAuthenticated}
            userEmail={authUser?.email}
            userRole={authUser?.role}
            onSignOut={handleSignOut}
          />

          <Suspense
            fallback={
              <div style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                minHeight: "50vh",
                color: "var(--text-primary)",
                fontSize: "1.1rem",
              }}>
                Loading...
              </div>
            }
          >
            <Routes>
          <Route
            path="/admin"
            element={
              isAuthenticated && isManager ? (
                <AdminDashboard />
              ) : (
                <Navigate to="/login" replace />
              )
            }
          />
          <Route
            path="/admin/applications"
            element={
              isAuthenticated && isManager ? (
                <AdminListView />
              ) : (
                <Navigate to="/login" replace />
              )
            }
          />
          <Route
            path="/admin/applications/:id"
            element={
              isAuthenticated && isManager ? (
                <AdminDetailView />
              ) : (
                <Navigate to="/login" replace />
              )
            }
          />
          <Route
            path="/admin/batches"
            element={
              isAuthenticated && isManager ? (
                <AdminBatchUploadView />
              ) : (
                <Navigate to="/login" replace />
              )
            }
          />
          <Route
            path="/admin/users"
            element={
              isAuthenticated && isManager ? (
                <AdminUserManagementView />
              ) : (
                <Navigate to="/login" replace />
              )
            }
          />
          <Route
            path="/login"
            element={
              <div style={{
                padding: "calc(60px + env(safe-area-inset-top, 0px) + 2rem) max(env(safe-area-inset-right, 0px), 1rem) max(env(safe-area-inset-bottom, 0px), 2rem) max(env(safe-area-inset-left, 0px), 1rem)",
                background: "var(--admin-bg)",
                minHeight: "100vh",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}>
                <div className="admin-card" style={{
                  width: "100%",
                  maxWidth: "420px",
                  margin: "0 auto",
                }}>
                  <h1 className="admin-heading-1" style={{
                    textAlign: "center",
                    marginBottom: "1rem"
                  }}>Sign In</h1>
                  <p className="admin-text-muted" style={{
                    textAlign: "center",
                    marginBottom: "2rem",
                    lineHeight: "1.6"
                  }}>
                    Authentication is required to access the admin dashboard.
                  </p>
                  <div style={{
                    padding: "1.5rem",
                    background: "rgba(192, 138, 60, 0.1)",
                    border: "1px solid rgba(192, 138, 60, 0.3)",
                    borderRadius: "8px",
                    textAlign: "center"
                  }}>
                    <p className="admin-text-secondary" style={{ margin: "0 0 1rem 0" }}>
                      Please sign in through the main application to access the admin panel.
                    </p>
                    <a
                      href="/"
                      className="btn-admin btn-admin--primary"
                      style={{
                        textDecoration: "none",
                        display: "inline-flex"
                      }}
                    >
                      Go to Home
                    </a>
                  </div>
                </div>
              </div>
            }
          />
          <Route path="*" element={<Navigate to="/admin" replace />} />
            </Routes>
          </Suspense>
        </div>
      </ErrorBoundary>
    </BrowserRouter>
  );
};
