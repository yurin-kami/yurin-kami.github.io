import { Button } from '@components/ui/button';
import { useTTS } from '@hooks/useTTS';
import { clearTTSMarkers, extractSpeechSegmentsFromSelector } from '@lib/tts/extract-readable-text';
import { cn } from '@lib/utils';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RiPauseFill, RiPlayFill, RiSpeedUpFill, RiStopFill, RiVoiceprintFill } from 'react-icons/ri';
import type { Locale } from '@/i18n';

interface TTSPlayerProps {
  contentSelector: string;
  locale: Locale;
}

const RATE_OPTIONS = [0.75, 1, 1.25, 1.5] as const;

const COPY = {
  en: {
    empty: 'No readable article text was found.',
    error: 'Playback failed. Please try again.',
    pause: 'Pause',
    play: 'Play',
    progress: (current: number, total: number) => `Paragraph ${current} / ${total}`,
    rate: 'Speed',
    ready: (count: number) => `${count} paragraphs ready`,
    resume: 'Resume',
    sectionLabel: 'Article text-to-speech',
    statusIdle: 'Ready to read the article aloud.',
    statusPaused: 'Reading paused.',
    statusPlaying: 'Reading the article aloud.',
    stop: 'Stop',
    title: 'Read this article',
    unsupported: 'This browser does not support speech synthesis.',
  },
  ja: {
    empty: '読み上げできる本文テキストが見つかりません。',
    error: '再生に失敗しました。再度お試しください。',
    pause: '一時停止',
    play: '再生',
    progress: (current: number, total: number) => `段落 ${current} / ${total}`,
    rate: '速度',
    ready: (count: number) => `${count} 段落を再生できます`,
    resume: '再開',
    sectionLabel: '記事の音声読み上げ',
    statusIdle: '記事を読み上げる準備ができています。',
    statusPaused: '読み上げを一時停止しています。',
    statusPlaying: '記事を読み上げています。',
    stop: '停止',
    title: 'この記事を読む',
    unsupported: 'このブラウザは音声合成をサポートしていません。',
  },
  zh: {
    empty: '未找到可用于朗读的正文内容。',
    error: '朗读失败，请稍后再试。',
    pause: '暂停朗读',
    play: '开始朗读',
    progress: (current: number, total: number) => `段落 ${current} / ${total}`,
    rate: '语速',
    ready: (count: number) => `共 ${count} 段，已准备就绪`,
    resume: '继续朗读',
    sectionLabel: '文章语音朗读',
    statusIdle: '准备好后可以开始朗读。',
    statusPaused: '朗读已暂停。',
    statusPlaying: '正在朗读文章内容。',
    stop: '停止朗读',
    title: '朗读本文',
    unsupported: '当前浏览器不支持语音朗读。',
  },
} as const;

function getCopy(locale: Locale) {
  if (locale.startsWith('ja')) return COPY.ja;
  if (locale.startsWith('en')) return COPY.en;
  return COPY.zh;
}

export function TTSPlayer({ contentSelector, locale }: TTSPlayerProps) {
  const copy = getCopy(locale);
  const { error, isSupported, pause, rate, resume, setRate, speakSegments, status, stop } = useTTS();
  const [segmentCount, setSegmentCount] = useState(0);
  const [activeSegmentId, setActiveSegmentId] = useState<string | null>(null);
  const [activeSegmentIndex, setActiveSegmentIndex] = useState<number | null>(null);
  const activeElementRef = useRef<HTMLElement | null>(null);

  const clearActiveSegment = useCallback(() => {
    if (activeElementRef.current) {
      delete activeElementRef.current.dataset.ttsActive;
      activeElementRef.current = null;
    }

    setActiveSegmentId(null);
    setActiveSegmentIndex(null);
  }, []);

  useEffect(() => {
    return () => {
      clearActiveSegment();
      const root = document.querySelector<HTMLElement>(contentSelector);
      if (root) {
        clearTTSMarkers(root);
      }
    };
  }, [clearActiveSegment, contentSelector]);

  const statusText = useMemo(() => {
    if (!isSupported) return copy.unsupported;
    if (error === 'empty') return copy.empty;
    if (error === 'playback') return copy.error;

    switch (status) {
      case 'playing':
        return copy.statusPlaying;
      case 'paused':
        return copy.statusPaused;
      case 'error':
        return copy.error;
      default:
        return copy.statusIdle;
    }
  }, [copy, error, isSupported, status]);

  const syncActiveSegment = useCallback((index: number, segmentId: string | null, element: HTMLElement | null) => {
    if (activeElementRef.current && activeElementRef.current !== element) {
      delete activeElementRef.current.dataset.ttsActive;
    }

    if (element) {
      element.dataset.ttsActive = 'true';
      element.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }

    activeElementRef.current = element;
    setActiveSegmentId(segmentId);
    setActiveSegmentIndex(index + 1);
  }, []);

  const handlePlayToggle = () => {
    if (!isSupported) return;

    if (status === 'playing') {
      pause();
      return;
    }

    if (status === 'paused') {
      resume();
      return;
    }

    const segments = extractSpeechSegmentsFromSelector(contentSelector);
    setSegmentCount(segments.length);

    if (segments.length === 0) {
      clearActiveSegment();
      speakSegments([], { locale });
      return;
    }

    speakSegments(
      segments.map((segment) => segment.text),
      {
        locale,
        onBoundary: (index) => {
          const current = segments[index];
          syncActiveSegment(index, current?.id ?? null, current?.element ?? null);
        },
        onComplete: () => {
          clearActiveSegment();
        },
      },
    );
  };

  const handleStop = () => {
    stop();
    clearActiveSegment();
  };

  return (
    <section
      className={cn('mb-6 overflow-hidden rounded-2xl border border-border/60 bg-gradient-start shadow-box')}
      aria-label={copy.sectionLabel}
      data-tts-player
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-border/50 border-b bg-foreground/[0.04] px-4 py-3">
        <div className="space-y-1.5">
          <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 font-medium text-primary text-xs">
            <RiVoiceprintFill className="size-4" />
            <span>{copy.title}</span>
          </div>
          <p className="max-w-2xl text-muted-foreground text-sm leading-6">{statusText}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          {segmentCount > 0 && (
            <span className="rounded-full border border-border/50 bg-background/80 px-3 py-1 text-muted-foreground">
              {copy.ready(segmentCount)}
            </span>
          )}
          {activeSegmentIndex && activeSegmentId && (
            <span className="rounded-full bg-primary/10 px-3 py-1 font-medium text-primary">
              {copy.progress(activeSegmentIndex, segmentCount)}
            </span>
          )}
        </div>
      </div>

      <div className="grid gap-3 px-4 py-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
        <div className="rounded-2xl border border-border/50 bg-background/70 p-3 backdrop-blur-sm">
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" size="sm" className="rounded-full" onClick={handlePlayToggle} disabled={!isSupported}>
              {status === 'playing' ? <RiPauseFill className="mr-1 size-4" /> : <RiPlayFill className="mr-1 size-4" />}
              {status === 'playing' ? copy.pause : status === 'paused' ? copy.resume : copy.play}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="rounded-full bg-background/80"
              onClick={handleStop}
              disabled={!isSupported || status === 'idle'}
            >
              <RiStopFill className="mr-1 size-4" />
              {copy.stop}
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-start gap-2 rounded-2xl border border-border/50 bg-background/70 p-2 backdrop-blur-sm md:justify-end">
          <span className="inline-flex items-center gap-1 px-2 text-muted-foreground text-xs">
            <RiSpeedUpFill className="size-3.5" />
            {copy.rate}
          </span>
          {RATE_OPTIONS.map((option) => {
            const isActive = rate === option;
            return (
              <button
                key={option}
                type="button"
                onClick={() => setRate(option)}
                className={cn(
                  'rounded-full px-3 py-1.5 font-medium text-xs transition-colors',
                  isActive
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'bg-foreground/5 text-muted-foreground hover:bg-foreground/10 hover:text-foreground',
                )}
                aria-pressed={isActive}
              >
                {option}x
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
