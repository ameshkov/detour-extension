// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AlternativesAnswer } from './alternatives';
import { startCountdown } from './auto-open';
import type { AlternativesView } from './block-results';
import { renderAlternatives } from './block-results';
import { AUTO_OPEN_COUNTDOWN_SECONDS } from './constants';
import { SEARCH_CARD_DETAIL, STAY_LABEL, countdownText } from './copy';
import { routeViews } from './state-view';
import { mountShell, readShell, role } from './testing/shell';

const URL = 'https://arstechnica.com/gadgets/2026/10/ai-image-tools-compared/';
const DOMAIN = 'arstechnica.com';

const ANSWER: AlternativesAnswer = {
  query: 'AI image tools',
  degraded: false,
  provider: 'ceramic',
  topic: null,
  alternatives: [
    {
      url: URL,
      title: 'The best AI image generators, compared',
      description: 'We tested every tool that asks for your money.',
      domain: DOMAIN,
      match: 'same_story',
    },
  ],
};

let navigated: string[];

function number(): string {
  return role('countdown-number').textContent ?? '';
}

function start(): () => void {
  return startCountdown({
    url: URL,
    domain: DOMAIN,
    navigate: (target: string): void => {
      navigated.push(target);
    },
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  navigated = [];
  mountShell(readShell('block.html'));
});

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('the auto-open countdown', () => {
  it('counts three seconds and opens the first result', () => {
    start();

    expect(role('countdown').hidden).toBe(false);
    expect(role('countdown-text').textContent).toBe(countdownText(DOMAIN));
    expect(role('countdown-cancel').textContent).toBe(STAY_LABEL);
    expect(number()).toBe(String(AUTO_OPEN_COUNTDOWN_SECONDS));

    vi.advanceTimersByTime(1000);

    expect(number()).toBe('2');

    vi.advanceTimersByTime(1000);

    expect(number()).toBe('1');

    vi.advanceTimersByTime(1000);

    expect(navigated).toEqual([URL]);
  });

  it('stops on escape', () => {
    start();

    vi.advanceTimersByTime(1000);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    vi.advanceTimersByTime(4000);

    expect(navigated).toEqual([]);
    expect(role('countdown').hidden).toBe(true);
  });

  it('stops on a click', () => {
    start();

    vi.advanceTimersByTime(1000);

    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

    vi.advanceTimersByTime(4000);

    expect(navigated).toEqual([]);
  });

  it('stops a running countdown', () => {
    const stop = start();

    vi.advanceTimersByTime(1000);

    stop();

    vi.advanceTimersByTime(4000);

    expect(navigated).toEqual([]);
    expect(role('countdown').hidden).toBe(true);
  });

  it('leaves the list on screen after a stop', () => {
    const view: AlternativesView = {
      state: 'results',
      routes: routeViews(ANSWER, null),
      imagesEnabled: false,
      query: 'AI image tools',
      topic: null,
      searchDetail: SEARCH_CARD_DETAIL,
    };

    renderAlternatives(view);
    start();

    vi.advanceTimersByTime(1000);
    role('countdown-cancel').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    vi.advanceTimersByTime(4000);

    expect(navigated).toEqual([]);
    expect(role('list').querySelectorAll('a')).toHaveLength(1);
    expect(role('list').querySelector('a')?.getAttribute('href')).toBe(URL);
  });
});
