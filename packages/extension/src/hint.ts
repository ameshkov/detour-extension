import type { KeyboardHintPart } from './copy';
import { topicLabel } from './copy';

/**
 * One keyboard line, with one key cap per key, and the story of the article at
 * the far end. The words stay in the copy module; the renderer only wraps the
 * parts that the copy marks as keys.
 */
export function renderHint(
  line: HTMLElement | null,
  parts: readonly KeyboardHintPart[],
  topic: string | null = null,
): void {
  if (line === null) {
    return;
  }

  const keys = document.createElement('span');

  keys.setAttribute('data-role', 'keyboard-keys');
  keys.append(
    ...parts.map((part) => {
      if (part.key === true) {
        const key = document.createElement('kbd');

        key.textContent = part.text;

        return key;
      }

      return document.createTextNode(part.text);
    }),
  );

  if (topic === null) {
    line.replaceChildren(keys);

    return;
  }

  const story = document.createElement('span');

  story.setAttribute('data-role', 'topic');
  story.textContent = topicLabel(topic);
  line.replaceChildren(keys, story);
}
