import React, { useEffect, useState, Suspense, lazy } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AdminNavbar } from "./components/admin/AdminNavbar";
import { ErrorBoundary } from "./components/admin/ErrorBoundary";
import "./styles.css";

// Code splitting: Lazy load admin pages
const AdminDashboard = lazy(() => import("./pages/admin/AdminDashboard").then(m => ({ default: m.AdminDashboard })));
const AdminListView = lazy(() => import("./pages/admin/AdminListView").then(m => ({ default: m.AdminListView })));
const AdminDetailView = lazy(() => import("./pages/admin/AdminDetailView").then(m => ({ default: m.AdminDetailView })));

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
      const token = localStorage.getItem("alcomatcher_token");
      if (!token) {
        setAuthUser(null);
        setLoading(false);
        return;
      }

      // Verify token with server
      const response = await fetch("/api/auth/me", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setAuthUser(data.user);
      } else {
        localStorage.removeItem("alcomatcher_token");
        setAuthUser(null);
      }
    } catch (error) {
      console.error("Auth check failed:", error);
      setAuthUser(null);
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = () => {
    localStorage.removeItem("alcomatcher_token");
    setAuthUser(null);
    window.location.href = "/login";
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
        <div style={{ minHeight: "100vh" }}>
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
            path="/login"
            element={
              <div style={{
                padding: "calc(60px + 2rem) 2rem 2rem",
                background: "var(--admin-bg)",
                minHeight: "100vh",
                color: "var(--text-primary)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}>
                <div className="admin-card" style={{ maxWidth: "400px" }}>
                  <h1 className="admin-heading-1">Sign In</h1>
                  <p className="admin-text-muted">
                    Login page to be implemented. For now, this is a placeholder.
                  </p>
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
