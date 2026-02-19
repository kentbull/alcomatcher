import React, { useState } from "react";
import "./ApprovalControls.css";

interface ApprovalControlsProps {
  applicationId: string;
  currentStatus: string;
  onApprove: (notes: string) => Promise<void>;
  onReject: (reason: string, notes: string) => Promise<void>;
}

export const ApprovalControls: React.FC<ApprovalControlsProps> = ({
  applicationId,
  currentStatus,
  onApprove,
  onReject,
}) => {
  const [notes, setNotes] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [showApproveConfirm, setShowApproveConfirm] = useState(false);
  const [showRejectConfirm, setShowRejectConfirm] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const isAlreadyDecided = currentStatus === "approved" || currentStatus === "rejected";

  const handleApproveClick = () => {
    setShowApproveConfirm(true);
  };

  const handleRejectClick = () => {
    setShowRejectConfirm(true);
  };

  const confirmApprove = async () => {
    setIsProcessing(true);
    try {
      await onApprove(notes);
      setShowApproveConfirm(false);
      setNotes("");
    } catch (error) {
      alert("Failed to approve application. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  };

  const confirmReject = async () => {
    if (!rejectReason.trim()) {
      alert("Please provide a reason for rejection.");
      return;
    }

    setIsProcessing(true);
    try {
      await onReject(rejectReason, notes);
      setShowRejectConfirm(false);
      setNotes("");
      setRejectReason("");
    } catch (error) {
      alert("Failed to reject application. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  };

  const cancelConfirm = () => {
    setShowApproveConfirm(false);
    setShowRejectConfirm(false);
    setRejectReason("");
  };

  return (
    <div className="approval-controls">
      {isAlreadyDecided && (
        <div className="approval-notice">
          <p className="admin-text-muted">
            This application has already been {currentStatus}. You can still update the decision if needed.
          </p>
        </div>
      )}

      <div className="approval-notes-section">
        <label htmlFor="reviewer-notes" className="approval-label">
          Reviewer Notes (Optional)
        </label>
        <textarea
          id="reviewer-notes"
          className="approval-textarea"
          placeholder="Add any notes about this decision..."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={4}
          disabled={isProcessing}
        />
      </div>

      <div className="approval-actions">
        <button
          className="btn-admin btn-admin--primary approval-btn"
          onClick={handleApproveClick}
          disabled={isProcessing}
        >
          ✓ Approve Application
        </button>
        <button
          className="btn-admin btn-admin--danger approval-btn"
          onClick={handleRejectClick}
          disabled={isProcessing}
        >
          ✗ Reject Application
        </button>
      </div>

      {/* Approve Confirmation Modal */}
      {showApproveConfirm && (
        <div className="approval-modal-overlay" onClick={cancelConfirm}>
          <div className="approval-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="approval-modal-title">Confirm Approval</h3>
            <p className="approval-modal-text">
              Are you sure you want to approve this application?
            </p>
            {notes && (
              <div className="approval-modal-notes">
                <strong>Notes:</strong> {notes}
              </div>
            )}
            <div className="approval-modal-actions">
              <button
                className="btn-admin btn-admin--secondary"
                onClick={cancelConfirm}
                disabled={isProcessing}
              >
                Cancel
              </button>
              <button
                className="btn-admin btn-admin--primary"
                onClick={confirmApprove}
                disabled={isProcessing}
              >
                {isProcessing ? "Approving..." : "Confirm Approval"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Confirmation Modal */}
      {showRejectConfirm && (
        <div className="approval-modal-overlay" onClick={cancelConfirm}>
          <div className="approval-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="approval-modal-title">Confirm Rejection</h3>
            <p className="approval-modal-text">
              Are you sure you want to reject this application?
            </p>
            <div className="approval-modal-form">
              <label htmlFor="reject-reason" className="approval-label">
                Reason for Rejection (Required)
              </label>
              <textarea
                id="reject-reason"
                className="approval-textarea"
                placeholder="Provide a clear reason for rejection..."
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                rows={3}
                disabled={isProcessing}
                autoFocus
              />
            </div>
            {notes && (
              <div className="approval-modal-notes">
                <strong>Additional Notes:</strong> {notes}
              </div>
            )}
            <div className="approval-modal-actions">
              <button
                className="btn-admin btn-admin--secondary"
                onClick={cancelConfirm}
                disabled={isProcessing}
              >
                Cancel
              </button>
              <button
                className="btn-admin btn-admin--danger"
                onClick={confirmReject}
                disabled={isProcessing || !rejectReason.trim()}
              >
                {isProcessing ? "Rejecting..." : "Confirm Rejection"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
