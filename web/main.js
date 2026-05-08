const inputElement = document.querySelector('#input');
const parseButton = document.querySelector('#parseButton');
const downloadButton = document.querySelector('#downloadButton');
const refreshButton = document.querySelector('#refreshButton');
const statusElement = document.querySelector('#status');
const resultElement = document.querySelector('#result');
const progressSectionElement = document.querySelector('#progressSection');
const progressBarElement = document.querySelector('#progressBar');
const progressTextElement = document.querySelector('#progressText');

const rawUrlElement = document.querySelector('#rawUrl');
const finalUrlElement = document.querySelector('#finalUrl');
const contentTypeElement = document.querySelector('#contentType');
const fileNameElement = document.querySelector('#fileName');
const downloadableElement = document.querySelector('#downloadable');

const videoInfoElement = document.querySelector('#videoInfo');
const videoCoverElement = document.querySelector('#videoCover');
const videoTitleElement = document.querySelector('#videoTitle');
const videoAuthorElement = document.querySelector('#videoAuthor');
const videoDurationElement = document.querySelector('#videoDuration');

let downloadUrl = null;
let suggestedFileName = 'download';

function setStatus(message) {
  statusElement.textContent = message;
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 B';
  }

  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function formatDuration(seconds) {
  if (!seconds || seconds <= 0) return '';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}分${s}秒` : `${s}秒`;
}

function resetProgress() {
  progressSectionElement.classList.add('hidden');
  progressBarElement.value = 0;
  progressBarElement.removeAttribute('max');
  progressTextElement.textContent = '0%';
}

function showProgress(receivedBytes, totalBytes) {
  progressSectionElement.classList.remove('hidden');

  if (Number.isFinite(totalBytes) && totalBytes > 0) {
    const percent = Math.min(100, Math.round((receivedBytes / totalBytes) * 100));
    progressBarElement.max = 100;
    progressBarElement.value = percent;
    progressTextElement.textContent = `${percent}% (${formatBytes(receivedBytes)} / ${formatBytes(totalBytes)})`;
    return;
  }

  progressBarElement.removeAttribute('max');
  progressTextElement.textContent = `已下载 ${formatBytes(receivedBytes)}`;
}

function resetResult() {
  resultElement.classList.add('hidden');
  videoInfoElement.classList.add('hidden');
  videoCoverElement.classList.add('hidden');
  downloadButton.disabled = true;
  downloadUrl = null;
  suggestedFileName = 'download';
  resetProgress();
}

function renderVideoInfo(info) {
  if (!info) return;

  videoInfoElement.classList.remove('hidden');
  videoTitleElement.textContent = info.title || '';
  videoAuthorElement.textContent = info.author ? `@${info.author}` : '';
  videoDurationElement.textContent = info.duration ? formatDuration(info.duration) : '';

  if (info.cover) {
    videoCoverElement.src = info.cover;
    videoCoverElement.classList.remove('hidden');
  } else {
    videoCoverElement.classList.add('hidden');
  }
}

function renderResult(data) {
  rawUrlElement.textContent = data.rawUrl;
  finalUrlElement.textContent = data.finalUrl;
  contentTypeElement.textContent = data.contentType || '未知';
  fileNameElement.textContent = data.fileName;
  downloadableElement.textContent = data.downloadable ? '是' : '否';
  resultElement.classList.remove('hidden');
  downloadButton.disabled = !data.downloadable;

  if (data.downloadable) {
    const downloadFileUrl = `/api/download?url=${encodeURIComponent(data.finalUrl)}`;
    const nameParam = data.fileName ? `&fileName=${encodeURIComponent(data.fileName)}` : '';
    downloadUrl = downloadFileUrl + nameParam;
  } else {
    downloadUrl = null;
  }

  suggestedFileName = data.fileName || 'download';
  renderVideoInfo(data.videoInfo);
}

function triggerDownload(blob, fileName) {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);
}

parseButton.addEventListener('click', async () => {
  const input = inputElement.value.trim();
  resetResult();

  if (!input) {
    setStatus('请先粘贴内容。');
    return;
  }

  setStatus('正在解析链接...');

  try {
    const response = await fetch('/api/parse', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ input })
    });

    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || '解析失败');
    }

    renderResult(payload);
    if (payload.platform === 'douyin') {
      setStatus(payload.downloadable ? '抖音视频解析完成，可以下载无水印版本。' : '解析完成，但未获取到视频下载地址。');
    } else {
      setStatus(payload.downloadable ? '解析完成，可以下载。' : '解析完成，但当前目标不是可下载媒体资源。');
    }
  } catch (error) {
    setStatus(error.message || '解析失败');
  }
});

downloadButton.addEventListener('click', async () => {
  if (!downloadUrl) {
    return;
  }

  downloadButton.disabled = true;
  parseButton.disabled = true;
  showProgress(0, NaN);
  setStatus('开始下载...');

  try {
    const response = await fetch(downloadUrl);
    const contentType = response.headers.get('content-type') || 'application/octet-stream';
    const contentLengthHeader = response.headers.get('content-length');
    const totalBytes = contentLengthHeader ? Number(contentLengthHeader) : NaN;

    if (!response.ok || !response.body) {
      let errorMessage = '下载失败';
      if (contentType.includes('application/json')) {
        const payload = await response.json();
        errorMessage = payload.error || errorMessage;
      }
      throw new Error(errorMessage);
    }

    const reader = response.body.getReader();
    const chunks = [];
    let receivedBytes = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      chunks.push(value);
      receivedBytes += value.byteLength;
      showProgress(receivedBytes, totalBytes);
    }

    const blob = new Blob(chunks, { type: contentType });
    triggerDownload(blob, suggestedFileName);
    showProgress(receivedBytes, totalBytes || receivedBytes);
    setStatus('下载完成。');
  } catch (error) {
    resetProgress();
    setStatus(error.message || '下载失败');
  } finally {
    parseButton.disabled = false;
    downloadButton.disabled = !downloadUrl;
  }
});

refreshButton.addEventListener('click', () => {
  location.reload();
});
