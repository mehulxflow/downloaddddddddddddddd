import {
  extractStreamQualities,
  parseM3u8Segments,
  resolvePdfUrl,
  buildPdfDownloadUrl,
  type StreamQualityOption,
} from '../utils/crypto';
import { type LectureItem } from '../utils/formatters';
import { fetchVideoDetails } from './api';

export interface DownloadedItemRecord {
  id: string;
  courseId: string;
  batchName?: string;
  subjectName?: string;
  topicName?: string;
  lecture: LectureItem;
  quality: string;
  type: 'video' | 'pdf';
  status: 'downloading' | 'completed' | 'error';
  progressPercent: number;
  downloadedBytes: number;
  totalSegments: number;
  completedSegments: number;
  savedAt: string;
  pdfUrl?: string;
  streamUrl?: string;
  hasOfflineBlob?: boolean;
  errorMessage?: string;
}

const DOWNLOADS_META_KEY = 'sachin_downloaded_items_v1';
const DB_NAME = 'sachin_offline_media_db';
const STORE_NAME = 'videos';

type Listener = (items: DownloadedItemRecord[]) => void;
const listeners = new Set<Listener>();
const activeControllers = new Map<string, AbortController>();

function readRecords(): DownloadedItemRecord[] {
  try {
    const raw = localStorage.getItem(DOWNLOADS_META_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

let recordsState: DownloadedItemRecord[] = readRecords();

function saveRecords(next: DownloadedItemRecord[]) {
  recordsState = next;
  try {
    localStorage.setItem(DOWNLOADS_META_KEY, JSON.stringify(next));
  } catch {
    // ignore storage errors
  }
  listeners.forEach((fn) => fn([...recordsState]));
}

export function getDownloadedItems(): DownloadedItemRecord[] {
  return [...recordsState];
}

export function subscribeDownloads(listener: Listener): () => void {
  listeners.add(listener);
  listener([...recordsState]);
  return () => {
    listeners.delete(listener);
  };
}

function openMediaDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveVideoBlobToIdb(id: string, blob: Blob): Promise<void> {
  try {
    const db = await openMediaDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(blob, id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // ignore IDB quota errors
  }
}

export async function getVideoBlobFromIdb(id: string): Promise<Blob | null> {
  try {
    const db = await openMediaDb();
    return await new Promise<Blob | null>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(id);
      req.onsuccess = () => resolve((req.result as Blob) || null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

export async function removeDownloadedItem(id: string): Promise<void> {
  const ctrl = activeControllers.get(id);
  if (ctrl) {
    ctrl.abort();
    activeControllers.delete(id);
  }
  saveRecords(recordsState.filter((r) => r.id !== id));
  try {
    const db = await openMediaDb();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(id);
  } catch {
    // ignore
  }
}

function updateItem(id: string, patch: Partial<DownloadedItemRecord>) {
  const next = recordsState.map((item) =>
    item.id === id ? { ...item, ...patch } : item
  );
  saveRecords(next);
}

export function triggerBrowserBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/**
 * Downloads a PDF Handout directly to the phone/PC and adds it to the Downloads tab.
 */
export function downloadLecturePdf(params: {
  courseId: string;
  batchName?: string;
  subjectName?: string;
  topicName?: string;
  lecture: LectureItem;
}): void {
  const rawPdf = params.lecture.pdf_link || params.lecture.pdf_link2 || '';
  const cleanPdf = resolvePdfUrl(rawPdf);
  if (!cleanPdf) return;

  const id = `pdf_${params.lecture.id}`;
  const record: DownloadedItemRecord = {
    id,
    courseId: params.courseId,
    batchName: params.batchName,
    subjectName: params.subjectName,
    topicName: params.topicName,
    lecture: params.lecture,
    quality: 'PDF Notes',
    type: 'pdf',
    status: 'completed',
    progressPercent: 100,
    downloadedBytes: 0,
    totalSegments: 1,
    completedSegments: 1,
    savedAt: new Date().toISOString(),
    pdfUrl: cleanPdf,
  };

  const existing = recordsState.filter((r) => r.id !== id);
  saveRecords([record, ...existing]);

  const downloadUrl = buildPdfDownloadUrl(cleanPdf, params.lecture.Title || 'Class_Notes');
  const iframe = document.createElement('iframe');
  iframe.style.display = 'none';
  iframe.src = downloadUrl;
  document.body.appendChild(iframe);
  setTimeout(() => {
    if (iframe.parentNode) {
      iframe.parentNode.removeChild(iframe);
    }
  }, 15000);
}

/**
 * Downloads a Lecture Video stream (HLS segments -> playable video file + offline IndexedDB cache).
 */
export async function startLectureVideoDownload(params: {
  courseId: string;
  batchName?: string;
  subjectName?: string;
  topicName?: string;
  lecture: LectureItem;
  qualityLabel?: string;
  maxSegmentsLimit?: number;
}): Promise<void> {
  const id = `video_${params.lecture.id}`;
  if (activeControllers.has(id)) {
    return;
  }

  const controller = new AbortController();
  activeControllers.set(id, controller);

  const initialRecord: DownloadedItemRecord = {
    id,
    courseId: params.courseId,
    batchName: params.batchName,
    subjectName: params.subjectName,
    topicName: params.topicName,
    lecture: params.lecture,
    quality: params.qualityLabel || '480p',
    type: 'video',
    status: 'downloading',
    progressPercent: 2,
    downloadedBytes: 0,
    totalSegments: 0,
    completedSegments: 0,
    savedAt: new Date().toISOString(),
  };

  saveRecords([initialRecord, ...recordsState.filter((r) => r.id !== id)]);

  try {
    let fullLecture = params.lecture;
    try {
      const details = await fetchVideoDetails(params.courseId, params.lecture.id);
      if (details) {
        fullLecture = {
          ...params.lecture,
          ...details,
          Title: params.lecture.Title || details.Title,
        };
      }
    } catch {
      // use existing lecture
    }

    const qualities: StreamQualityOption[] = extractStreamQualities(fullLecture);
    if (qualities.length === 0) {
      // Lecture is streamed via In-App YouTube Player — save offline bookmark record & download PDF if attached
      const rawPdf = fullLecture.pdf_link || fullLecture.pdf_link2 || '';
      const cleanPdf = resolvePdfUrl(rawPdf);
      updateItem(id, {
        status: 'completed',
        quality: 'In-App HD',
        progressPercent: 100,
        completedSegments: 1,
        totalSegments: 1,
        lecture: fullLecture,
        pdfUrl: cleanPdf || undefined,
        hasOfflineBlob: false,
      });
      if (cleanPdf) {
        downloadLecturePdf({
          courseId: params.courseId,
          batchName: params.batchName,
          subjectName: params.subjectName,
          topicName: params.topicName,
          lecture: fullLecture,
        });
      }
      return;
    }

    const chosen =
      qualities.find((q) => q.label === params.qualityLabel) ||
      qualities.find((q) => q.label === '480p') ||
      qualities.find((q) => q.label === '360p') ||
      qualities[0];

    updateItem(id, {
      quality: chosen.label,
      streamUrl: chosen.url,
      lecture: fullLecture,
      progressPercent: 5,
    });

    // Case 1: Direct MP4 file (e.g., Study ROOM KGS Akamai .mp4)
    if (!chosen.isM3u8) {
      const mp4Res = await fetch(chosen.proxiedUrl, { signal: controller.signal });
      if (!mp4Res.ok) {
        throw new Error(`MP4 HTTP ${mp4Res.status}`);
      }
      const contentLength = Number(mp4Res.headers.get('content-length') || 0);
      const reader = mp4Res.body?.getReader();
      const chunks: BlobPart[] = [];
      let receivedBytes = 0;

      if (reader) {
        while (true) {
          if (controller.signal.aborted) throw new Error('Download cancelled');
          const { done, value } = await reader.read();
          if (done) break;
          if (value) {
            chunks.push(new Uint8Array(value));
            receivedBytes += value.byteLength;
            const pct =
              contentLength > 0
                ? Math.min(99, Math.max(6, Math.round((receivedBytes / contentLength) * 100)))
                : 50;
            updateItem(id, {
              downloadedBytes: receivedBytes,
              progressPercent: pct,
              totalSegments: 1,
              completedSegments: 0,
            });
          }
        }
      } else {
        const ab = await mp4Res.arrayBuffer();
        chunks.push(ab);
        receivedBytes = ab.byteLength;
      }

      const mp4Blob = new Blob(chunks, { type: 'video/mp4' });
      await saveVideoBlobToIdb(id, mp4Blob);

      updateItem(id, {
        status: 'completed',
        progressPercent: 100,
        totalSegments: 1,
        completedSegments: 1,
        downloadedBytes: receivedBytes,
        hasOfflineBlob: true,
      });

      const cleanTitle = (fullLecture.Title || 'Study_ROOM_Lecture')
        .replace(/[^a-zA-Z0-9_\-\u0900-\u097F ]/g, '_')
        .trim()
        .slice(0, 45);
      triggerBrowserBlobDownload(mp4Blob, `${cleanTitle}_${chosen.label}.mp4`);
      return;
    }

    // Case 2: HLS .m3u8 manifest
    const manifestRes = await fetch(chosen.proxiedUrl, {
      signal: controller.signal,
    });
    if (!manifestRes.ok) {
      throw new Error(`Manifest HTTP ${manifestRes.status}`);
    }
    let manifestText = await manifestRes.text();
    let parsed = parseM3u8Segments(manifestText, chosen.url);

    if (parsed.isMasterPlaylist && parsed.urls.length > 0) {
      const subRes = await fetch(parsed.urls[0], { signal: controller.signal });
      if (subRes.ok) {
        manifestText = await subRes.text();
        parsed = parseM3u8Segments(manifestText, parsed.urls[0]);
      }
    }

    const segmentUrls = parsed.urls;
    if (segmentUrls.length === 0) {
      throw new Error('No video segments found in stream playlist.');
    }

    const targetSegments = params.maxSegmentsLimit
      ? segmentUrls.slice(0, params.maxSegmentsLimit)
      : segmentUrls;

    updateItem(id, {
      totalSegments: targetSegments.length,
      completedSegments: 0,
      progressPercent: 8,
    });

    const buffers: ArrayBuffer[] = new Array(targetSegments.length);
    let completed = 0;
    let totalBytes = 0;

    const concurrency = 4;
    for (let i = 0; i < targetSegments.length; i += concurrency) {
      if (controller.signal.aborted) throw new Error('Download cancelled');
      const batch = targetSegments.slice(i, i + concurrency);
      await Promise.all(
        batch.map(async (segUrl, batchIdx) => {
          const segIndex = i + batchIdx;
          const res = await fetch(segUrl, { signal: controller.signal });
          if (!res.ok) throw new Error(`Segment ${segIndex} HTTP ${res.status}`);
          const buf = await res.arrayBuffer();
          buffers[segIndex] = buf;
          completed++;
          totalBytes += buf.byteLength;
          const pct = Math.min(
            99,
            Math.max(8, Math.round((completed / targetSegments.length) * 100))
          );
          updateItem(id, {
            completedSegments: completed,
            downloadedBytes: totalBytes,
            progressPercent: pct,
          });
        })
      );
    }

    const videoBlob = new Blob(buffers, { type: 'video/mp2t' });
    await saveVideoBlobToIdb(id, videoBlob);

    updateItem(id, {
      status: 'completed',
      progressPercent: 100,
      completedSegments: targetSegments.length,
      downloadedBytes: totalBytes,
      hasOfflineBlob: true,
    });

    const cleanTitle = (fullLecture.Title || 'Study_ROOM_Lecture')
      .replace(/[^a-zA-Z0-9_\-\u0900-\u097F ]/g, '_')
      .trim()
      .slice(0, 45);
    triggerBrowserBlobDownload(videoBlob, `${cleanTitle}_${chosen.label}.ts`);
  } catch (err: any) {
    if (!controller.signal.aborted) {
      updateItem(id, {
        status: 'error',
        errorMessage: err?.message || 'Download interrupted',
      });
    }
  } finally {
    activeControllers.delete(id);
  }
}

export function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 MB';
  const mb = bytes / (1024 * 1024);
  if (mb < 1) return `${Math.round(bytes / 1024)} KB`;
  return `${mb.toFixed(1)} MB`;
}
