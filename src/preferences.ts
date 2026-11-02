const autosaveKey = 'plotstatlab.settings.autosave';
export function loadAutosave(): boolean {
  try { return localStorage.getItem(autosaveKey) !== 'false'; } catch { return true; }
}
export function persistAutosave(enabled: boolean): void {
  localStorage.setItem(autosaveKey, String(enabled));
}
export function normalizeHex(input: string): string | null {
  const hex = input.trim().replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(hex)) return `#${[...hex].map(c=>c+c).join('').toLowerCase()}`;
  return /^[0-9a-f]{6}$/i.test(hex) ? `#${hex.toLowerCase()}` : null;
}
