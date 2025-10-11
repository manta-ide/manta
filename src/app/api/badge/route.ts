import { NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const text = searchParams.get('text') || 'Manta Graph';
  const link = searchParams.get('link');

  // Calculate text width for centering (approximate)
  const textWidth = text.length * 7.5; // rough estimate for font-size 110 scaled by 0.1 = 11px
  const totalWidth = Math.max(109, 24 + textWidth + 10); // minimum 109, or logo width + text + padding

  // Center text in the blue area (starting at x=24)
  const blueAreaStart = 24;
  const blueAreaWidth = totalWidth - 24;
  const textCenterX = blueAreaStart + blueAreaWidth / 2;
  const scaledTextCenterX = textCenterX * 10;
  const scaledTextWidth = textWidth * 10;

  const linkHref = link ? `/${link}` : '';
  const linkStart = link ? `<a xlink:href="${linkHref}" xmlns:xlink="http://www.w3.org/1999/xlink">` : '';
  const linkEnd = link ? '</a>' : '';

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="20" role="img" aria-label="${text}"><title>${text}</title><linearGradient id="s" x2="0" y2="100%"><stop offset="0" stop-color="#bbb" stop-opacity=".1"/><stop offset="1" stop-opacity=".1"/></linearGradient><linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stop-color="#6366f1"/><stop offset="100%" stop-color="#3b82f6"/></linearGradient><clipPath id="r"><rect width="${totalWidth}" height="20" rx="3" fill="#fff"/></clipPath>${linkStart}<g clip-path="url(#r)"><rect width="24" height="20" fill="black"/><rect x="24" width="${totalWidth - 24}" height="20" fill="url(#bg)"/><rect width="${totalWidth}" height="20" fill="url(#s)"/></g><g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" text-rendering="geometricPrecision" font-size="110"><image x="1" y="-1" width="22" height="22" href="/logonb.svg"/><text aria-hidden="true" x="${scaledTextCenterX}" y="150" fill="#010101" fill-opacity=".3" transform="scale(.1)" textLength="${scaledTextWidth}">${text}</text><text x="${scaledTextCenterX}" y="140" transform="scale(.1)" fill="#fff" textLength="${scaledTextWidth}">${text}</text></g>${linkEnd}</svg>`;

  return new Response(svg, {
    headers: {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'public, max-age=31536000',
    },
  });
}
