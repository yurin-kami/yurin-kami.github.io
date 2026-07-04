import { normalizeSegmentList, normalizeSpeechText, type SpeechSegment, TTS_EXCLUDE_SELECTORS } from './shared';

const SEGMENT_TAGS = new Set(['P', 'BLOCKQUOTE', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'FIGCAPTION']);
const NESTED_BLOCK_SELECTOR = 'p, blockquote, li, h1, h2, h3, h4, h5, h6, figcaption, ul, ol, pre, table';

function isReadableSegmentElement(element: HTMLElement): boolean {
  if (!SEGMENT_TAGS.has(element.tagName)) return false;
  if (element.closest(TTS_EXCLUDE_SELECTORS)) return false;
  if (element.matches('li') && element.querySelector(':scope > ul, :scope > ol, :scope > pre, :scope > table')) return false;
  if (!element.matches('li') && element.querySelector(`:scope > ${NESTED_BLOCK_SELECTOR}`)) return false;
  return true;
}

export function clearTTSMarkers(root: ParentNode) {
  root.querySelectorAll<HTMLElement>('[data-tts-segment-id], [data-tts-active="true"]').forEach((element) => {
    delete element.dataset.ttsSegmentId;
    delete element.dataset.ttsActive;
  });
}

export function extractReadableTextFromElement(root: HTMLElement): string {
  const clone = root.cloneNode(true) as HTMLElement;

  clone.querySelectorAll(TTS_EXCLUDE_SELECTORS).forEach((node) => {
    node.remove();
  });

  return normalizeSpeechText(clone.textContent ?? '');
}

export function extractReadableTextFromSelector(selector: string): string {
  const element = document.querySelector<HTMLElement>(selector);
  if (!element) return '';

  return extractReadableTextFromElement(element);
}

export function extractSpeechSegmentsFromElement(root: HTMLElement): SpeechSegment[] {
  clearTTSMarkers(root);

  const elements = Array.from(
    root.querySelectorAll<HTMLElement>(
      Array.from(SEGMENT_TAGS)
        .map((tag) => tag.toLowerCase())
        .join(', '),
    ),
  );
  const segments = elements
    .filter((element) => isReadableSegmentElement(element))
    .map((element, index) => {
      const [text] = normalizeSegmentList([element.textContent ?? '']);
      if (!text) return null;

      const id = `tts-segment-${index}`;
      element.dataset.ttsSegmentId = id;
      return { element, id, text };
    })
    .filter((segment): segment is SpeechSegment => Boolean(segment));

  return segments;
}

export function extractSpeechSegmentsFromSelector(selector: string): SpeechSegment[] {
  const element = document.querySelector<HTMLElement>(selector);
  if (!element) return [];

  return extractSpeechSegmentsFromElement(element);
}
