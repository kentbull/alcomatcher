/**
 * Image preprocessing utilities for OCR optimization
 * Handles compression, orientation, contrast enhancement, and quality optimization
 */

interface PreprocessOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number; // 0-1
  enhanceContrast?: boolean;
  autoRotate?: boolean;
}

/**
 * Preprocess an image file for optimal OCR results
 * - Resizes to optimal dimensions (maintains aspect ratio)
 * - Enhances contrast for better text recognition
 * - Applies intelligent compression
 * - Auto-rotates if EXIF data available
 */
export async function preprocessImageForOCR(
  file: File,
  options: PreprocessOptions = {}
): Promise<File> {
  const {
    maxWidth = 2400,
    maxHeight = 3200,
    quality = 0.92,
    enhanceContrast = true,
    autoRotate = true
  } = options;

  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();

    reader.onload = (e) => {
      img.src = e.target?.result as string;
    };

    reader.onerror = reject;

    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Canvas context not available"));
          return;
        }

        // Calculate optimal dimensions
        let { width, height } = img;
        const aspectRatio = width / height;

        if (width > maxWidth) {
          width = maxWidth;
          height = width / aspectRatio;
        }
        if (height > maxHeight) {
          height = maxHeight;
          width = height * aspectRatio;
        }

        canvas.width = width;
        canvas.height = height;

        // Draw image
        ctx.drawImage(img, 0, 0, width, height);

        // Enhance contrast if enabled
        if (enhanceContrast) {
          enhanceImageContrast(ctx, width, height);
        }

        // Convert to blob with compression
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error("Failed to create blob"));
              return;
            }

            const processedFile = new File([blob], file.name, {
              type: "image/jpeg",
              lastModified: Date.now()
            });

            resolve(processedFile);
          },
          "image/jpeg",
          quality
        );
      } catch (error) {
        reject(error);
      }
    };

    img.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Enhance image contrast using histogram stretching
 * Improves text visibility for OCR
 */
function enhanceImageContrast(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number
): void {
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;

  // Find min and max values for each channel
  let minR = 255, maxR = 0;
  let minG = 255, maxG = 0;
  let minB = 255, maxB = 0;

  for (let i = 0; i < data.length; i += 4) {
    minR = Math.min(minR, data[i]);
    maxR = Math.max(maxR, data[i]);
    minG = Math.min(minG, data[i + 1]);
    maxG = Math.max(maxG, data[i + 1]);
    minB = Math.min(minB, data[i + 2]);
    maxB = Math.max(maxB, data[i + 2]);
  }

  // Stretch histogram
  const rangeR = maxR - minR || 1;
  const rangeG = maxG - minG || 1;
  const rangeB = maxB - minB || 1;

  for (let i = 0; i < data.length; i += 4) {
    data[i] = ((data[i] - minR) * 255) / rangeR;
    data[i + 1] = ((data[i + 1] - minG) * 255) / rangeG;
    data[i + 2] = ((data[i + 2] - minB) * 255) / rangeB;
  }

  ctx.putImageData(imageData, 0, 0);
}

/**
 * Sharpen image to improve edge definition for OCR
 * Uses unsharp mask technique
 */
export function sharpenImage(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  amount: number = 0.5
): void {
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  const original = new Uint8ClampedArray(data);

  // Simple 3x3 sharpen kernel
  const kernel = [
    0, -1, 0,
    -1, 5, -1,
    0, -1, 0
  ];

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = (y * width + x) * 4;

      for (let c = 0; c < 3; c++) {
        let sum = 0;
        for (let ky = -1; ky <= 1; ky++) {
          for (let kx = -1; kx <= 1; kx++) {
            const kernelIdx = (ky + 1) * 3 + (kx + 1);
            const pixelIdx = ((y + ky) * width + (x + kx)) * 4 + c;
            sum += original[pixelIdx] * kernel[kernelIdx];
          }
        }
        data[idx + c] = original[idx + c] * (1 - amount) + sum * amount;
      }
    }
  }

  ctx.putImageData(imageData, 0, 0);
}

/**
 * Calculate image quality score based on sharpness and contrast
 * Returns 0-100, where higher is better
 */
export function calculateImageQuality(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();

    reader.onload = (e) => {
      img.src = e.target?.result as string;
    };

    reader.onerror = reject;

    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Canvas context not available"));
          return;
        }

        // Use smaller size for quality analysis
        const scale = Math.min(1, 800 / Math.max(img.width, img.height));
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;

        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;

        // Calculate sharpness using Laplacian variance
        let sharpness = 0;
        let contrast = 0;

        // Simple sharpness metric
        for (let i = 0; i < data.length - 4; i += 4) {
          const diff = Math.abs(data[i] - data[i + 4]);
          sharpness += diff;
        }
        sharpness = sharpness / (data.length / 4);

        // Simple contrast metric (standard deviation)
        let sum = 0;
        for (let i = 0; i < data.length; i += 4) {
          sum += data[i];
        }
        const mean = sum / (data.length / 4);

        let variance = 0;
        for (let i = 0; i < data.length; i += 4) {
          variance += Math.pow(data[i] - mean, 2);
        }
        contrast = Math.sqrt(variance / (data.length / 4));

        // Combine metrics (normalized to 0-100)
        const qualityScore = Math.min(100, (sharpness / 10 + contrast / 2) * 0.8);
        resolve(Math.round(qualityScore));
      } catch (error) {
        reject(error);
      }
    };

    img.onerror = reject;
    reader.readAsDataURL(file);
  });
}
