import https from 'https';
import http from 'http';
import { MediaInfo, MediaFormat } from './ytdlp';

/**
 * ═══════════════════════════════════════════════════
 *  AYN Forum Crawler & Scraper
 * ═══════════════════════════════════════════════════
 * 
 *  Automatically extracts magnets and direct links from:
 *  - 1TamilMV
 *  - TamilBlasters
 *  - Movie Fora / Blogs
 */

export async function scrapeForumPage(url: string): Promise<MediaInfo> {
  const html = await fetchHtml(url);
  
  const magnets = findMagnetsWithContext(html);
  const directLinks = extractDirectLinks(html, url);
  
  if (magnets.length === 0 && directLinks.length === 0) {
    throw new Error('No downloadable links found on this page.');
  }

  const formats: MediaFormat[] = [];

  // Add magnets as formats
  magnets.forEach((mag, i) => {
    const uri = mag.uri;
    const name = decodeURIComponent(uri.match(/dn=([^&]+)/)?.[1] || '').replace(/\+/g, ' ');
    
    // 1. Extract quality from name
    const qualityMatch = name.match(/\b(2160p|1080p|720p|480p|360p|4K|HDR|HEVC|x265|x264|DVDRip)\b/i);
    let quality = qualityMatch ? qualityMatch[0] : 'Magnet';

    // 2. Extract size from surrounding HTML context (200 chars before/after)
    const context = html.substring(Math.max(0, mag.index - 300), Math.min(html.length, mag.index + uri.length + 300));
    const sizeMatch = context.match(/(\d+\.?\d*)\s*(GB|MB|GiB|MiB)/i);
    const sizeStr = sizeMatch ? `[${sizeMatch[1]} ${sizeMatch[2].toUpperCase()}]` : '';

    formats.push({
      id: uri,
      ext: 'mkv',
      quality: `${sizeStr} ${quality}`.trim() + (name ? ` - ${name.substring(0, 35)}...` : ` #${i+1}`),
      filesize: sizeMatch ? parseSize(sizeMatch[1], sizeMatch[2]) : null,
      type: 'video',
      isCombined: true
    });
  });

  // Add direct links
  directLinks.forEach((link, i) => {
    const ext = link.split('.').pop()?.toLowerCase() || 'mp4';
    formats.push({
      id: `direct-${i}`,
      ext,
      quality: 'Direct Link',
      filesize: null,
      type: 'video',
      isCombined: true,
      directUrl: link
    });
  });

  return {
    title: extractTitle(html) || 'Forum Links',
    thumbnail: '',
    thumbnails: [],
    duration: 0,
    platform: 'forum',
    uploader: 'Forum Scraper',
    description: `Extracted ${magnets.length} magnets and ${directLinks.length} direct links.`,
    formats,
    url,
    isImage: false
  };
}

function fetchHtml(url: string, redirects = 0): Promise<string> {
  if (redirects > 5) throw new Error('Too many redirects');

  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const req = client.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    }, (res) => {
      // Handle Redirects
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        let nextUrl = res.headers.location;
        if (nextUrl.startsWith('/')) {
          const u = new URL(url);
          nextUrl = `${u.origin}${nextUrl}`;
        }
        return fetchHtml(nextUrl, redirects + 1).then(resolve).catch(reject);
      }

      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.setTimeout(15000, () => {
      req.destroy();
      reject(new Error('Timeout fetching page'));
    });
  });
}

function parseSize(num: string, unit: string): number {
  const val = parseFloat(num);
  const u = unit.toUpperCase();
  if (u.includes('GB') || u.includes('GIB')) return val * 1024 * 1024 * 1024;
  if (u.includes('MB') || u.includes('MIB')) return val * 1024 * 1024;
  return val;
}

function findMagnetsWithContext(html: string): { uri: string; index: number }[] {
  const regex = /magnet:\?xt=urn:[a-zA-Z0-9:]+(&[a-zA-Z0-9%=&._-]+)*/g;
  const results: { uri: string; index: number }[] = [];
  let m;
  const seen = new Set<string>();

  while ((m = regex.exec(html)) !== null) {
    if (!seen.has(m[0])) {
      results.push({ uri: m[0], index: m.index });
      seen.add(m[0]);
    }
  }
  return results;
}

function extractDirectLinks(html: string, baseUrl: string): string[] {
  // 1. Look for direct media files (.mp4, .mkv, etc.)
  const fileRegex = /href="([^"]+\.(mp4|mkv|mov|avi|wmv|ts))"/gi;
  const matches = [];
  let m;
  while ((m = fileRegex.exec(html)) !== null) {
    let link = m[1];
    if (link.startsWith('/')) {
      const urlObj = new URL(baseUrl);
      link = `${urlObj.origin}${link}`;
    }
    matches.push(link);
  }

  // 2. Look for common file hosting links (PixelDrain, MultiUp, GDTot, etc.)
  const hostRegex = /href="(https?:\/\/(?:pixeldrain\.com|multiup\.org|gdtot\.[^/]+|doodstream\.com|streamtape\.com|voe\.sx)\/[^"]+)"/gi;
  while ((m = hostRegex.exec(html)) !== null) {
    matches.push(m[1]);
  }

  return Array.from(new Set(matches));
}

function extractTitle(html: string): string | null {
  const match = html.match(/<title>([^<]+)<\/title>/i);
  return match ? match[1].trim() : null;
}
