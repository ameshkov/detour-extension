/**
 * The shell and the script meet on one attribute: every element that a renderer
 * fills carries `data-role`, and no renderer holds a selector of its own.
 */
export function roleElement(role: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-role="${role}"]`);
}

export function setText(role: string, text: string): void {
  const element = roleElement(role);

  if (element !== null) {
    element.textContent = text;
  }
}

export function setHidden(role: string, hidden: boolean): void {
  const element = roleElement(role);

  if (element !== null) {
    element.hidden = hidden;
  }
}
