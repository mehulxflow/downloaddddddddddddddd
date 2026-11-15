/**
 * Pure TypeScript AES-128-CBC Decryptor & Stream/PDF/YouTube URL Resolver
 * Supports both Study ROOM (KGS / PWThor / Firebase RTDB) and Sachin Academy streams.
 * Works synchronously in both Browser and Node.js environments.
 */

const AES_KEY_STR = '638udh3829162018';
const DEFAULT_IV_STR = 'fedcba9876543210';

export const STREAM_PROXY_PREFIX = 'https://desimaxx.adityalkkumar4321.workers.dev/?url=';
export const PDF_VIEWER_PREFIX = 'https://pdfweb.classx.co.in/pdfjs/web/viewer-new.html?file=';

// Standard AES S-Box and Inverse S-Box
const SBOX = new Uint8Array([
  0x63, 0x7c, 0x77, 0x7b, 0xf2, 0x6b, 0x6f, 0xc5, 0x30, 0x01, 0x67, 0x2b, 0xfe, 0xd7, 0xab, 0x76,
  0xca, 0x82, 0xc9, 0x7d, 0xfa, 0x59, 0x47, 0xf0, 0xad, 0xd4, 0xa2, 0xaf, 0x9c, 0xa4, 0x72, 0xc0,
  0xb7, 0xfd, 0x93, 0x26, 0x36, 0x3f, 0xf7, 0xcc, 0x34, 0xa5, 0xe5, 0xf1, 0x71, 0xd8, 0x31, 0x15,
  0x04, 0xc7, 0x23, 0xc3, 0x18, 0x96, 0x05, 0x9a, 0x07, 0x12, 0x80, 0xe2, 0xeb, 0x27, 0xb2, 0x75,
  0x09, 0x83, 0x2c, 0x1a, 0x1b, 0x6e, 0x5a, 0xa0, 0x52, 0x3b, 0xd6, 0xb3, 0x29, 0xe3, 0x2f, 0x84,
  0x53, 0xd1, 0x00, 0xed, 0x20, 0xfc, 0xb1, 0x5b, 0x6a, 0xcb, 0xbe, 0x39, 0x4a, 0x4c, 0x58, 0xcf,
  0xd0, 0xef, 0xaa, 0xfb, 0x43, 0x4d, 0x33, 0x85, 0x45, 0xf9, 0x02, 0x7f, 0x50, 0x3c, 0x9f, 0xa8,
  0x51, 0xa3, 0x40, 0x8f, 0x92, 0x9d, 0x38, 0xf5, 0xbc, 0xb6, 0xda, 0x21, 0x10, 0xff, 0xf3, 0xd2,
  0xcd, 0x0c, 0x13, 0xec, 0x5f, 0x97, 0x44, 0x17, 0xc4, 0xa7, 0x7e, 0x3d, 0x64, 0x5d, 0x19, 0x73,
  0x60, 0x81, 0x4f, 0xdc, 0x22, 0x2a, 0x90, 0x88, 0x46, 0xee, 0xb8, 0x14, 0xde, 0x5e, 0x0b, 0xdb,
  0xe0, 0x32, 0x3a, 0x0a, 0x49, 0x06, 0x24, 0x5c, 0xc2, 0xd3, 0xac, 0x62, 0x91, 0x95, 0xe4, 0x79,
  0xe7, 0xc8, 0x37, 0x6d, 0x8d, 0xd5, 0x4e, 0xa9, 0x6c, 0x56, 0xf4, 0xea, 0x65, 0x7a, 0xae, 0x08,
  0xba, 0x78, 0x25, 0x2e, 0x1c, 0xa6, 0xb4, 0xc6, 0xe8, 0xdd, 0x74, 0x1f, 0x4b, 0xbd, 0x8b, 0x8a,
  0x70, 0x3e, 0xb5, 0x66, 0x48, 0x03, 0xf6, 0x0e, 0x61, 0x35, 0x57, 0xb9, 0x86, 0xc1, 0x1d, 0x9e,
  0xe1, 0xf8, 0x98, 0x11, 0x69, 0xd9, 0x8e, 0x94, 0x9b, 0x1e, 0x87, 0xe9, 0xce, 0x55, 0x28, 0xdf,
  0x8c, 0xa1, 0x89, 0x0d, 0xbf, 0xe6, 0x42, 0x68, 0x41, 0x99, 0x2d, 0x0f, 0xb0, 0x54, 0xbb, 0x16,
]);

const INV_SBOX = new Uint8Array([
  0x52, 0x09, 0x6a, 0xd5, 0x30, 0x36, 0xa5, 0x38, 0xbf, 0x40, 0xa3, 0x9e, 0x81, 0xf3, 0xd7, 0xfb,
  0x7c, 0xe3, 0x39, 0x82, 0x9b, 0x2f, 0xff, 0x87, 0x34, 0x8e, 0x43, 0x44, 0xc4, 0xde, 0xe9, 0xcb,
  0x54, 0x7b, 0x94, 0x32, 0xa6, 0xc2, 0x23, 0x3d, 0xee, 0x4c, 0x95, 0x0b, 0x42, 0xfa, 0xc3, 0x4e,
  0x08, 0x2e, 0xa1, 0x66, 0x28, 0xd9, 0x24, 0xb2, 0x76, 0x5b, 0xa2, 0x49, 0x6d, 0x8b, 0xd1, 0x25,
  0x72, 0xf8, 0xf6, 0x64, 0x86, 0x68, 0x98, 0x16, 0xd4, 0xa4, 0x5c, 0xcc, 0x5d, 0x65, 0xb6, 0x92,
  0x6c, 0x70, 0x48, 0x50, 0xfd, 0xed, 0xb9, 0xda, 0x5e, 0x15, 0x46, 0x57, 0xa7, 0x8d, 0x9d, 0x84,
  0x90, 0xd8, 0xab, 0x00, 0x8c, 0xbc, 0xd3, 0x0a, 0xf7, 0xe4, 0x58, 0x05, 0xb8, 0xb3, 0x45, 0x06,
  0xd0, 0x2c, 0x1e, 0x8f, 0xca, 0x3f, 0x0f, 0x02, 0xc1, 0xaf, 0xbd, 0x03, 0x01, 0x13, 0x8a, 0x6b,
  0x3a, 0x91, 0x11, 0x41, 0x4f, 0x67, 0xdc, 0xea, 0x97, 0xf2, 0xcf, 0xce, 0xf0, 0xb4, 0xe6, 0x73,
  0x96, 0xac, 0x74, 0x22, 0xe7, 0xad, 0x35, 0x85, 0xe2, 0xf9, 0x37, 0xe8, 0x1c, 0x75, 0xdf, 0x6e,
  0x47, 0xf1, 0x1a, 0x71, 0x1d, 0x29, 0xc5, 0x89, 0x6f, 0xb7, 0x62, 0x0e, 0xaa, 0x18, 0xbe, 0x1b,
  0xfc, 0x56, 0x3e, 0x4b, 0xc6, 0xd2, 0x79, 0x20, 0x9a, 0xdb, 0xc0, 0xfe, 0x78, 0xcd, 0x5a, 0xf4,
  0x1f, 0xdd, 0xa8, 0x33, 0x88, 0x07, 0xc7, 0x31, 0xb1, 0x12, 0x10, 0x59, 0x27, 0x80, 0xec, 0x5f,
  0x60, 0x51, 0x7f, 0xa9, 0x19, 0xb5, 0x4a, 0x0d, 0x2d, 0xe5, 0x7a, 0x9f, 0x93, 0xc9, 0x9c, 0xef,
  0xa0, 0xe0, 0x3b, 0x4d, 0xae, 0x2a, 0xf5, 0xb0, 0xc8, 0xeb, 0xbb, 0x3c, 0x83, 0x53, 0x99, 0x61,
  0x17, 0x2b, 0x04, 0x7e, 0xba, 0x77, 0xd6, 0x26, 0xe1, 0x69, 0x14, 0x63, 0x55, 0x21, 0x0c, 0x7d,
]);

const RCON = new Uint8Array([0x00, 0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80, 0x1b, 0x36]);

function gmul(a: number, b: number): number {
  let p = 0;
  for (let i = 0; i < 8; i++) {
    if (b & 1) p ^= a;
    const hiBit = a & 0x80;
    a = (a << 1) & 0xff;
    if (hiBit) a ^= 0x1b;
    b >>= 1;
  }
  return p;
}

function expandKey(key: Uint8Array): Uint8Array {
  const expanded = new Uint8Array(176);
  expanded.set(key);
  let bytesGenerated = 16;
  let rconIter = 1;
  const temp = new Uint8Array(4);

  while (bytesGenerated < 176) {
    for (let i = 0; i < 4; i++) {
      temp[i] = expanded[bytesGenerated - 4 + i];
    }
    if (bytesGenerated % 16 === 0) {
      const t = temp[0];
      temp[0] = SBOX[temp[1]] ^ RCON[rconIter++];
      temp[1] = SBOX[temp[2]];
      temp[2] = SBOX[temp[3]];
      temp[3] = SBOX[t];
    }
    for (let i = 0; i < 4; i++) {
      expanded[bytesGenerated] = expanded[bytesGenerated - 16] ^ temp[i];
      bytesGenerated++;
    }
  }
  return expanded;
}

function aes128DecryptBlock(block: Uint8Array, roundKeys: Uint8Array): Uint8Array {
  const state = new Uint8Array(block);

  const addRoundKey = (round: number) => {
    const offset = round * 16;
    for (let i = 0; i < 16; i++) state[i] ^= roundKeys[offset + i];
  };

  const invShiftRows = () => {
    let t = state[13];
    state[13] = state[9];
    state[9] = state[5];
    state[5] = state[1];
    state[1] = t;
    t = state[2];
    state[2] = state[10];
    state[10] = t;
    t = state[6];
    state[6] = state[14];
    state[14] = t;
    t = state[3];
    state[3] = state[7];
    state[7] = state[11];
    state[11] = state[15];
    state[15] = t;
  };

  const invSubBytes = () => {
    for (let i = 0; i < 16; i++) state[i] = INV_SBOX[state[i]];
  };

  const invMixColumns = () => {
    for (let c = 0; c < 4; c++) {
      const i = c * 4;
      const s0 = state[i], s1 = state[i + 1], s2 = state[i + 2], s3 = state[i + 3];
      state[i] = gmul(s0, 0x0e) ^ gmul(s1, 0x0b) ^ gmul(s2, 0x0d) ^ gmul(s3, 0x09);
      state[i + 1] = gmul(s0, 0x09) ^ gmul(s1, 0x0e) ^ gmul(s2, 0x0b) ^ gmul(s3, 0x0d);
      state[i + 2] = gmul(s0, 0x0d) ^ gmul(s1, 0x09) ^ gmul(s2, 0x0e) ^ gmul(s3, 0x0b);
      state[i + 3] = gmul(s0, 0x0b) ^ gmul(s1, 0x0d) ^ gmul(s2, 0x09) ^ gmul(s3, 0x0e);
    }
  };

  addRoundKey(10);
  for (let round = 9; round >= 1; round--) {
    invShiftRows();
    invSubBytes();
    addRoundKey(round);
    invMixColumns();
  }
  invShiftRows();
  invSubBytes();
  addRoundKey(0);

  return state;
}

function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/[^A-Za-z0-9+/=]/g, '');
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(clean, 'base64'));
  }
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

const utf8Encoder = new TextEncoder();
const utf8Decoder = new TextDecoder();
const ROUND_KEYS = expandKey(utf8Encoder.encode(AES_KEY_STR));

/**
 * Decrypts AES-128-CBC encrypted URLs from Sachin Academy API (`<cipherB64>:<ivB64>`).
 */
export function decryptSachinUrl(input?: string | null): string {
  if (!input || typeof input !== 'string') return '';
  const trimmed = input.trim();
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
  }

  try {
    let cipherB64 = trimmed;
    let ivStr = DEFAULT_IV_STR;

    if (trimmed.includes(':')) {
      const parts = trimmed.split(':');
      cipherB64 = parts[0];
      if (parts[1]) {
        try {
          const decodedIv = utf8Decoder.decode(base64ToBytes(parts[1]));
          if (decodedIv && decodedIv.length === 16) {
            ivStr = decodedIv;
          }
        } catch {
          ivStr = DEFAULT_IV_STR;
        }
      }
    }

    const cipherBytes = base64ToBytes(cipherB64);
    if (cipherBytes.length === 0 || cipherBytes.length % 16 !== 0) {
      return trimmed;
    }

    const ivBytes = utf8Encoder.encode(ivStr);
    const output = new Uint8Array(cipherBytes.length);
    let prevBlock: Uint8Array<ArrayBufferLike> = ivBytes;

    for (let offset = 0; offset < cipherBytes.length; offset += 16) {
      const block = cipherBytes.subarray(offset, offset + 16);
      const decryptedBlock = aes128DecryptBlock(block, ROUND_KEYS);
      for (let i = 0; i < 16; i++) {
        output[offset + i] = decryptedBlock[i] ^ prevBlock[i];
      }
      prevBlock = block;
    }

    // PKCS#7 unpadding
    const padLen = output[output.length - 1];
    const validPad = padLen >= 1 && padLen <= 16;
    const unpadded = validPad ? output.subarray(0, output.length - padLen) : output;
    const result = utf8Decoder.decode(unpadded).trim();
    return result.length > 0 ? result : trimmed;
  } catch {
    return trimmed;
  }
}

/**
 * Extracts a clean 11-character YouTube Video ID from any YouTube URL format:
 * - https://www.youtube.com/embed/TZ5gUNcOTsw
 * - https://youtu.be/40Ow7aNAQ0w?si=...
 * - https://www.youtube.com/watch?v=TZ5gUNcOTsw
 * - https://www.youtube.com/live/TZ5gUNcOTsw
 */
export function extractYouTubeId(rawUrl?: string | null): string | null {
  if (!rawUrl || typeof rawUrl !== 'string') return null;
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;

  // Match standard YouTube URL patterns
  const patterns = [
    /(?:youtube\.com\/(?:embed|live|shorts|v)\/|youtu\.be\/)([A-Za-z0-9_-]{11})/i,
    /[?&]v=([A-Za-z0-9_-]{11})/i,
  ];
  for (const regex of patterns) {
    const match = trimmed.match(regex);
    if (match && match[1]) {
      return match[1];
    }
  }
  return null;
}

/**
 * Returns a high-quality YouTube thumbnail URL for a given YouTube Video ID.
 */
export function buildYouTubeThumbnailUrl(youtubeId?: string | null): string {
  if (!youtubeId) return '';
  return `https://i.ytimg.com/vi/${youtubeId}/mqdefault.jpg`;
}

/**
 * Resolves and cleans a PDF URL (decrypts AES-128-CBC and unwraps ?file= or ?url= if wrapped).
 * Handles both Sachin Academy encrypted PDFs and Study ROOM (`sahukgs.vercel.app/view-pdf?url=...`) PDFs.
 */
export function resolvePdfUrl(rawPdfLink?: string | null): string {
  if (!rawPdfLink || typeof rawPdfLink !== 'string') return '';
  const decrypted = decryptSachinUrl(rawPdfLink.trim());
  if (decrypted.includes('?file=') || decrypted.includes('&file=') || decrypted.includes('?url=') || decrypted.includes('&url=')) {
    try {
      const parsed = new URL(decrypted);
      const fileParam = parsed.searchParams.get('file') || parsed.searchParams.get('url');
      if (fileParam) return decodeURIComponent(fileParam);
    } catch {
      const match = decrypted.match(/[?&](?:file|url)=([^&]+)/);
      if (match && match[1]) return decodeURIComponent(match[1]);
    }
  }
  return decrypted;
}

/**
 * Wraps a raw decrypted PDF URL in the ClassX PDF.js web viewer URL.
 */
export function buildPdfViewerUrl(cleanPdfUrl?: string | null): string {
  if (!cleanPdfUrl) return '';
  return `${PDF_VIEWER_PREFIX}${encodeURIComponent(cleanPdfUrl)}`;
}

/**
 * Wraps a decrypted HLS/MP4 stream URL in the Cloudflare stream proxy for CORS-free playback.
 * Note: Akamai KGS direct MP4 streams (`kgs-v2.akamaized.net`) and Google Cloud Storage streams support direct playback.
 */
export function buildProxiedStreamUrl(rawStreamUrl?: string | null): string {
  if (!rawStreamUrl) return '';
  if (rawStreamUrl.startsWith(STREAM_PROXY_PREFIX)) return rawStreamUrl;
  return `${STREAM_PROXY_PREFIX}${encodeURIComponent(rawStreamUrl)}`;
}

export interface StreamQualityOption {
  label: string;
  url: string;
  proxiedUrl: string;
  isM3u8: boolean;
}

export function normalizeQualityLabel(raw?: string): string {
  if (!raw) return 'Standard';
  const match = raw.match(/(\d+p)/i);
  if (match) return match[1].toLowerCase();
  const numOnly = raw.trim().match(/^(\d{3,4})$/);
  if (numOnly) return `${numOnly[1]}p`;
  const lower = raw.toLowerCase();
  if (lower.includes('fhd') || lower.includes('1080')) return '1080p';
  if (lower.includes('hd') || lower.includes('high') || lower.includes('720')) return '720p';
  if (lower.includes('med') || lower.includes('480')) return '480p';
  if (lower.includes('low') || lower.includes('240')) return '240p';
  return raw.trim();
}

/**
 * Infers resolution label from a direct MP4/M3U8 URL (e.g. `.../320p/..._360p878kbs.mp4` -> `360p`).
 */
function inferResolutionFromUrl(url: string, fallback = '360p'): string {
  const match = url.match(/(?:_|\/)(240p|360p|480p|720p|1080p)/i);
  if (match && match[1]) return match[1].toLowerCase();
  return fallback;
}

/**
 * Extracts and decrypts all playable direct stream quality options (MP4 / M3U8) from a Lecture object.
 * Supports both Study ROOM (`videoLink2`, `videoLink`) and Sachin Academy (`download_links`, `livestream_links`, `file_link`).
 */
export function extractStreamQualities(lecture: {
  download_links?: Array<{ quality?: string; bitrate?: string; path?: string; backup_url?: string; backup_url2?: string }>;
  livestream_links?: Array<{ quality?: string; path?: string }>;
  file_link?: string;
  download_link?: string;
  videoLink?: string;
  videoLink2?: string;
}): StreamQualityOption[] {
  const map = new Map<string, StreamQualityOption>();

  // 1. Check Study ROOM direct stream links (`videoLink2` and non-YouTube `videoLink`)
  const studyRoomCandidates = [
    { raw: lecture.videoLink2, defaultLabel: '360p' },
    { raw: lecture.videoLink, defaultLabel: '480p' },
  ];
  for (const cand of studyRoomCandidates) {
    if (!cand.raw || typeof cand.raw !== 'string') continue;
    const url = decryptSachinUrl(cand.raw.trim());
    if (!url.startsWith('http')) continue;
    // Skip YouTube links here — YouTube links are handled by the in-app YouTube engine in VideoPlayerView
    if (extractYouTubeId(url)) continue;

    const label = inferResolutionFromUrl(url, cand.defaultLabel);
    const isM3u8 = url.includes('.m3u8');
    // Direct MP4 streams on kgs-v2.akamaized.net play directly with high speed; keep proxiedUrl as fallback
    const isDirectCdnMp4 =
      url.includes('akamaized.net') ||
      url.includes('commondatastorage.googleapis.com') ||
      url.includes('pw.live') ||
      url.includes('penpencil');
    map.set(label, {
      label,
      url,
      proxiedUrl: isDirectCdnMp4 ? url : buildProxiedStreamUrl(url),
      isM3u8,
    });
  }

  // 2. Check Sachin Academy multi-quality `download_links`
  if (Array.isArray(lecture.download_links) && lecture.download_links.length > 0) {
    for (const item of lecture.download_links) {
      const rawPath = item.path || item.backup_url || item.backup_url2;
      if (rawPath) {
        const url = decryptSachinUrl(rawPath);
        if (url && url.startsWith('http') && !extractYouTubeId(url)) {
          const label = normalizeQualityLabel(item.quality || item.bitrate || 'Standard');
          const isM3u8 = url.includes('.m3u8');
          if (!map.has(label) || (!map.get(label)!.isM3u8 && isM3u8)) {
            map.set(label, {
              label,
              url,
              proxiedUrl: buildProxiedStreamUrl(url),
              isM3u8,
            });
          }
        }
      }
    }
  }

  // 3. Check `livestream_links`
  if (map.size === 0 && Array.isArray(lecture.livestream_links) && lecture.livestream_links.length > 0) {
    for (const item of lecture.livestream_links) {
      if (item.path) {
        const url = decryptSachinUrl(item.path);
        if (url && url.startsWith('http') && !extractYouTubeId(url)) {
          const label = normalizeQualityLabel(item.quality || 'Live');
          if (!map.has(label)) {
            map.set(label, {
              label,
              url,
              proxiedUrl: buildProxiedStreamUrl(url),
              isM3u8: url.includes('.m3u8'),
            });
          }
        }
      }
    }
  }

  // 4. Check fallback `file_link` or `download_link`
  if (map.size === 0) {
    const fallbackRaw = lecture.file_link || lecture.download_link;
    if (fallbackRaw) {
      const url = decryptSachinUrl(fallbackRaw);
      if (url && url.startsWith('http') && !extractYouTubeId(url)) {
        const isDirectCdnMp4 =
          url.includes('akamaized.net') ||
          url.includes('commondatastorage.googleapis.com');
        map.set('360p', {
          label: '360p',
          url,
          proxiedUrl: isDirectCdnMp4 ? url : buildProxiedStreamUrl(url),
          isM3u8: url.includes('.m3u8'),
        });
      }
    }
  }

  const options = Array.from(map.values());
  const parseRes = (label: string) => {
    const num = parseInt(label.replace(/\D/g, ''), 10);
    return isNaN(num) ? 0 : num;
  };
  options.sort((a, b) => parseRes(b.label) - parseRes(a.label));
  return options;
}

/**
 * Builds a direct attachment download URL for a PDF via the local Express server.
 */
export function buildPdfDownloadUrl(cleanPdfUrl?: string | null, title?: string): string {
  if (!cleanPdfUrl) return '';
  return `/api/download/pdf?url=${encodeURIComponent(cleanPdfUrl)}&title=${encodeURIComponent(
    title || 'Study_ROOM_Notes'
  )}`;
}

/**
 * Parses an HLS .m3u8 manifest and returns ordered segment or variant URLs.
 */
export function parseM3u8Segments(manifestText: string, baseManifestUrl: string): {
  isMasterPlaylist: boolean;
  urls: string[];
} {
  const lines = manifestText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const isMaster = lines.some((l) => l.startsWith('#EXT-X-STREAM-INF'));
  const urls: string[] = [];

  const resolveUrl = (line: string): string => {
    if (line.startsWith('http://') || line.startsWith('https://')) {
      return line;
    }
    try {
      return new URL(line, baseManifestUrl).toString();
    } catch {
      return line;
    }
  };

  for (const line of lines) {
    if (line.startsWith('#')) continue;
    urls.push(resolveUrl(line));
  }

  return {
    isMasterPlaylist: isMaster,
    urls,
  };
}

/**
 * Returns standard HLS bandwidth and resolution metadata for a quality label.
 */
export function getResolutionMetadata(label: string): {
  height: number;
  width: number;
  bandwidth: number;
  averageBandwidth: number;
} {
  const num = parseInt(label.replace(/\D/g, ''), 10);
  switch (num) {
    case 240:
      return { width: 426, height: 240, bandwidth: 280000, averageBandwidth: 240000 };
    case 360:
      return { width: 640, height: 360, bandwidth: 420000, averageBandwidth: 350000 };
    case 480:
      return { width: 854, height: 480, bandwidth: 680000, averageBandwidth: 560000 };
    case 720:
      return { width: 1280, height: 720, bandwidth: 1250000, averageBandwidth: 980000 };
    case 1080:
      return { width: 1920, height: 1080, bandwidth: 2400000, averageBandwidth: 1950000 };
    default:
      return { width: 640, height: 360, bandwidth: 420000, averageBandwidth: 350000 };
  }
}

/**
 * Builds a synthetic multi-bitrate HLS Master Playlist (#EXTM3U) combining all available
 * m3u8 quality variants sorted from lowest (240p) to highest (1080p) resolution.
 */
export function buildMasterM3u8Content(
  qualities: StreamQualityOption[],
  useDirectStream = false
): string {
  const m3u8Qualities = qualities.filter((q) => q.isM3u8);
  if (m3u8Qualities.length === 0) return '';

  const sortedAsc = [...m3u8Qualities].sort((a, b) => {
    const resA = getResolutionMetadata(a.label).height;
    const resB = getResolutionMetadata(b.label).height;
    return resA - resB;
  });

  const lines: string[] = ['#EXTM3U', '#EXT-X-VERSION:3', '#EXT-X-INDEPENDENT-SEGMENTS'];

  for (const item of sortedAsc) {
    const meta = getResolutionMetadata(item.label);
    const targetUrl = useDirectStream ? item.url : item.proxiedUrl;
    lines.push(
      `#EXT-X-STREAM-INF:BANDWIDTH=${meta.bandwidth},AVERAGE-BANDWIDTH=${meta.averageBandwidth},RESOLUTION=${meta.width}x${meta.height},NAME="${item.label}"`
    );
    lines.push(targetUrl);
  }

  return lines.join('\n') + '\n';
}

export interface StreamCandidateLecture {
  download_links?: Array<{ quality?: string; bitrate?: string; path?: string; backup_url?: string; backup_url2?: string }>;
  livestream_links?: Array<{ quality?: string; path?: string }>;
  file_link?: string;
  download_link?: string;
  videoLink?: string;
  videoLink2?: string;
}

/**
 * Selects the single highest available resolution stream option (e.g. 1080p > 720p > 480p > 360p > 240p).
 */
export function pickHighestQualityStream(lecture: StreamCandidateLecture | null | undefined): StreamQualityOption | null {
  if (!lecture || typeof lecture !== 'object') return null;
  const qualities = extractStreamQualities(lecture);
  if (qualities.length > 0) {
    return qualities[0];
  }
  return null;
}

/**
 * Returns all playable stream URLs ordered strictly from highest available quality to lowest,
 * appending decrypted fallback links (`download_link`, `file_link`, `videoLink2`, `videoLink`) at the end.
 */
export function getOrderedStreamQualityUrls(lecture: StreamCandidateLecture | null | undefined): string[] {
  if (!lecture || typeof lecture !== 'object') return [];
  const seen = new Set<string>();
  const ordered: string[] = [];

  const qualities = extractStreamQualities(lecture);
  for (const q of qualities) {
    if (q.url && !seen.has(q.url)) {
      seen.add(q.url);
      ordered.push(q.url);
    }
  }

  const rawCandidates = [
    lecture.download_link,
    lecture.file_link,
    lecture.videoLink2,
    lecture.videoLink,
  ];
  for (const raw of rawCandidates) {
    if (!raw || typeof raw !== 'string') continue;
    const dec = decryptSachinUrl(raw.trim());
    if (
      (dec.startsWith('http://') || dec.startsWith('https://')) &&
      !extractYouTubeId(dec) &&
      !seen.has(dec)
    ) {
      seen.add(dec);
      ordered.push(dec);
    }
  }

  return ordered;
}

/**
 * Selects the highest resolution / highest bandwidth variant URL from an HLS Master Playlist (#EXT-X-STREAM-INF).
 * Returns null if the manifest is not a master playlist or contains no variants.
 */
export function selectHighestHlsVariant(manifestText: string, baseManifestUrl: string): string | null {
  const lines = manifestText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const isMaster = lines.some((l) => l.startsWith('#EXT-X-STREAM-INF'));
  if (!isMaster) return null;

  const resolveVariantUrl = (line: string): string => {
    const clean = line.startsWith(STREAM_PROXY_PREFIX)
      ? decodeURIComponent(line.slice(STREAM_PROXY_PREFIX.length))
      : line;
    if (clean.startsWith('http://') || clean.startsWith('https://')) {
      return clean;
    }
    try {
      return new URL(clean, baseManifestUrl).toString();
    } catch {
      return clean;
    }
  };

  interface HlsVariant {
    url: string;
    height: number;
    bandwidth: number;
    index: number;
  }

  const variants: HlsVariant[] = [];
  let pendingInfo: string | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('#EXT-X-STREAM-INF')) {
      pendingInfo = line;
      continue;
    }
    if (line.startsWith('#')) {
      continue;
    }

    const resolvedUrl = resolveVariantUrl(line);
    let height = 0;
    let bandwidth = 0;

    if (pendingInfo) {
      const resMatch = pendingInfo.match(/RESOLUTION\s*=\s*(\d+)x(\d+)/i);
      if (resMatch && resMatch[2]) {
        height = parseInt(resMatch[2], 10) || 0;
      }
      if (!height) {
        const nameMatch = pendingInfo.match(/NAME\s*=\s*"?(\d{3,4})p"?/i);
        if (nameMatch && nameMatch[1]) {
          height = parseInt(nameMatch[1], 10) || 0;
        }
      }
      const bwMatch = pendingInfo.match(/(?:^|[,:])BANDWIDTH\s*=\s*(\d+)/i);
      if (bwMatch && bwMatch[1]) {
        bandwidth = parseInt(bwMatch[1], 10) || 0;
      }
    }

    if (!height) {
      const urlResMatch = resolvedUrl.match(/(?:_|\/|=)(\d{3,4})p(?:[\/.?&_]|$)/i);
      if (urlResMatch && urlResMatch[1]) {
        height = parseInt(urlResMatch[1], 10) || 0;
      }
    }

    variants.push({
      url: resolvedUrl,
      height,
      bandwidth,
      index: variants.length,
    });
    pendingInfo = null;
  }

  if (variants.length === 0) return null;

  variants.sort((a, b) => {
    if (b.height !== a.height) return b.height - a.height;
    if (b.bandwidth !== a.bandwidth) return b.bandwidth - a.bandwidth;
    return a.index - b.index;
  });

  return variants[0].url;
}

/**
 * Returns a distinctive subject emoji for a given subject name (e.g. Math -> 📐, Hindi -> 📕, CDP -> 🧠).
 */
export function getSubjectTopicEmoji(subjectName?: string | null): string {
  const s = String(subjectName || '').toLowerCase();
  if (s.includes('math') || s.includes('गणित') || s.includes('quant') || s.includes('arithmetic')) {
    return '📐';
  }
  if (s.includes('hindi') || s.includes('हिंदी') || s.includes('हिन्दी')) {
    return '📕';
  }
  if (s.includes('cdp') || s.includes('child') || s.includes('pedagogy') || s.includes('बाल विकास') || s.includes('teaching')) {
    return '🧠';
  }
  if (s.includes('evs') || s.includes('environment') || s.includes('पर्यावरण') || s.includes('ecology')) {
    return '🌿';
  }
  if (s.includes('english') || s.includes('अंग्रेजी')) {
    return '📘';
  }
  if (s.includes('sanskrit') || s.includes('संस्कृत') || s.includes('urdu')) {
    return '🕉️';
  }
  if (s.includes('reasoning') || s.includes('रजिनीग') || s.includes('रीजनिंग') || s.includes('logical')) {
    return '🧩';
  }
  if (s.includes('physics') || s.includes('chemistry') || s.includes('biology') || s.includes('science') || s.includes('विज्ञान')) {
    return '🔬';
  }
  if (s.includes('history') || s.includes('इतिहास') || s.includes('inm')) {
    return '🏛️';
  }
  if (s.includes('geography') || s.includes('भूगोल') || s.includes('sst') || s.includes('social')) {
    return '🌍';
  }
  if (s.includes('polity') || s.includes('संविधान') || s.includes('governance')) {
    return '⚖️';
  }
  if (s.includes('econom') || s.includes('अर्थशास्त्र')) {
    return '💹';
  }
  if (s.includes('current') || s.includes('gk') || s.includes('bihar') || s.includes('static')) {
    return '📰';
  }
  if (s.includes('timetable') || s.includes('syllabus') || s.includes('intro') || s.includes('orientation')) {
    return '📋';
  }
  return '📚';
}

/**
 * Builds a clean, searchable Telegram hashtag from a Subject or Batch name.
 * Example: "Math's (Paper -1)" -> "#Maths_Paper_1"
 */
export function buildSubjectHashtag(rawText?: string | null): string {
  const raw = String(rawText || '').trim();
  if (!raw) return '#Lecture';
  // Remove apostrophes so "Math's" becomes "Maths"
  const withoutQuotes = raw.replace(/['’`]/g, '');
  // Keep letters (including Devanagari/Unicode letters & marks), numbers, and replace separators with underscore
  const cleaned = withoutQuotes
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');
  if (!cleaned) return '#Lecture';
  // Ensure hashtag starts with a letter or word char if numeric
  const safe = /^\d/.test(cleaned) ? `Topic_${cleaned}` : cleaned;
  return `#${safe.slice(0, 48)}`;
}

/**
 * Builds a Telegram Forum Topic title (max 120 chars as required by Telegram API).
 * Example: ("Math's (Paper -1)", "[SACHIN] CTET PAPER - 1 COURSE*") -> "📐 Math's (Paper -1)"
 */
export function buildTelegramTopicTitle(
  subjectName?: string | null,
  batchName?: string | null,
  includeBatchShort = false
): string {
  const cleanSub = String(subjectName || 'General Subject').trim() || 'General Subject';
  const emoji = getSubjectTopicEmoji(cleanSub);
  const alreadyHasEmoji = /^[\p{Emoji_Presentation}\p{Extended_Pictographic}]/u.test(cleanSub);
  const baseTitle = alreadyHasEmoji ? cleanSub : `${emoji} ${cleanSub}`;

  if (!includeBatchShort || !batchName) {
    return baseTitle.slice(0, 120);
  }
  const cleanBatch = String(batchName)
    .replace(/^\[.*?\]\s*/, '')
    .replace(/\*+$/g, '')
    .trim();
  const combined = cleanBatch ? `${baseTitle} • ${cleanBatch}` : baseTitle;
  return combined.slice(0, 120);
}

export interface TelegramCaptionOptions {
  batchName: string;
  subjectName?: string;
  topicName?: string;
  lectureName: string;
  lectureIndex?: number;
}

/**
 * Builds a structured, topic-tagged Telegram caption for a video or PDF lecture.
 */
export function buildTelegramLectureCaption(opts: TelegramCaptionOptions): string {
  const batchName = String(opts.batchName || 'Batch').trim();
  const subjectName = String(opts.subjectName || '').trim();
  const topicName = String(opts.topicName || '').trim();
  const rawLecture = String(opts.lectureName || 'Lecture').trim();

  // Strip redundant subject/topic prefix from lectureName if already present
  let cleanLectureTitle = rawLecture;
  if (subjectName && topicName) {
    const prefix = `${subjectName} (${topicName}) - `;
    if (cleanLectureTitle.startsWith(prefix)) {
      cleanLectureTitle = cleanLectureTitle.slice(prefix.length).trim();
    }
  }
  if (subjectName) {
    const subPrefix = `${subjectName} - `;
    if (cleanLectureTitle.startsWith(subPrefix)) {
      cleanLectureTitle = cleanLectureTitle.slice(subPrefix.length).trim();
    }
  }

  const lines: string[] = [];
  if (subjectName) {
    const emoji = getSubjectTopicEmoji(subjectName);
    lines.push(`📂 **Topic / Subject:** ${emoji} ${subjectName}`);
  }
  if (topicName && topicName.toLowerCase() !== subjectName.toLowerCase()) {
    lines.push(`📖 **Chapter:** ${topicName}`);
  }
  const idxLabel =
    typeof opts.lectureIndex === 'number' && opts.lectureIndex > 0
      ? ` #${opts.lectureIndex}`
      : '';
  lines.push(`🎬 **Lecture${idxLabel}:** ${cleanLectureTitle}`);
  lines.push(`📁 **Batch:** ${batchName}`);

  const tags: string[] = [];
  if (subjectName) tags.push(buildSubjectHashtag(subjectName));
  if (topicName && topicName.toLowerCase() !== subjectName.toLowerCase()) {
    const topTag = buildSubjectHashtag(topicName);
    if (!tags.includes(topTag)) tags.push(topTag);
  }
  const batchTag = buildSubjectHashtag(batchName.replace(/^\[.*?\]\s*/, ''));
  if (!tags.includes(batchTag)) tags.push(batchTag);

  if (tags.length > 0) {
    lines.push(`🏷️ ${tags.join(' ')}`);
  }

  return lines.join('\n');
}


