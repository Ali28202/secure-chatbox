import localFont from 'next/font/local';

/**
 * Vazirmatn — the UI typeface for the whole application.
 *
 * Loaded with `next/font/local` from a woff2 committed into this repo rather
 * than from Google Fonts. The platform runs on a university LAN with no route
 * to the internet: a `fonts.gstatic.com` request would simply time out, and
 * every screen would fall back to whatever the browser has for Persian.
 *
 * Two details worth knowing:
 *
 * - `src` resolves relative to *this file*, not to the project root, hence the
 *   `../fonts/` prefix.
 * - The upstream file is named `Vazirmatn[wght].woff2`. It was renamed on the
 *   way in because square brackets are how Next spells a dynamic route
 *   segment, and the bracketed name confuses the build.
 *
 * One variable file covers the whole `100 900` weight range, so `font-bold`
 * and `font-medium` cost no extra download.
 */
export const vazirmatn = localFont({
  src: '../fonts/Vazirmatn-Variable.woff2',
  variable: '--font-vazirmatn',
  weight: '100 900',
  display: 'swap',
  // Tahoma first: it is the one font with usable Persian coverage that is
  // already on virtually every campus Windows machine.
  fallback: ['Tahoma', 'system-ui', 'sans-serif'],
});
