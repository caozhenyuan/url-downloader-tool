import { request } from 'undici';
import { isIP } from 'node:net';

const REDIRECT_STATUS_CODES = new Set([301, 302, 303, 307, 308]);
const MAX_REDIRECTS = 5;
const REQUEST_TIMEOUT_MS = 10000;

function isPrivateHostname(hostname) {
  const normalized = hostname.toLowerCase();

  if (normalized === 'localhost' || normalized.endsWith('.localhost')) {
    return true;
  }

  const ipVersion = isIP(normalized);
  if (ipVersion === 4) {
    return normalized.startsWith('10.')
      || normalized.startsWith('127.')
      || normalized.startsWith('169.254.')
      || normalized.startsWith('172.16.')
      || normalized.startsWith('172.17.')
      || normalized.startsWith('172.18.')
      || normalized.startsWith('172.19.')
      || normalized.startsWith('172.20.')
      || normalized.startsWith('172.21.')
      || normalized.startsWith('172.22.')
      || normalized.startsWith('172.23.')
      || normalized.startsWith('172.24.')
      || normalized.startsWith('172.25.')
      || normalized.startsWith('172.26.')
      || normalized.startsWith('172.27.')
      || normalized.startsWith('172.28.')
      || normalized.startsWith('172.29.')
      || normalized.startsWith('192.168.');
  }

  if (ipVersion === 6) {
    return normalized === '::1' || normalized.startsWith('fc') || normalized.startsWith('fd') || normalized.startsWith('fe80:');
  }

  return false;
}

function assertPublicUrl(input) {
  const url = new URL(input);

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Only http and https URLs are allowed.');
  }

  if (isPrivateHostname(url.hostname)) {
    throw new Error('Private and loopback addresses are not allowed.');
  }

  return url;
}

function parseFileName(contentDisposition, finalUrl) {
  const headerMatch = contentDisposition?.match(/filename\*?=(?:UTF-8''|\")?([^";]+)/i);
  const rawName = headerMatch ? decodeURIComponent(headerMatch[1].trim()) : finalUrl.pathname.split('/').filter(Boolean).pop();
  const fallback = rawName || 'download';
  return fallback.replace(/[\\/:*?"<>|]/g, '_');
}

async function fetchMetadata(url, method) {
  const response = await request(url, {
    method,
    maxRedirections: 0,
    headersTimeout: REQUEST_TIMEOUT_MS,
    bodyTimeout: REQUEST_TIMEOUT_MS
  });

  if (method === 'GET') {
    response.body.destroy();
  }

  return response;
}

export async function resolveUrl(input) {
  let currentUrl = assertPublicUrl(input).toString();

  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    const response = await fetchMetadata(currentUrl, 'HEAD');

    if (REDIRECT_STATUS_CODES.has(response.statusCode)) {
      const location = response.headers.location;
      if (!location) {
        throw new Error('Redirect response is missing location header.');
      }
      currentUrl = assertPublicUrl(new URL(location, currentUrl).toString()).toString();
      continue;
    }

    const contentType = response.headers['content-type'] || '';
    const fileName = parseFileName(response.headers['content-disposition'], new URL(currentUrl));

    if (response.statusCode === 405 || response.statusCode === 403) {
      const fallback = await fetchMetadata(currentUrl, 'GET');
      return {
        finalUrl: currentUrl,
        contentType: fallback.headers['content-type'] || contentType,
        fileName,
        statusCode: fallback.statusCode
      };
    }

    return {
      finalUrl: currentUrl,
      contentType,
      fileName,
      statusCode: response.statusCode
    };
  }

  throw new Error('Too many redirects.');
}

export function validateDownloadUrl(input) {
  return assertPublicUrl(input).toString();
}
