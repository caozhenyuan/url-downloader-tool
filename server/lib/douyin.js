import { request } from 'undici';

// ---------- Constants ----------

const DOUYIN_SHARE_HOSTS = [
  'v.douyin.com',
  'www.douyin.com',
  'www.iesdouyin.com',
  'iesdouyin.com',
];

const DOUYIN_CDN_KEYWORDS = [
  'douyinvod.com',
  'snssdk.com',
  'byteimg.com',
  'douyinpic.com',
  'amemv.com',
  'bytedance.com',
];

const MOBILE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1';
const PC_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/104.0.0.0 Safari/537.36';

// ---------- Public helpers ----------

export function isDouyinUrl(url) {
  try {
    const { hostname } = new URL(url);
    return DOUYIN_SHARE_HOSTS.some(h => hostname === h || hostname.endsWith('.' + h));
  } catch {
    return false;
  }
}

export function isDouyinCdnUrl(url) {
  try {
    const { hostname } = new URL(url);
    return DOUYIN_CDN_KEYWORDS.some(k => hostname.includes(k));
  } catch {
    return false;
  }
}

export function getDouyinDownloadHeaders() {
  return {
    'Referer': 'https://www.douyin.com/',
    'User-Agent': PC_UA,
  };
}

// ---------- Internal helpers ----------

function discardBody(body) {
  if (!body || body.destroyed || body.readableEnded) return;
  body.on('error', () => {});
  body.resume();
}

async function readBody(resp) {
  const chunks = [];
  for await (const chunk of resp.body) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf-8');
}

// ---------- Share link resolution ----------

const REDIRECT_CODES = new Set([301, 302, 303, 307, 308]);

async function resolveShareLink(shareUrl) {
  let currentUrl = shareUrl;

  for (let i = 0; i <= 5; i++) {
    let resp = await request(currentUrl, {
      method: 'HEAD',
      maxRedirections: 0,
      headers: { 'User-Agent': MOBILE_UA },
      headersTimeout: 10000,
      bodyTimeout: 10000,
    });

    if (resp.statusCode === 405 || resp.statusCode === 403) {
      discardBody(resp.body);
      resp = await request(currentUrl, {
        method: 'GET',
        maxRedirections: 0,
        headers: { 'User-Agent': MOBILE_UA },
        headersTimeout: 10000,
        bodyTimeout: 10000,
      });
    }

    if (REDIRECT_CODES.has(resp.statusCode)) {
      const location = resp.headers.location;
      discardBody(resp.body);
      if (!location) throw new Error('重定向响应缺少 Location 头。');
      currentUrl = new URL(location, currentUrl).toString();
      continue;
    }

    discardBody(resp.body);
    break;
  }

  let videoId = null;
  for (const pattern of [/\/video\/(\d+)/, /\/note\/(\d+)/, /modal_id=(\d+)/]) {
    const m = currentUrl.match(pattern);
    if (m) { videoId = m[1]; break; }
  }

  if (!videoId) {
    throw new Error('无法从链接中提取视频 ID，请确认是否为抖音视频分享链接。');
  }

  return { videoId, pageUrl: currentUrl };
}

// ---------- Parse iesdouyin.com share page ----------

async function parseFromSharePage(videoId) {
  const pageUrl = `https://www.iesdouyin.com/share/video/${videoId}/?from_ssr=1`;

  const resp = await request(pageUrl, {
    method: 'GET',
    headers: {
      'User-Agent': MOBILE_UA,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
    headersTimeout: 10000,
    bodyTimeout: 15000,
  });

  if (resp.statusCode !== 200) {
    throw new Error(`获取分享页面失败 (HTTP ${resp.statusCode})`);
  }

  const html = await readBody(resp);

  // Extract window._ROUTER_DATA
  const match = html.match(/window\._ROUTER_DATA\s*=\s*(\{[\s\S]*?\})\s*<\/script>/);
  if (!match) {
    throw new Error('无法从页面中提取视频数据 (_ROUTER_DATA 未找到)。');
  }

  let data;
  try {
    data = JSON.parse(match[1]);
  } catch {
    throw new Error('视频数据 JSON 解析失败。');
  }

  // Navigate: loaderData → find the video page key → videoInfoRes → item_list[0]
  const loaderData = data.loaderData;
  if (!loaderData) throw new Error('视频数据中缺少 loaderData。');

  let videoInfoRes = null;
  for (const key of Object.keys(loaderData)) {
    if (loaderData[key]?.videoInfoRes) {
      videoInfoRes = loaderData[key].videoInfoRes;
      break;
    }
  }

  if (!videoInfoRes) throw new Error('视频数据中缺少 videoInfoRes。');

  const items = videoInfoRes.item_list;
  if (!items || items.length === 0) throw new Error('视频数据中无视频条目。');

  return extractVideoInfo(items[0], videoId);
}

// ---------- Video info extraction ----------

function extractVideoInfo(detail, videoId) {
  const video = detail.video;
  if (!video) throw new Error('视频数据中缺少视频信息。');

  // Get play URL from play_addr
  let playUrl = null;
  const playAddr = video.play_addr;
  if (playAddr?.url_list?.[0]) {
    playUrl = playAddr.url_list[0];
  }

  // Remove watermark: playwm → play
  if (playUrl) {
    playUrl = playUrl.replace(/playwm/g, 'play');
  }

  // Use video_id (play_addr.uri) to build a direct 1080p download URL as fallback
  const videoUri = playAddr?.uri || video.uri || video.video_id;
  const hdUrl = videoUri
    ? `https://aweme.snssdk.com/aweme/v1/play/?video_id=${videoUri}&radio=1080p&line=0`
    : null;

  const title = detail.desc || '';
  const author = detail.author?.nickname || '';
  const cover = video.cover?.url_list?.[0] || video.origin_cover?.url_list?.[0] || '';
  const duration = video.duration ? Math.round(video.duration / 1000) : 0;

  const isImagePost = detail.aweme_type === 68 || (detail.images && detail.images.length > 0);
  const images = isImagePost
    ? (detail.images || []).map(img => img.url_list?.[0]).filter(Boolean)
    : [];

  return {
    videoId,
    title,
    author,
    cover,
    playUrl: playUrl || hdUrl,
    hdUrl,
    isImagePost,
    images,
    duration,
    fileName: `douyin_${videoId}.mp4`,
  };
}

// ---------- Main entry ----------

export async function parseDouyinVideo(url) {
  const { videoId } = await resolveShareLink(url);
  return await parseFromSharePage(videoId);
}
