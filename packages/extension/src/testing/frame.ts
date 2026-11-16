/**
 * A framed document, expressed the way the block page reads it: `window.top` is
 * another object. happy-dom runs the test document in one window, so the test
 * replaces the reference for the case and restores it afterwards; a frame left in
 * place makes every later case in the file draw nothing.
 */

export function installFramedWindow(): void {
  Object.defineProperty(window, 'top', { value: {}, configurable: true });
}

export function restoreWindowTop(): void {
  Object.defineProperty(window, 'top', { value: window, configurable: true });
}
