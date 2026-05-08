const TRAILING_PUNCTUATION = /[。，；：！？,.!?:;�]+$/;
const WRAPPER_PAIRS = [
  ['(', ')'],
  ['[', ']'],
  ['{', '}'],
  ['<', '>'],
  ['"', '"'],
  ["'", "'"],
  ['“', '”'],
  ['‘', '’'],
  ['（', '）'],
  ['【', '】'],
  ['《', '》'],
  ['「', '」'],
  ['『', '』']
];

function unwrapCandidate(value) {
  let current = value.trim();

  while (current) {
    const withoutPunctuation = current.replace(TRAILING_PUNCTUATION, '');
    if (withoutPunctuation !== current) {
      current = withoutPunctuation.trim();
      continue;
    }

    const pair = WRAPPER_PAIRS.find(([start, end]) => current.startsWith(start) && current.endsWith(end));
    if (!pair) {
      break;
    }

    current = current.slice(pair[0].length, current.length - pair[1].length).trim();
  }

  return current;
}

function toValidUrl(candidate) {
  const cleaned = unwrapCandidate(candidate);
  if (!cleaned) {
    return null;
  }

  try {
    const url = new URL(cleaned);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

export function extractUrl(input) {
  if (typeof input !== 'string') {
    return null;
  }

  const matches = input.match(/https?:\/\/[^\s<>"'“”‘’()\[\]{}（）【】《》「」『』]+/gi) || [];
  for (const match of matches) {
    const validUrl = toValidUrl(match);
    if (validUrl) {
      return validUrl;
    }
  }

  return null;
}
