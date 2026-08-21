# Fix "Missing Supabase environment variable(s)" on file upload

## What's happening

The chat widget uploads attachments straight from the browser using the browser-side backend client. That client needs build-time keys baked into the published bundle. I verified an upload from the current preview and it succeeded, so the code path is fine — the failing case is a published build where those build-time keys were not inlined, so the client throws before the file is ever sent. Any republish that misses them breaks uploads again.

## Fix: upload through the server instead of the browser

Move the upload off the browser client so it no longer depends on build-time keys.

1. Add a public server function `uploadEnquiryAttachment` (in a client-safe `*.functions.ts` module) that:
   - accepts the file (base64 or FormData), original filename, and MIME type
   - re-validates size (10 MB), zero-byte, and the existing format allowlist server-side
   - sanitizes the filename and writes to `chat-uploads/<timestamp>-<random>-<name>` in the private `enquiry-attachments` bucket using the server-side key read inside the handler
   - returns `{ path, name, mimeType, size }` — the exact shape the widget already stores in `attachments`

2. Update `ChatWidget.tsx` to call that server function instead of `supabase.storage...upload`, keeping the current UI untouched: per-file status chips (uploading / saved / failed), one automatic retry with backoff, and the error reason shown under the filename.

3. Keep everything downstream unchanged — enquiry submit, `product_enquiry_attachments` rows, PDF image embedding, and email attachments all keep receiving the same metadata.

## Result

Uploads work on preview, published, and any external host, because the key is resolved on the server at request time rather than baked into the browser bundle. The bucket stays private; no new public read policy is added.

## Note

After this change the site needs a republish for the live URL to pick it up.
