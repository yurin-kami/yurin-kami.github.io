import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeSegmentList, normalizeSpeechText, pickBestVoice, resolveSpeechLang } from '../src/lib/tts/shared';

test('normalizeSpeechText collapses whitespace and trims empty lines', () => {
  const text = '  First paragraph. \n\n\n Second\t\tparagraph.  \n  Third line ';

  assert.equal(normalizeSpeechText(text), 'First paragraph.\n\nSecond paragraph.\nThird line');
});

test('normalizeSegmentList keeps readable paragraph boundaries and removes empty segments', () => {
  const segments = normalizeSegmentList(['  Intro line  ', '', '  ', 'Second paragraph\nwith wrap', '   ']);

  assert.deepEqual(segments, ['Intro line', 'Second paragraph\nwith wrap']);
});

test('resolveSpeechLang maps supported locales to concrete speech languages', () => {
  assert.equal(resolveSpeechLang('zh'), 'zh-CN');
  assert.equal(resolveSpeechLang('en'), 'en-US');
  assert.equal(resolveSpeechLang('ja'), 'ja-JP');
  assert.equal(resolveSpeechLang('fr'), 'fr-FR');
});

test('pickBestVoice prefers exact language match and then defaults', () => {
  const voices = [
    { name: 'Fallback Default', lang: 'en-US', default: true },
    { name: 'Japanese Voice', lang: 'ja-JP', default: false },
    { name: 'Chinese Voice', lang: 'zh-CN', default: false },
  ];

  assert.equal(pickBestVoice(voices, 'zh-CN')?.name, 'Chinese Voice');
  assert.equal(pickBestVoice(voices, 'ko-KR')?.name, 'Fallback Default');
});
