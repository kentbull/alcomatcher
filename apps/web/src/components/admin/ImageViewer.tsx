import React, { useState } from "react";
import type { SubmissionImage } from "../../types/admin";
import "./ImageViewer.css";

interface ImageViewerProps {
  applicationId: string;
  images: SubmissionImage[];
  onRescan?: (imageId: string, reason: string) => void;
}

export const ImageViewer: React.FC<ImageViewerProps> = ({
  applicationId,
  images,
  onRescan,
}) => {
  const [selectedImage, setSelectedImage] = useState<SubmissionImage | null>(null);
  const [fullscreenImage, setFullscreenImage] = useState<string | null>(null);

  if (images.length === 0) {
    return (
      <div className="image-viewer-empty">
        <p>No images available for this application.</p>
      </div>
    );
  }

  const handleImageClick = (image: SubmissionImage) => {
    setSelectedImage(image);
    setFullscreenImage(getImageUrl(applicationId, image.imageId, "full"));
  };

  const closeFullscreen = () => {
    setFullscreenImage(null);
    setSelectedImage(null);
  };

  return (
    <div className="image-viewer">
      <div className="image-grid">
        {images.map((image) => (
          <div key={image.imageId} className="image-card">
            <div className="image-header">
              <h4 className="image-title">
                {formatRole(image.role)} Label
                {image.imageIndex > 0 && ` (${image.imageIndex + 1})`}
              </h4>
              {image.qualityStatus && (
                <span
                  className={`image-quality image-quality--${image.qualityStatus}`}
                >
                  {image.qualityStatus === "good" ? "✓ Good" : "⚠ Reshoot"}
                </span>
              )}
            </div>

            <div className="image-preview" onClick={() => handleImageClick(image)}>
              <img
                src={getImageUrl(applicationId, image.imageId, "thumb")}
                alt={`${image.role} label`}
                className="image-thumbnail"
              />
              <div className="image-overlay">
                <span className="image-overlay-text">🔍 View Full Size</span>
              </div>
            </div>

            <div className="image-metadata">
              {image.ocrProvider && (
                <div className="image-meta-item">
                  <span className="image-meta-label">OCR:</span>{" "}
                  <span className="image-meta-value">{image.ocrProvider}</span>
                </div>
              )}
              {image.ocrConfidence !== undefined && (
                <div className="image-meta-item">
                  <span className="image-meta-label">Confidence:</span>{" "}
                  <span className="image-meta-value">
                    {Math.round(image.ocrConfidence * 100)}%
                  </span>
                </div>
              )}
              {image.qualityIssues && image.qualityIssues.length > 0 && (
                <div className="image-meta-item">
                  <span className="image-meta-label">Issues:</span>{" "}
                  <span className="image-meta-value">
                    {image.qualityIssues.join(", ")}
                  </span>
                </div>
              )}
            </div>

            {onRescan && (
              <button
                className="btn-admin btn-admin--secondary btn-admin--small image-rescan-btn"
                onClick={() => onRescan(image.imageId, "manual_review")}
              >
                🔄 Re-scan Image
              </button>
            )}
          </div>
        ))}
      </div>

      {fullscreenImage && (
        <div className="image-fullscreen" onClick={closeFullscreen}>
          <div className="image-fullscreen-content" onClick={(e) => e.stopPropagation()}>
            <button className="image-fullscreen-close" onClick={closeFullscreen}>
              ✕
            </button>
            <img
              src={fullscreenImage}
              alt={`${selectedImage?.role} label full size`}
              className="image-fullscreen-img"
            />
            {selectedImage && (
              <div className="image-fullscreen-info">
                <h3>
                  {formatRole(selectedImage.role)} Label
                  {selectedImage.imageIndex > 0 && ` (${selectedImage.imageIndex + 1})`}
                </h3>
                {selectedImage.ocrProvider && (
                  <p>OCR: {selectedImage.ocrProvider}</p>
                )}
                {selectedImage.ocrConfidence !== undefined && (
                  <p>Confidence: {Math.round(selectedImage.ocrConfidence * 100)}%</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

function getImageUrl(applicationId: string, imageId: string, variant: "thumb" | "full"): string {
  return `/api/history/${applicationId}/images/${imageId}?variant=${variant}`;
}

function formatRole(role: string): string {
  return role.charAt(0).toUpperCase() + role.slice(1);
}
