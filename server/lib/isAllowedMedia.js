const ALLOWED_PREFIXES = [
  'video/',
  'audio/',
  'image/',
  'application/octet-stream'
];

export function isAllowedMedia(contentType) {
  if (!contentType) {
    return false;
  }

  const normalized = contentType.split(';')[0].trim().toLowerCase();
  return ALLOWED_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}
