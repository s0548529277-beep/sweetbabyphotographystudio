/** Collapses internal whitespace and trims — the matching key for both the DB lookup and the DOM text-node scan in SiteTexts.tsx. */
export const norm = (s: string) => s.replace(/\s+/g, " ").trim();

/** sessionStorage key for whether the live "click text to edit" mode is on (admin-only; see SiteTexts.tsx). */
export const EDIT_FLAG = "site-edit-mode";

/** Custom window event fired whenever EDIT_FLAG changes, so SiteTexts.tsx's own toggle button re-syncs its UI. */
export const EDIT_EVENT = "site-edit-mode-change";
