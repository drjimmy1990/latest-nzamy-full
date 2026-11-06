/**
 * The client side of the .docx / .txt / .md option on the AI tools. Off unless
 * NEXT_PUBLIC_AI_TEXT_FILES is exactly "on" at build time; off means the
 * pickers and paste boxes stay PDF and images, as before.
 *
 * It only decides what a screen offers. The server decides what it accepts
 * (NZAMY_AI_TEXT_FILES, textFilesConfig.ts) and refuses the rest before any charge.
 */
export const AI_TEXT_FILES_ON = process.env.NEXT_PUBLIC_AI_TEXT_FILES === "on";
