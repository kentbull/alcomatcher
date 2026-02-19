import React, { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import "./AdminNavbar.css";

interface AdminNavbarProps {
  isAuthenticated: boolean;
  userEmail?: string;
  userRole?: string;
  onSignOut: () => void;
}

export const AdminNavbar: React.FC<AdminNavbarProps> = ({
  isAuthenticated,
  userEmail,
  userRole,
  onSignOut,
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const isManager = userRole === "compliance_manager";
  const isActive = (path: string) => location.pathname === path;

  return (
    <nav className="admin-navbar">
      <div className="admin-navbar-content">
        <div className="admin-navbar-left">
          <div className="admin-navbar-logo" onClick={() => navigate("/admin")}>
            <span className="admin-navbar-logo-text">AlcoMatcher Admin</span>
          </div>
          {isAuthenticated && isManager && (
            <div className="admin-navbar-links">
              <button
                className={`admin-nav-link ${isActive("/admin") ? "active" : ""}`}
                onClick={() => navigate("/admin")}
              >
                Dashboard
              </button>
              <button
                className={`admin-nav-link ${isActive("/admin/applications") ? "active" : ""}`}
                onClick={() => navigate("/admin/applications")}
              >
                Applications
              </button>
            </div>
          )}
        </div>

        <div className="admin-navbar-right">
          {isAuthenticated && isManager ? (
            <div className="admin-user-menu">
              <button
                className="admin-user-button"
                onClick={() => setDropdownOpen(!dropdownOpen)}
              >
                <span className="admin-user-email">{userEmail}</span>
                <span className="admin-user-arrow">▼</span>
              </button>
              {dropdownOpen && (
                <div className="admin-dropdown">
                  <div className="admin-dropdown-item admin-dropdown-header">
                    {userEmail}
                  </div>
                  <button
                    className="admin-dropdown-item admin-dropdown-button"
                    onClick={() => {
                      setDropdownOpen(false);
                      onSignOut();
                    }}
                  >
                    Sign Out
                  </button>
                </div>
              )}
            </div>
          ) : (
            <button
              className="admin-signin-button"
              onClick={() => navigate("/login")}
            >
              Sign In
            </button>
          )}
        </div>
      </div>
    </nav>
  );
};
