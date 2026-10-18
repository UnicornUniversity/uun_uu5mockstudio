// Icons shared by the chat window and the notes, so that "minimize" and "restore" look the same everywhere.
const svg = (inner) => `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">${inner}</svg>`;
export const ICON_MIN = svg('<polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="14" y1="10" x2="21" y2="3"/><line x1="3" y1="21" x2="10" y2="14"/>');
export const ICON_MAX = svg('<polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>');
export const ICON_PLUS = svg('<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>');
export const ICON_TRASH = svg('<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>');
export const ICON_CLOSE = svg('<line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/>');
export const ICON_CODE = svg('<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>');
export const ICON_VIEW = svg('<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>');
