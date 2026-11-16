/** A development line, and nothing in the release build, where the define is false. */
export function devLog(scope: string, message: string, ...data: unknown[]): void {
  if (typeof DEV !== 'undefined' && DEV) {
    console.log(`[detour] ${scope}: ${message}`, ...data);
  }
}
