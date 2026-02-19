import React, { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AdminNavbar } from "./components/admin/AdminNavbar";
import { AdminDashboard } from "./pages/admin/AdminDashboard";
import "./styles.css";

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
      <div style={{ minHeight: "100vh" }}>
        <AdminNavbar
          isAuthenticated={isAuthenticated}
          userEmail={authUser?.email}
          userRole={authUser?.role}
          onSignOut={handleSignOut}
        />

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
                <div style={{
                  padding: "calc(60px + 2rem) 2rem 2rem",
                  background: "var(--admin-bg)",
                  minHeight: "100vh",
                  color: "var(--text-primary)",
                }}>
                  Applications list (coming soon in Phase 2)
                </div>
              ) : (
                <Navigate to="/login" replace />
              )
            }
          />
          <Route
            path="/admin/applications/:id"
            element={
              isAuthenticated && isManager ? (
                <div style={{
                  padding: "calc(60px + 2rem) 2rem 2rem",
                  background: "var(--admin-bg)",
                  minHeight: "100vh",
                  color: "var(--text-primary)",
                }}>
                  Application detail (coming soon in Phase 3)
                </div>
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
      </div>
    </BrowserRouter>
  );
};
