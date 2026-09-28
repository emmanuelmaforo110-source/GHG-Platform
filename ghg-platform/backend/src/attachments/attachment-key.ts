/**
 * Works out the storage key of an uploaded file from what was saved in attachments.file_url.
 * Uploads save either a public URL (`S3_PUBLIC_URL_BASE/<key>`) or, for a private bucket, the key
 * itself. Older rows may hold a full URL on another host; then the key is the URL path without the
 * leading bucket name.
 */
export function attachmentKey(fileUrl: string, publicBase?: string, bucket?: string): string {
  const base = publicBase?.replace(/\/+$/, '');
  if (base && fileUrl.startsWith(`${base}/`)) return decodeURIComponent(fileUrl.slice(base.length + 1));
  if (!/^https?:\/\//i.test(fileUrl)) return fileUrl;
  let path = decodeURIComponent(new URL(fileUrl).pathname.replace(/^\/+/, ''));
  if (bucket && path.startsWith(`${bucket}/`)) path = path.slice(bucket.length + 1);
  return path;
}

/** A file name that is safe inside a Content-Disposition header. */
export function safeFileName(name: string): string {
  return name.replace(/[\r\n"\\]/g, '_').replace(/[^\x20-\x7e]/g, '_') || 'evidence';
}
