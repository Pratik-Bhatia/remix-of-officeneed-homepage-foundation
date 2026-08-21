import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const MAX_BYTES = 10 * 1024 * 1024;

const uploadSchema = z.object({
  name: z.string().min(1).max(200),
  mimeType: z.string().max(160),
  /** Base64-encoded file contents (no data-URL prefix). */
  content: z.string().min(1),
});

/**
 * Public chat-attachment upload.
 *
 * Runs server-side so it does not depend on build-time browser env vars:
 * the storage credentials are resolved at request time.
 */
export const uploadEnquiryAttachment = createServerFn({ method: "POST" })
  .validator((data) => uploadSchema.parse(data))
  .handler(async ({ data }) => {
    const { ALLOWED_UPLOAD_TYPES, sanitizeFileName, getUploadClient } = await import("./attachments.server");

    if (!ALLOWED_UPLOAD_TYPES.has(data.mimeType)) {
      return { ok: false as const, error: "File type not allowed." };
    }

    let bytes: Buffer;
    try {
      bytes = Buffer.from(data.content, "base64");
    } catch {
      return { ok: false as const, error: "Could not read file data." };
    }

    if (!bytes.length) return { ok: false as const, error: "File is empty." };
    if (bytes.length > MAX_BYTES) return { ok: false as const, error: "File is larger than 10 MB." };

    const client = getUploadClient();
    if (!client) {
      return { ok: false as const, error: "Storage is not configured on the server." };
    }

    const safeName = sanitizeFileName(data.name);
    const random = Math.random().toString(36).slice(2, 8);
    const path = `chat-uploads/${Date.now()}-${random}-${safeName}`;

    const { error } = await client.storage
      .from("enquiry-attachments")
      .upload(path, bytes, { contentType: data.mimeType || "application/octet-stream" });

    if (error) {
      console.error("[OfficeNeed] upload failed:", error.message);
      return { ok: false as const, error: error.message };
    }

    return {
      ok: true as const,
      attachment: { path, name: data.name, mimeType: data.mimeType, size: bytes.length },
    };
  });
