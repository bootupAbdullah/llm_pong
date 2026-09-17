// Typed element lookup. The Phase 1 script assumed every `getElementById`
// succeeded; this makes that assumption explicit and gives callers a real type.

export function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing required element #${id}`);
  return el as T;
}
