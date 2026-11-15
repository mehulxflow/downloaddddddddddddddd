import {
  type BatchItem,
  type SubjectItem,
  type TopicItem,
  type LectureItem,
} from '../utils/formatters';
import { getOrderedStreamQualityUrls } from '../utils/crypto';

const UPSTREAM_BASE = 'https://maxxapi-sa.vercel.app';
const UPSTREAM_KEY = 'Maxxkoogfchahiye@123';
const WORKER_PROXY = 'https://desimaxx.adityalkkumar4321.workers.dev/?url=';

const LS_PREFIX = 'study_room_permanent_cache_v4_';
const SAVED_BATCHES_KEY = 'sachin_saved_batches_v1';
const PINNED_BATCHES_KEY = 'sachin_pinned_batches_v1';
const FAVORITE_LECTURES_KEY = 'study_room_favorite_lectures_v1';

export interface AppBrandingSettings {
  appName: string;
  logoUrl: string;
  tagline: string;
}

function readLocalCache<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(LS_PREFIX + key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeLocalCache<T>(key: string, data: T): void {
  try {
    localStorage.setItem(LS_PREFIX + key, JSON.stringify(data));
  } catch {
    // ignore storage quota errors
  }
}

function mergeArrayByKey<T extends Record<string, any>>(
  cached: T[] | null,
  fresh: T[],
  idField: keyof T
): T[] {
  const map = new Map<string, T>();
  if (Array.isArray(cached)) {
    for (const item of cached) {
      if (item && item[idField] != null) {
        map.set(String(item[idField]), item);
      }
    }
  }
  if (Array.isArray(fresh)) {
    for (const item of fresh) {
      if (item && item[idField] != null) {
        map.set(String(item[idField]), item);
      }
    }
  }
  return Array.from(map.values());
}

async function fetchWithFallbacks(endpointPath: string): Promise<any> {
  const localApiUrl = endpointPath;
  const directUpstreamUrl = `${UPSTREAM_BASE}${endpointPath}`;
  const workerProxyUrl = `${WORKER_PROXY}${encodeURIComponent(directUpstreamUrl)}`;

  const candidates = [
    { url: localApiUrl, headers: { Accept: 'application/json' } as Record<string, string> },
    {
      url: workerProxyUrl,
      headers: { 'X-API-Key': UPSTREAM_KEY, Accept: 'application/json' },
    },
    {
      url: directUpstreamUrl,
      headers: { 'X-API-Key': UPSTREAM_KEY, Accept: 'application/json' },
    },
  ];

  let lastError: Error | null = null;
  for (const candidate of candidates) {
    try {
      const res = await fetch(candidate.url, {
        method: 'GET',
        headers: candidate.headers,
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} from ${candidate.url}`);
      }
      const json = await res.json();
      if (
        json &&
        typeof json === 'object' &&
        'status' in json &&
        Number((json as any).status) !== 200
      ) {
        throw new Error(
          String((json as any).message || (json as any).msg || `Upstream status ${(json as any).status}`)
        );
      }
      return json && typeof json === 'object' && 'data' in json && json.data !== undefined
        ? json.data
        : json;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }
  throw lastError || new Error(`Failed to fetch ${endpointPath}`);
}

export interface SiteLockPublicStatus {
  lockEnabled: boolean;
  hasLockCode: boolean;
  lockVersion: string;
}

export async function fetchBatchesWithMeta(): Promise<{
  batches: BatchItem[];
  pinnedCourses: string[];
  appSettings: AppBrandingSettings;
  siteLock: SiteLockPublicStatus;
}> {
  const cacheKey = 'batches_meta_v4';
  const cached = readLocalCache<{
    batches: BatchItem[];
    pinnedCourses: string[];
    appSettings: AppBrandingSettings;
    siteLock?: SiteLockPublicStatus;
  }>(cacheKey);

  try {
    const res = await fetch('/api/my-batches', {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const list: BatchItem[] = Array.isArray(json?.data) ? json.data : [];
    const pinnedCourses: string[] = Array.isArray(json?.pinnedCourses)
      ? json.pinnedCourses
      : [];
    const appSettings: AppBrandingSettings = {
      appName:
        json?.appSettings?.appName && json.appSettings.appName !== 'Study ROOM'
          ? json.appSettings.appName
          : 'mehulxstudy',
      logoUrl: json?.appSettings?.logoUrl || '',
      tagline: json?.appSettings?.tagline || 'Knowledge & Success',
    };
    const siteLock: SiteLockPublicStatus = {
      lockEnabled: Boolean(json?.siteLock?.lockEnabled),
      hasLockCode: Boolean(json?.siteLock?.hasLockCode),
      lockVersion: String(json?.siteLock?.lockVersion || 'v1'),
    };

    const payload = { batches: list, pinnedCourses, appSettings, siteLock };
    writeLocalCache(cacheKey, payload);
    return payload;
  } catch (err) {
    if (cached && cached.batches.length > 0) {
      return {
        ...cached,
        appSettings: {
          ...cached.appSettings,
          appName:
            cached.appSettings?.appName && cached.appSettings.appName !== 'Study ROOM'
              ? cached.appSettings.appName
              : 'mehulxstudy',
        },
        siteLock: cached.siteLock || {
          lockEnabled: false,
          hasLockCode: false,
          lockVersion: 'v1',
        },
      };
    }
    const fallbackList = await fetchBatches();
    return {
      batches: fallbackList,
      pinnedCourses: [],
      appSettings: {
        appName: 'mehulxstudy',
        logoUrl: '',
        tagline: 'Knowledge & Success',
      },
      siteLock: {
        lockEnabled: false,
        hasLockCode: false,
        lockVersion: 'v1',
      },
    };
  }
}

export async function fetchBatches(includeHidden = false): Promise<BatchItem[]> {
  const cacheKey = includeHidden ? 'batches_admin_all' : 'batches_public';
  const cached = readLocalCache<BatchItem[]>(cacheKey);
  try {
    const raw = await fetchWithFallbacks(
      `/api/my-batches${includeHidden ? '?includeHidden=1' : ''}`
    );
    const list: BatchItem[] = Array.isArray(raw)
      ? raw
      : raw && typeof raw === 'object' && Array.isArray(raw.data)
      ? raw.data
      : [];
    writeLocalCache(cacheKey, list);
    return list;
  } catch (err) {
    if (cached && cached.length > 0) return cached;
    throw err;
  }
}

export async function fetchSubjects(
  courseId: string,
  includeHidden = false
): Promise<SubjectItem[]> {
  const cacheKey = `subjects_${courseId}_${includeHidden ? 'admin' : 'pub'}`;
  const cached = readLocalCache<SubjectItem[]>(cacheKey);
  try {
    const raw = await fetchWithFallbacks(
      `/api/subjects?courseid=${encodeURIComponent(courseId)}${
        includeHidden ? '&includeHidden=1' : ''
      }`
    );
    const list: SubjectItem[] = Array.isArray(raw) ? raw : [];
    writeLocalCache(cacheKey, list);
    return list;
  } catch (err) {
    if (cached && cached.length > 0) return cached;
    throw err;
  }
}

export async function fetchTopics(
  courseId: string,
  subjectId: string,
  includeHidden = false
): Promise<TopicItem[]> {
  const cacheKey = `topics_${courseId}_${subjectId}_${includeHidden ? 'admin' : 'pub'}`;
  const cached = readLocalCache<TopicItem[]>(cacheKey);
  try {
    const raw = await fetchWithFallbacks(
      `/api/topics?courseid=${encodeURIComponent(courseId)}&subjectid=${encodeURIComponent(
        subjectId
      )}${includeHidden ? '&includeHidden=1' : ''}`
    );
    const list: TopicItem[] = (Array.isArray(raw) ? raw : []).sort(
      (a, b) => (Number(a.sortingparam) || 0) - (Number(b.sortingparam) || 0)
    );
    writeLocalCache(cacheKey, list);
    return list;
  } catch (err) {
    if (cached && cached.length > 0) return cached;
    throw err;
  }
}

export async function fetchStudyLectures(
  courseId: string,
  subjectId: string,
  topicId: string,
  includeHidden = false
): Promise<LectureItem[]> {
  const cacheKey = `videos_${courseId}_${subjectId}_${topicId}_${
    includeHidden ? 'admin' : 'pub'
  }`;
  const cached = readLocalCache<LectureItem[]>(cacheKey);
  try {
    const raw = await fetchWithFallbacks(
      `/api/videos?courseid=${encodeURIComponent(courseId)}&subjectid=${encodeURIComponent(
        subjectId
      )}&topicid=${encodeURIComponent(topicId)}${includeHidden ? '&includeHidden=1' : ''}`
    );
    const list: LectureItem[] = Array.isArray(raw) ? raw : [];
    writeLocalCache(cacheKey, list);
    return list;
  } catch (err) {
    if (cached && cached.length > 0) return cached;
    throw err;
  }
}

export async function fetchLiveUpcomingLectures(
  courseId: string,
  includeHidden = false
): Promise<LectureItem[]> {
  if (courseId.startsWith('sr_')) return [];
  const cacheKey = `live_${courseId}_${includeHidden ? 'admin' : 'pub'}`;
  const cached = readLocalCache<LectureItem[]>(cacheKey);
  try {
    const raw = await fetchWithFallbacks(
      `/api/live-upcoming?courseid=${encodeURIComponent(courseId)}${
        includeHidden ? '&includeHidden=1' : ''
      }`
    );
    const list: LectureItem[] = [];
    if (Array.isArray(raw)) {
      list.push(...raw);
    } else if (raw && typeof raw === 'object') {
      if (Array.isArray(raw.live)) list.push(...raw.live);
      if (Array.isArray(raw.upcoming)) list.push(...raw.upcoming);
    }
    writeLocalCache(cacheKey, list);
    return list;
  } catch {
    return cached || [];
  }
}

export async function fetchPreviousLiveLectures(
  courseId: string,
  includeHidden = false
): Promise<LectureItem[]> {
  if (courseId.startsWith('sr_')) return [];
  const cacheKey = `prev_live_${courseId}_${includeHidden ? 'admin' : 'pub'}`;
  const cached = readLocalCache<LectureItem[]>(cacheKey);
  try {
    const raw = await fetchWithFallbacks(
      `/api/previous-live-videos?courseid=${encodeURIComponent(courseId)}${
        includeHidden ? '&includeHidden=1' : ''
      }`
    );
    const list: LectureItem[] = Array.isArray(raw) ? raw : [];
    writeLocalCache(cacheKey, list);
    return list;
  } catch {
    return cached || [];
  }
}

export async function fetchVideoDetails(
  courseId: string,
  videoId: string
): Promise<LectureItem | null> {
  const cacheKey = `vdetail_${courseId}_${videoId}`;
  const cached = readLocalCache<LectureItem>(cacheKey);
  try {
    const raw = await fetchWithFallbacks(
      `/api/video-details?courseid=${encodeURIComponent(courseId)}&videoid=${encodeURIComponent(videoId)}`
    );
    if (raw && typeof raw === 'object') {
      writeLocalCache(cacheKey, raw);
      return raw as LectureItem;
    }
    return cached;
  } catch {
    return cached;
  }
}

export async function searchGlobalLectures(query: string): Promise<LectureItem[]> {
  const q = query.trim();
  if (!q) return [];
  try {
    const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return [];
    const json = await res.json();
    return Array.isArray(json?.data) ? json.data : [];
  } catch {
    return [];
  }
}

// Favorite / Saved Lectures (Study ROOM ♥ Feature)
export function getFavoriteLectureIds(): Set<string> {
  try {
    const raw = localStorage.getItem(FAVORITE_LECTURES_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr.map(String) : []);
  } catch {
    return new Set();
  }
}

export function toggleFavoriteLectureId(lectureId: string): Set<string> {
  const current = getFavoriteLectureIds();
  const id = String(lectureId);
  if (current.has(id)) {
    current.delete(id);
  } else {
    current.add(id);
  }
  try {
    localStorage.setItem(FAVORITE_LECTURES_KEY, JSON.stringify(Array.from(current)));
  } catch {
    // ignore
  }
  return new Set(current);
}

export function getPinnedBatchIds(): Set<string> {
  try {
    const raw = localStorage.getItem(PINNED_BATCHES_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr.map(String) : []);
  } catch {
    return new Set();
  }
}

export function togglePinnedBatchId(courseId: string): Set<string> {
  const current = getPinnedBatchIds();
  const id = String(courseId);
  if (current.has(id)) {
    current.delete(id);
  } else {
    current.add(id);
  }
  try {
    localStorage.setItem(PINNED_BATCHES_KEY, JSON.stringify(Array.from(current)));
  } catch {
    // ignore
  }
  return new Set(current);
}

export function getSavedBatchIds(): Set<string> {
  try {
    const raw = localStorage.getItem(SAVED_BATCHES_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr.map(String) : []);
  } catch {
    return new Set();
  }
}

export function toggleSavedBatchId(courseId: string): Set<string> {
  const current = getSavedBatchIds();
  const id = String(courseId);
  if (current.has(id)) {
    current.delete(id);
  } else {
    current.add(id);
  }
  try {
    localStorage.setItem(SAVED_BATCHES_KEY, JSON.stringify(Array.from(current)));
  } catch {
    // ignore
  }
  return new Set(current);
}

export function markBatchSaved(courseId: string): Set<string> {
  const current = getSavedBatchIds();
  current.add(String(courseId));
  try {
    localStorage.setItem(SAVED_BATCHES_KEY, JSON.stringify(Array.from(current)));
  } catch {
    // ignore
  }
  return new Set(current);
}

export interface VaultStatusResponse {
  savedAt: string;
  updatedAt: string;
  totalBatches: number;
  totalSubjects: number;
  totalChapters: number;
  totalArchivedTopics: number;
  totalArchivedLectures: number;
  syncedBatches: Record<string, { syncedAt: string; lectureCount: number }>;
}

export async function fetchVaultStatus(): Promise<VaultStatusResponse | null> {
  try {
    const res = await fetch('/api/vault/status', { headers: { Accept: 'application/json' } });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function syncBatchToServerVault(
  courseId: string
): Promise<{ success: boolean; lectureCount: number }> {
  const res = await fetch('/api/vault/sync-batch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ courseId }),
  });
  if (!res.ok) {
    throw new Error('Failed to sync batch to permanent vault');
  }
  markBatchSaved(courseId);
  return await res.json();
}

export interface VisitorLogEntry {
  id: string;
  ip: string;
  device: string;
  userAgent: string;
  location: string;
  firstSeenAt: string;
  lastSeenAt: string;
  visitCount: number;
  lastAction: string;
}

// Admin Studio & Website Lock API Calls
export interface AdminOverviewResponse {
  appSettings: AppBrandingSettings;
  siteLock: {
    lockEnabled: boolean;
    lockCode: string;
    lockVersion: string;
  };
  hiddenBatchIds: string[];
  hiddenSubjectKeys: string[];
  hiddenLectureIds: string[];
  visitorLogs?: VisitorLogEntry[];
  pinnedCourses: string[];
  trackedBatches: string[];
  customBatchNames: Record<string, string>;
  courses: Array<{
    id: string;
    courseName: string;
    provider: 'kgs' | 'pwthor' | 'sachin';
    isArchived: boolean;
    isHidden?: boolean;
    isStudyRoom?: boolean;
    subjectCount: number;
    lectureCount: number;
    folders: Array<{
      folderKey: string;
      folderName: string;
      itemCount: number;
      isHidden?: boolean;
    }>;
  }>;
}

const CLIENT_PUBLIC_IP_CACHE_KEY = 'mehulxstudy_client_pub_ip_v1';

async function resolveClientPublicIp(): Promise<string> {
  try {
    const cached = sessionStorage.getItem(CLIENT_PUBLIC_IP_CACHE_KEY);
    if (cached) return cached;
  } catch {
    // ignore
  }
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    const res = await fetch('https://api.ipify.org?format=json', {
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (res.ok) {
      const json = await res.json();
      const ip = String(json?.ip || '').trim();
      if (ip) {
        try {
          sessionStorage.setItem(CLIENT_PUBLIC_IP_CACHE_KEY, ip);
        } catch {
          // ignore
        }
        return ip;
      }
    }
  } catch {
    // ignore
  }
  return '';
}

export async function pingVisitorActivity(action: string): Promise<void> {
  try {
    const clientPublicIp = await resolveClientPublicIp();
    let tz = '';
    try {
      tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    } catch {
      // ignore
    }
    await fetch('/api/visit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        action,
        clientPublicIp: clientPublicIp || undefined,
        location: tz || undefined,
      }),
    });
  } catch {
    // ignore
  }
}

export async function fetchAdminVisitorLogs(): Promise<VisitorLogEntry[]> {
  try {
    const res = await fetch('/api/admin/visitors', {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return [];
    const json = await res.json();
    return Array.isArray(json?.visitors) ? json.visitors : [];
  } catch {
    return [];
  }
}

export async function adminClearVisitorLogs(password: string): Promise<boolean> {
  try {
    const res = await fetch('/api/admin/visitors/clear', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ password }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function verifySiteLockCode(code: string): Promise<{
  valid: boolean;
  lockEnabled: boolean;
  lockVersion: string;
}> {
  try {
    const res = await fetch('/api/site-lock/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ code }),
    });
    if (!res.ok) return { valid: false, lockEnabled: true, lockVersion: 'v1' };
    return await res.json();
  } catch {
    return { valid: false, lockEnabled: true, lockVersion: 'v1' };
  }
}

export async function verifyAdminLogin(password: string): Promise<boolean> {
  try {
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ password }),
    });
    if (!res.ok) return false;
    const json = await res.json();
    return Boolean(json?.success);
  } catch {
    return password.trim() === '341214';
  }
}

export async function adminSaveSiteLock(payload: {
  password: string;
  lockEnabled: boolean;
  lockCode: string;
}): Promise<{
  ok: boolean;
  siteLock?: { lockEnabled: boolean; lockCode: string; lockVersion: string };
}> {
  try {
    const res = await fetch('/api/admin/site-lock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) return { ok: false };
    const json = await res.json();
    return { ok: true, siteLock: json?.siteLock };
  } catch {
    return { ok: false };
  }
}

export async function adminUpdateVisibility(payload: {
  type: 'batch' | 'subject' | 'lecture';
  ids: string[];
  courseId?: string;
  courseName?: string;
  hidden: boolean;
}): Promise<boolean> {
  try {
    const res = await fetch('/api/admin/visibility', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function fetchAdminOverview(): Promise<AdminOverviewResponse | null> {
  try {
    const res = await fetch('/api/admin/overview', { headers: { Accept: 'application/json' } });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function adminAddLectureOrNote(payload: {
  courseName: string;
  folderName: string;
  name: string;
  type: 'video' | 'note';
  videoLink?: string;
  videoLink2?: string;
  pdfLink?: string;
}): Promise<boolean> {
  const res = await fetch('/api/admin/add-item', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return res.ok;
}

export async function adminPerformBatchAction(payload: {
  action: 'pin' | 'archive' | 'restore' | 'rename' | 'delete';
  courseName: string;
  newCourseName?: string;
}): Promise<boolean> {
  const res = await fetch('/api/admin/batch-action', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return res.ok;
}

export interface KgsCatalogBatchItem {
  id: number | string;
  title: string;
  category_id?: number;
  start_at?: string;
  end_at?: string;
  image_large?: string | null;
  image_thumb?: string | null;
}

export async function fetchKgsCatalog(force = false): Promise<{
  catalog: KgsCatalogBatchItem[];
  trackedBatches: string[];
  customBatchNames: Record<string, string>;
  lastSahukgsSyncAt?: string;
}> {
  try {
    const res = await fetch(`/api/kgs/catalog${force ? '?force=1' : ''}`, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    return {
      catalog: Array.isArray(json?.data) ? json.data : [],
      trackedBatches: Array.isArray(json?.trackedBatches)
        ? json.trackedBatches.map(String)
        : [],
      customBatchNames: json?.customBatchNames || {},
      lastSahukgsSyncAt: json?.lastSahukgsSyncAt,
    };
  } catch {
    return { catalog: [], trackedBatches: [], customBatchNames: {} };
  }
}

export async function adminSyncKgsBatch(
  batchId?: string,
  customCourseName?: string
): Promise<{ ok: boolean; updated?: number; message?: string }> {
  try {
    const res = await fetch('/api/admin/sync-kgs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ batchId, customCourseName }),
    });
    if (!res.ok) return { ok: false };
    const json = await res.json();
    return {
      ok: true,
      updated: json?.updated,
      message: json?.message,
    };
  } catch {
    return { ok: false };
  }
}

export async function adminUntrackKgsBatch(batchId: string): Promise<boolean> {
  try {
    const res = await fetch('/api/admin/untrack-kgs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ batchId }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function adminSaveBranding(payload: AppBrandingSettings): Promise<boolean> {
  const res = await fetch('/api/admin/branding', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return res.ok;
}

export async function adminSaveLectureBackup(payload: {
  courseId?: string;
  lectureId: string;
  youtubeUrl?: string;
  mp4Url?: string;
  pdfUrl?: string;
  clear?: boolean;
}): Promise<boolean> {
  try {
    const res = await fetch('/api/admin/lecture-backup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function adminAutoUploadToYouTube(payload: {
  courseId?: string;
  lectureId: string;
  title: string;
  youtubeAccessToken: string;
  privacyStatus?: 'unlisted' | 'private';
}): Promise<{
  ok: boolean;
  youtubeUrl?: string;
  error?: string;
}> {
  try {
    const res = await fetch('/api/admin/youtube-auto-upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    if (!res.ok) {
      return { ok: false, error: json?.error || `HTTP ${res.status}` };
    }
    return {
      ok: true,
      youtubeUrl: json?.youtubeUrl,
    };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Upload request failed' };
  }
}

export interface TelegramQueueLectureItem {
  id: string;
  lectureName: string;
  subjectId?: string;
  subjectName: string;
  topicName?: string;
  streamUrl: string;
}

export interface TelegramJobStatusResponse {
  job_id: string;
  status: 'Downloading' | 'Uploading' | 'Completed' | 'Failed';
  progress: number;
  batch_name?: string;
  lecture_name?: string;
  error?: string | null;
}

/**
 * Resolves the best playable .m3u8 or .mp4 stream URL from a LectureItem.
 */
export function resolveLectureStreamUrl(lec: LectureItem): string {
  const ordered = getOrderedStreamQualityUrls(lec);
  return ordered[0] || '';
}

/**
 * Instantly fetches all video lectures across all subjects/chapters of a given batch
 * (especially Sachin Academy batches) via the single-request server scanner.
 */
export interface TelegramScannedSubjectItem {
  id: string;
  name: string;
  count: number;
}

/**
 * Fetches all video lectures and subjects across all folders/topics of a selected batch
 * (especially Sachin Academy batches) via the full server scanner.
 */
export async function fetchBatchLecturesAndSubjectsForTelegram(
  courseId: string,
  forceRefresh = false
): Promise<{
  items: TelegramQueueLectureItem[];
  subjects: TelegramScannedSubjectItem[];
}> {
  try {
    const refreshParam = forceRefresh ? '&refresh=1' : '';
    const res = await fetch(
      `/api/telegram/batch-lectures?courseid=${encodeURIComponent(courseId)}${refreshParam}`,
      { headers: { Accept: 'application/json' } }
    );
    if (res.ok) {
      const json = await res.json();
      if (Array.isArray(json?.data)) {
        return {
          items: json.data,
          subjects: Array.isArray(json?.subjects) ? json.subjects : [],
        };
      }
    }
  } catch {
    // Fallback to client-side scan below if needed
  }

  const results: TelegramQueueLectureItem[] = [];
  const subList: TelegramScannedSubjectItem[] = [];
  const seenIds = new Set<string>();
  const isStudyRoom = courseId.startsWith('sr_');

  const subjects = await fetchSubjects(courseId, true);
  for (const sub of subjects) {
    const subId = String(sub.subjectid);
    const subName = sub.subject_name || 'Subject';
    let subCount = 0;

    if (isStudyRoom) {
      const lectures = await fetchStudyLectures(courseId, subId, subId, true);
      for (const lec of lectures) {
        if (lec.type === 'note') continue;
        const streamUrl = resolveLectureStreamUrl(lec);
        const lid = String(lec.id || `${subId}_${lec.Title}`);
        if (streamUrl && !seenIds.has(lid)) {
          seenIds.add(lid);
          subCount++;
          results.push({
            id: lid,
            lectureName: `${subName} - ${lec.Title || 'Lecture'}`,
            subjectId: subId,
            subjectName: subName,
            streamUrl,
          });
        }
      }
    } else {
      const lectures = await fetchStudyLectures(courseId, subId, 'all', true);
      for (const lec of lectures) {
        if (lec.type === 'note') continue;
        const streamUrl = resolveLectureStreamUrl(lec) || `sachin_resolve://${courseId}/${lec.id}`;
        const lid = String(lec.id || `${subId}_${lec.Title}`);
        const dedupKey = `${subId}_${lid}`;
        if (streamUrl && !seenIds.has(dedupKey)) {
          seenIds.add(dedupKey);
          subCount++;
          results.push({
            id: lid,
            lectureName: `${subName} - ${lec.Title || 'Lecture'}`,
            subjectId: subId,
            subjectName: subName,
            streamUrl,
          });
        }
      }
    }
    subList.push({ id: subId, name: subName, count: subCount });
  }

  return { items: results, subjects: subList };
}

export async function fetchAllBatchLecturesForTelegram(
  courseId: string
): Promise<TelegramQueueLectureItem[]> {
  const { items } = await fetchBatchLecturesAndSubjectsForTelegram(courseId, false);
  return items;
}

export async function startTelegramUploadJob(
  renderBaseUrl: string,
  payload: { url: string; batch_name: string; subject_name?: string; lecture_name: string }
): Promise<{ job_id: string; status: string; subject_name?: string; thread_id?: number }> {
  const cleanBase = renderBaseUrl.trim().replace(/\/+$/, '');
  const isCustomExternal =
    cleanBase.startsWith('http') &&
    !cleanBase.includes('your-telegram-uploader.onrender.com') &&
    !payload.url.startsWith('sachin_resolve://');

  if (isCustomExternal) {
    try {
      const extRes = await fetch(`${cleanBase}/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
      });
      if (extRes.ok) {
        return await extRes.json();
      }
    } catch {
      // Fall back to built-in server endpoint below
    }
  }

  const res = await fetch('/api/telegram/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}: ${errText || 'Failed to start upload job'}`);
  }
  return await res.json();
}

export async function fetchTelegramUploadStatus(
  renderBaseUrl: string,
  jobId: string
): Promise<TelegramJobStatusResponse & { subject_name?: string; thread_id?: number }> {
  const cleanBase = renderBaseUrl.trim().replace(/\/+$/, '');
  const isCustomExternal =
    cleanBase.startsWith('http') &&
    !cleanBase.includes('your-telegram-uploader.onrender.com');

  if (isCustomExternal) {
    try {
      const extRes = await fetch(`${cleanBase}/status/${encodeURIComponent(jobId)}`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });
      if (extRes.ok) {
        return await extRes.json();
      }
    } catch {
      // Fall back to built-in server endpoint below
    }
  }

  const res = await fetch(`/api/telegram/status/${encodeURIComponent(jobId)}`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} polling job ${jobId}`);
  }
  return await res.json();
}

export interface TelegramForumInfo {
  chatTitle: string;
  isForum: boolean;
  canManageTopics: boolean;
  botUsername: string;
  lastCheckedAt: string | null;
  lastTopicError?: string | null;
}

export interface ServerBulkUploadStatus {
  isRunning: boolean;
  courseId: string;
  batchName: string;
  subjectFilter: string;
  startedAt: string | null;
  finishedAt: string | null;
  currentIndex: number;
  currentJobId: string | null;
  currentLecture?: string;
  currentSubject?: string;
  currentThreadId?: number | null;
  currentStatus: 'Idle' | 'Downloading' | 'Uploading' | 'Completed' | 'Failed' | 'Stopped';
  currentProgress: number;
  queue: TelegramQueueLectureItem[];
  completedIds: string[];
  courseCompletedIds?: string[];
  failedIds: Record<string, string>;
  topicCache?: Record<string, number>;
  forumInfo?: TelegramForumInfo;
  stopRequested: boolean;
}

export async function syncTelegramForumTopics(
  createSubjectNameOrList?: string | string[]
): Promise<{
  topic_cache: Record<string, number>;
  forum_info?: TelegramForumInfo;
  created_thread_id?: number | null;
  created_topics?: Record<string, number>;
} | null> {
  try {
    const bodyPayload = Array.isArray(createSubjectNameOrList)
      ? { createSubjectNames: createSubjectNameOrList }
      : createSubjectNameOrList
      ? { createSubjectName: createSubjectNameOrList }
      : {};
    const res = await fetch('/api/telegram/sync-topics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(bodyPayload),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function startServerBulkTelegramUpload(payload: {
  courseId: string;
  batchName: string;
  subjectFilter: string;
  items: TelegramQueueLectureItem[];
  renderBaseUrl?: string;
}): Promise<{
  status: string;
  topic_cache?: Record<string, number>;
  bulkState: ServerBulkUploadStatus;
}> {
  const formattedItems = payload.items.map((item) => ({
    id: item.id,
    url: item.streamUrl,
    batch_name: payload.batchName,
    subject_name: item.subjectName || 'General',
    lecture_name: item.lectureName,
    subjectId: item.subjectId,
    subjectName: item.subjectName || 'General',
    topicName: item.topicName,
    lectureName: item.lectureName,
    streamUrl: item.streamUrl,
  }));

  const cleanBase = (payload.renderBaseUrl || '').trim().replace(/\/+$/, '');
  const hasSachinResolve = formattedItems.some((i) =>
    i.url.startsWith('sachin_resolve://')
  );
  if (
    cleanBase.startsWith('http') &&
    !cleanBase.includes('your-telegram-uploader.onrender.com') &&
    !hasSachinResolve
  ) {
    try {
      const extRes = await fetch(`${cleanBase}/upload-batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(formattedItems),
      });
      if (extRes.ok) {
        const extJson = await extRes.json();
        return {
          status: extJson.status || 'Batch upload started',
          topic_cache: extJson.topic_cache,
          bulkState: extJson.batch_status || extJson.bulkState,
        };
      }
    } catch {
      // Fall back to built-in server /upload-batch below
    }
  }

  const res = await fetch('/upload-batch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      courseId: payload.courseId,
      batchName: payload.batchName,
      subjectFilter: payload.subjectFilter,
      items: formattedItems,
    }),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}: ${errText || 'Failed to start server bulk upload'}`);
  }
  return await res.json();
}

export async function fetchServerBulkTelegramStatus(
  courseId?: string,
  renderBaseUrl?: string
): Promise<ServerBulkUploadStatus | null> {
  const cleanBase = (renderBaseUrl || '').trim().replace(/\/+$/, '');
  if (
    cleanBase.startsWith('http') &&
    !cleanBase.includes('your-telegram-uploader.onrender.com')
  ) {
    try {
      const extRes = await fetch(`${cleanBase}/batch-status`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });
      if (extRes.ok) {
        return await extRes.json();
      }
    } catch {
      // Fall back to built-in server /batch-status below
    }
  }

  try {
    const query = courseId ? `?courseid=${encodeURIComponent(courseId)}` : '';
    const res = await fetch(`/batch-status${query}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function stopServerBulkTelegramUpload(): Promise<boolean> {
  try {
    const res = await fetch('/batch-stop', {
      method: 'POST',
      headers: { Accept: 'application/json' },
    });
    return res.ok;
  } catch {
    return false;
  }
}





