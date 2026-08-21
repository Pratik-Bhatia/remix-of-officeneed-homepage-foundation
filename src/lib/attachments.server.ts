import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const BUCKET = "enquiry-attachments";
const MAX_BYTES = 10 * 1024 * 1024;
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
  "text/plain",
]);

export interface AttachmentInput {
  path: string;
  name: string;
  mimeType?: string | undefined;
  size?: number | undefined;
}

export interface StoredAttachment {
  fileName: string;
  storagePath: string;
  mimeType: string;
  fileSize: number;
  isImage: boolean;
  /** Raw bytes, used for PDF embedding and email attachments. */
  bytes?: Buffer;
  /** Detected image format for jsPDF (`PNG` | `JPEG` | `WEBP`). */
  imageFormat?: "PNG" | "JPEG" | "WEBP";
  signedUrl?: string;
  status: "stored" | "failed";
}

export function sanitizeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "attachment";
  const cleaned = base.replace(/[^a-zA-Z0-9.\-_]/g, "_").replace(/_{2,}/g, "_");
  return cleaned.slice(0, 120) || "attachment";
}

/** Sniff real file type from magic bytes; never trust the client MIME alone. */
function sniffImageFormat(bytes: Buffer): "PNG" | "JPEG" | "WEBP" | null {
  if (bytes.length < 12) return null;
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "PNG";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "JPEG";
  if (bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP") {
    return "WEBP";
  }
  return null;
}

/** Upload allowlist shared by the client widget and the upload server fn. */
export const ALLOWED_UPLOAD_TYPES = ALLOWED_TYPES;

/**
 * Client used to write chat uploads. Prefers the service-role key and falls
 * back to the publishable key (the bucket allows anon inserts).
 */
export function getUploadClient(): SupabaseClient | null {
  const admin = getAdminClient();
  if (admin) return admin;

  const url = process.env["SUPABASE_URL"] ?? process.env["VITE_SUPABASE_URL"];
  const key =
    process.env["SUPABASE_PUBLISHABLE_KEY"] ??
    process.env["VITE_SUPABASE_PUBLISHABLE_KEY"] ??
    process.env["SUPABASE_ANON_KEY"];
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`) {
          headers.delete("Authorization");
        }
        headers.set("apikey", key);
        return fetch(input, { ...init, headers });
      },
    },
  });
}

export function getAdminClient(): SupabaseClient | null {
  const url = process.env["SUPABASE_URL"] ?? process.env["VITE_SUPABASE_URL"];
  const key = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`) {
          headers.delete("Authorization");
        }
        headers.set("apikey", key);
        return fetch(input, { ...init, headers });
      },
    },
  });
}

/**
 * Moves each temporary chat upload into `{enquiryId}/{unique-name}`, records
 * metadata in `product_enquiry_attachments`, and returns the bytes so the PDF
 * and internal email can embed/attach them.
 *
 * Never throws: a failed attachment is reported with status "failed" so the
 * enquiry workflow can continue.
 */
export async function persistEnquiryAttachments(params: {
  enquiryRowId: string;
  enquiryRef: string;
  inputs: AttachmentInput[];
}): Promise<StoredAttachment[]> {
  const admin = getAdminClient();
  const results: StoredAttachment[] = [];
  if (!admin || !params.inputs.length) {
    if (!admin && params.inputs.length) {
      console.error("[OfficeNeed] attachments: service-role client unavailable, skipping persistence");
      return params.inputs.map((i) => ({
        fileName: sanitizeFileName(i.name),
        storagePath: i.path,
        mimeType: i.mimeType ?? "application/octet-stream",
        fileSize: i.size ?? 0,
        isImage: false,
        status: "failed" as const,
      }));
    }
    return results;
  }

  for (const input of params.inputs) {
    const fileName = sanitizeFileName(input.name);
    const declaredType = input.mimeType ?? "application/octet-stream";
    const base: StoredAttachment = {
      fileName,
      storagePath: input.path,
      mimeType: declaredType,
      fileSize: input.size ?? 0,
      isImage: false,
      status: "failed",
    };

    try {
      if (!ALLOWED_TYPES.has(declaredType)) {
        console.error(`[OfficeNeed] attachment rejected (type): ${fileName} ${declaredType}`);
        results.push(base);
        continue;
      }

      const download = await admin.storage.from(BUCKET).download(input.path);
      if (download.error || !download.data) {
        console.error("[OfficeNeed] attachment download failed", input.path, download.error);
        results.push(base);
        continue;
      }

      const bytes = Buffer.from(await download.data.arrayBuffer());
      if (!bytes.length || bytes.length > MAX_BYTES) {
        console.error(`[OfficeNeed] attachment rejected (size ${bytes.length}): ${fileName}`);
        results.push(base);
        continue;
      }

      const sniffed = sniffImageFormat(bytes);
      if (IMAGE_TYPES.has(declaredType) && !sniffed) {
        console.error(`[OfficeNeed] attachment rejected (content mismatch): ${fileName}`);
        results.push(base);
        continue;
      }

      const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${fileName}`;
      const finalPath = `${params.enquiryRef}/${unique}`;

      const move = await admin.storage.from(BUCKET).move(input.path, finalPath);
      let storagePath = finalPath;
      if (move.error) {
        // Fall back to a copy-style upload so we never lose the file.
        const upload = await admin.storage
          .from(BUCKET)
          .upload(finalPath, bytes, { contentType: declaredType, upsert: false });
        if (upload.error) {
          console.error("[OfficeNeed] attachment move/upload failed", input.path, move.error, upload.error);
          storagePath = input.path;
        }
      }

      const { error: metaError } = await admin.from("product_enquiry_attachments").insert({
        enquiry_id: params.enquiryRowId,
        file_name: input.name.slice(0, 200),
        storage_path: storagePath,
        mime_type: declaredType,
        file_size: bytes.length,
        upload_status: "stored",
      });
      if (metaError) console.error("[OfficeNeed] attachment metadata insert failed", metaError);

      let signedUrl: string | undefined;
      const signed = await admin.storage.from(BUCKET).createSignedUrl(storagePath, 60 * 60 * 24 * 7);
      if (signed.data?.signedUrl) signedUrl = signed.data.signedUrl;

      results.push({
        fileName: input.name,
        storagePath,
        mimeType: declaredType,
        fileSize: bytes.length,
        isImage: sniffed !== null && sniffed !== undefined,
        bytes,
        ...(sniffed ? { imageFormat: sniffed } : {}),
        ...(signedUrl ? { signedUrl } : {}),
        status: "stored",
      });
    } catch (err) {
      console.error("[OfficeNeed] attachment processing exception", input.path, err);
      results.push(base);
    }
  }

  return results;
}
