import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { env } from "../config/env.js";
import { eventStore } from "./eventStore.js";

type SubmissionRole = "front" | "back" | "additional";

export class SubmissionImageStore {
  private rootDir = env.HISTORY_IMAGE_STORAGE_ROOT;

  async saveImage(input: {
    imageId: string;
    applicationId: string;
    role: SubmissionRole;
    imageIndex: number;
    image: Buffer;
    mimeType: string;
  }): Promise<void> {
    const appDir = join(this.rootDir, input.applicationId);
    const fullPath = join(appDir, `${input.imageId}.jpg`);
    const thumbPath = join(appDir, `${input.imageId}.thumb.jpg`);
    await mkdir(appDir, { recursive: true });
    await writeFile(fullPath, input.image);
    await writeFile(thumbPath, input.image);
    const sha256 = createHash("sha256").update(input.image).digest("hex");

    await eventStore.upsertSubmissionImage({
      imageId: input.imageId,
      applicationId: input.applicationId,
      role: input.role,
      imageIndex: input.imageIndex,
      mimeType: input.mimeType || "image/jpeg",
      byteSize: input.image.byteLength,
      storagePath: fullPath,
      thumbStoragePath: thumbPath,
      sha256
    });
  }

  async listImages(applicationId: string) {
    return eventStore.listSubmissionImages(applicationId);
  }

  async loadImage(applicationId: string, imageId: string, variant: "thumb" | "full" = "full") {
    const metadata = await eventStore.getSubmissionImage(applicationId, imageId);
    if (!metadata) return null;
    const path = variant === "thumb" ? metadata.thumbStoragePath : metadata.storagePath;
    const data = await readFile(path);
    return {
      ...metadata,
      data
    };
  }

  async pruneExpired() {
    const expired = await eventStore.listExpiredSubmissionImages(env.HISTORY_IMAGE_RETENTION_DAYS);
    if (expired.length === 0) return { deletedMetadata: 0, deletedFiles: 0 };

    let deletedFiles = 0;
    for (const item of expired) {
      const paths = [item.storagePath, item.thumbStoragePath];
      for (const path of paths) {
        try {
          await rm(path, { force: true });
          deletedFiles += 1;
        } catch {
          // Best effort.
        }
      }
      try {
        const dir = dirname(item.storagePath);
        await rm(dir, { recursive: false, force: false });
      } catch {
        // Directory may still contain files.
      }
    }

    const deletedMetadata = await eventStore.deleteSubmissionImages(expired.map((item) => item.imageId));
    return { deletedMetadata, deletedFiles };
  }
}

export const submissionImageStore = new SubmissionImageStore();
