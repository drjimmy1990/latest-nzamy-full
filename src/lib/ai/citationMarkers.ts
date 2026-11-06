/**
 * citationMarkers.ts — the one stripper of the AI's source markers ([S1], [S12]).
 * Pure so node --test can load it; CitedAnswer re-exports it for the pages. Any
 * text that leaves the screen (copy, Word, print) goes through this.
 */
export const stripCitationMarkers = (text: string) => text.replace(/\s?\[S\d{1,3}\]/g, "");
