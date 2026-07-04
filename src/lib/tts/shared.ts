export interface VoiceLike {
  default?: boolean;
  lang: string;
  name: string;
}

export interface SpeechSegment {
  element: HTMLElement;
  id: string;
  text: string;
}

export const TTS_RATE_STORAGE_KEY = 'article-tts-rate';

export const TTS_EXCLUDE_SELECTORS = [
  'pre',
  'code',
  'script',
  'style',
  'noscript',
  'svg',
  'canvas',
  '[hidden]',
  '[aria-hidden="true"]',
  '[data-audio-player]',
  '[data-video-player]',
  '.audio-player-mount',
  '.video-player-mount',
  '.quiz-mount',
  '.quiz-original',
  '.note-icon-mount',
  '.encrypted-block',
  '.encrypted-post',
  '.encrypted-block-mount',
  '.encrypted-post-mount',
  '.code-block-wrapper-toolbar-mount',
  '.mermaid-wrapper-toolbar-mount',
  '.infographic-wrapper-toolbar-mount',
].join(', ');

export function normalizeSpeechText(text: string): string {
  const normalizedLines = text
    .replace(/\r\n?/g, '\n')
    .replace(/\u00a0/g, ' ')
    .split('\n')
    .map((line) => line.replace(/[^\S\r\n]+/g, ' ').trim());

  const compacted: string[] = [];

  for (const line of normalizedLines) {
    const previous = compacted[compacted.length - 1];
    if (!line && (!previous || previous === '')) continue;
    compacted.push(line);
  }

  return compacted.join('\n').trim();
}

export function normalizeSegmentList(segments: string[]): string[] {
  return segments.map((segment) => normalizeSpeechText(segment)).filter(Boolean);
}

export function resolveSpeechLang(locale: string): string {
  const normalized = locale.toLowerCase();

  if (normalized.startsWith('zh')) return 'zh-CN';
  if (normalized.startsWith('ja')) return 'ja-JP';
  if (normalized.startsWith('en')) return 'en-US';

  const [language, region] = normalized.split('-');
  if (!language) return 'en-US';

  return `${language}-${(region ?? language).toUpperCase()}`;
}

export function pickBestVoice<T extends VoiceLike>(voices: T[], lang: string): T | null {
  if (voices.length === 0) return null;

  const normalizedLang = lang.toLowerCase();
  const baseLang = normalizedLang.split('-')[0];

  const exactMatch = voices.find((voice) => voice.lang.toLowerCase() === normalizedLang);
  if (exactMatch) return exactMatch;

  const baseMatch = voices.find((voice) => voice.lang.toLowerCase().startsWith(`${baseLang}-`));
  if (baseMatch) return baseMatch;

  const defaultVoice = voices.find((voice) => voice.default);
  return defaultVoice ?? voices[0];
}
