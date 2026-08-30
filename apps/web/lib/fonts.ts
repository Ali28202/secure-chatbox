import localFont from 'next/font/local';

export const vazirmatn = localFont({
  src: '../fonts/Vazirmatn-Variable.woff2',
  variable: '--font-vazirmatn',
  weight: '100 900',
  display: 'swap',
  fallback: ['Tahoma', 'system-ui', 'sans-serif'],
});
