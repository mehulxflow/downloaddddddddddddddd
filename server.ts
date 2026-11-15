import express from 'express';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { TelegramClient, sessions } from 'telegram';
import ffmpegStatic from 'ffmpeg-static';
import {
  extractYouTubeId,
  buildYouTubeThumbnailUrl,
  extractStreamQualities,
  decryptSachinUrl,
  pickHighestQualityStream,
  getOrderedStreamQualityUrls,
  selectHighestHlsVariant,
} from './src/utils/crypto.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const UPSTREAM_BASE = 'https://maxxapi-sa.vercel.app';
const UPSTREAM_KEY = 'Maxxkoogfchahiye@123';
const WORKER_PROXY = 'https://desimaxx.adityalkkumar4321.workers.dev/?url=';

// Study ROOM (avengers-endgame-1.onrender.com) Live Firebase RTDB & API
const STUDY_ROOM_RTDB = 'https://study-app-8cbc8-default-rtdb.asia-southeast1.firebasedatabase.app';
const STUDY_ROOM_API = 'https://avengers-endgame-1.onrender.com';

const SEED_ARCHIVE_PATH = path.join(__dirname, 'src', 'data', 'seedArchive.json');
const LECTURES_VAULT_PATH = path.join(__dirname, 'src', 'data', 'lecturesVault.json');
const STUDY_ROOM_CACHE_PATH = path.join(__dirname, 'src', 'data', 'studyRoomCache.json');
const ADMIN_CONTROL_PATH = path.join(__dirname, 'src', 'data', 'adminControl.json');
const ADMIN_PASSWORD = '341214';

// Known high-resolution KGS Course Thumbnails for Study ROOM batches
const KNOWN_KGS_THUMBNAILS: Record<string, string> = {
  '330': 'https://kgs-v2.akamaized.net/kgs/kgs-do/courses/large/e26c42c2-762e-4432-a399-e823cc05808e.jpg',
  '383': 'https://kgs-v2.akamaized.net/kgs/kgs-do/courses/large/f53a2cda-46ee-43ae-b1bd-18cd359c0ca1.jpg',
  '1028': 'https://kgs-v2.akamaized.net/kgs/kgs/courses/large/ab2798f5-be7b-4567-a7e4-f03aee0a9a7a.jpeg',
  '1179': 'https://kgs-v2.akamaized.net/kgs/kgs/courses/large/2859404c-ed10-4fde-ad1c-0cd1cf8a1782.jpg',
  '1182': 'https://kgs-v2.akamaized.net/kgs/kgs/courses/large/258f202e-4f54-444d-8161-cdf7fc0c5b91.jpg',
  '1221': 'https://kgs-v2.akamaized.net/kgs/kgs/courses/large/48a6d98b-d468-40c0-a04b-806210528dc1.jpg',
  '1252': 'https://kgs-v2.akamaized.net/kgs/kgs/courses/large/722d2cf1-2cab-4841-a031-7d88540a2ffb.png',
  '1192': 'https://kgs-v2.akamaized.net/kgs/kgs/courses/large/2a2d4c26-5081-482d-8f98-1812714746f0.jpg',
  '478': 'https://kgs-v2.akamaized.net/kgs/kgs-do/courses/large/dfa6e84a-622d-4459-8988-ca662be87f9f.jpg',
  '1020': 'https://kgs-v2.akamaized.net/kgs/kgs/courses/large/fe7fbfde-46c8-47ec-92d5-b2d3eeb6ec01.jpg',
  '1126': 'https://kgs-v2.akamaized.net/kgs/kgs/courses/large/d7ed9873-d1b9-48f8-8153-1c5948b0c10d.png',
  '1166': 'https://kgs-v2.akamaized.net/kgs/kgs/courses/large/50e2cb59-dda5-48c3-afb9-3ddab709bf54.png',
  '1265': 'https://kgs-v2.akamaized.net/kgs/kgs/courses/large/66cc3489-33f0-4314-af1c-63cb0ba39bbb.png',
};

interface ArchiveStore {
  savedAt: string;
  batches: any[];
  subjectsByBatch: Record<string, any[]>;
  topicsBySubject: Record<string, any[]>;
}

interface LecturesVaultStore {
  updatedAt: string;
  videosByTopic: Record<string, any[]>;
  liveByCourse: Record<string, any[]>;
  prevLiveByCourse: Record<string, any[]>;
  videoDetailsById: Record<string, any>;
  syncedBatches: Record<string, { syncedAt: string; lectureCount: number }>;
}

interface StudyRoomFolderRecord {
  courseName: string;
  folderName: string;
  provider?: 'kgs' | 'pwthor';
  createdAt?: number;
  items?: any[] | Record<string, any>;
}

interface StudyRoomState {
  updatedAt: string;
  structuredLessons: Record<string, StudyRoomFolderRecord>;
  archivedLessons: Record<string, StudyRoomFolderRecord>;
  pinnedCourses: string[];
  courseOrder: string[];
  trackedBatches: string[];
  customBatchNames: Record<string, string>;
  appSettings: {
    appName: string;
    logoUrl: string;
    tagline: string;
  };
  kgsThumbnailsById: Record<string, string>;
  kgsThumbnailsByTitle: Record<string, string>;
}

let archiveStore: ArchiveStore = {
  savedAt: new Date().toISOString(),
  batches: [],
  subjectsByBatch: {},
  topicsBySubject: {},
};

let lecturesVault: LecturesVaultStore = {
  updatedAt: new Date().toISOString(),
  videosByTopic: {},
  liveByCourse: {},
  prevLiveByCourse: {},
  videoDetailsById: {},
  syncedBatches: {},
};

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

export interface LectureBackupOverride {
  youtubeUrl?: string;
  mp4Url?: string;
  pdfUrl?: string;
  updatedAt: string;
}

interface AdminControlState {
  updatedAt: string;
  appName: string;
  tagline: string;
  logoUrl: string;
  lockEnabled: boolean;
  lockCode: string;
  lockVersion: string;
  hiddenBatchIds: string[];
  hiddenSubjectKeys: string[];
  hiddenLectureIds: string[];
  visitorLogs: VisitorLogEntry[];
  lectureOverrides: Record<string, LectureBackupOverride>;
  telegramCompletedByCourse?: Record<string, string[]>;
  telegramTopicCache?: Record<string, number>;
  telegramMtprotoSession?: string;
}

let adminControlState: AdminControlState = {
  updatedAt: new Date().toISOString(),
  appName: 'mehulxstudy',
  tagline: 'Knowledge & Success',
  logoUrl: '',
  lockEnabled: false,
  lockCode: '',
  lockVersion: 'v1',
  hiddenBatchIds: [],
  hiddenSubjectKeys: [],
  hiddenLectureIds: [],
  visitorLogs: [],
  lectureOverrides: {},
  telegramCompletedByCourse: {},
  telegramTopicCache: { CDP: 3 },
  telegramMtprotoSession: '',
};

let studyRoomState: StudyRoomState = {
  updatedAt: new Date().toISOString(),
  structuredLessons: {},
  archivedLessons: {},
  pinnedCourses: [],
  courseOrder: [],
  trackedBatches: [],
  customBatchNames: {},
  appSettings: {
    appName: 'mehulxstudy',
    logoUrl: '',
    tagline: 'Knowledge & Success',
  },
  kgsThumbnailsById: { ...KNOWN_KGS_THUMBNAILS },
  kgsThumbnailsByTitle: {},
};

function loadStores() {
  try {
    if (fs.existsSync(SEED_ARCHIVE_PATH)) {
      const raw = fs.readFileSync(SEED_ARCHIVE_PATH, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.batches)) {
        archiveStore = parsed;
      }
    }
  } catch (err) {
    console.warn('Could not load seedArchive.json:', err);
  }

  try {
    if (fs.existsSync(LECTURES_VAULT_PATH)) {
      const raw = fs.readFileSync(LECTURES_VAULT_PATH, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        lecturesVault = {
          updatedAt: parsed.updatedAt || new Date().toISOString(),
          videosByTopic: parsed.videosByTopic || {},
          liveByCourse: parsed.liveByCourse || {},
          prevLiveByCourse: parsed.prevLiveByCourse || {},
          videoDetailsById: parsed.videoDetailsById || {},
          syncedBatches: parsed.syncedBatches || {},
        };
      }
    }
  } catch (err) {
    console.warn('Could not load lecturesVault.json:', err);
  }

  try {
    if (fs.existsSync(STUDY_ROOM_CACHE_PATH)) {
      const raw = fs.readFileSync(STUDY_ROOM_CACHE_PATH, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        studyRoomState = {
          ...studyRoomState,
          ...parsed,
          kgsThumbnailsById: {
            ...KNOWN_KGS_THUMBNAILS,
            ...(parsed.kgsThumbnailsById || {}),
          },
        };
      }
    }
  } catch (err) {
    console.warn('Could not load studyRoomCache.json:', err);
  }

  try {
    if (fs.existsSync(ADMIN_CONTROL_PATH)) {
      const raw = fs.readFileSync(ADMIN_CONTROL_PATH, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        adminControlState = {
          ...adminControlState,
          ...parsed,
          appName:
            parsed.appName && parsed.appName !== 'Study ROOM'
              ? parsed.appName
              : 'mehulxstudy',
          hiddenBatchIds: Array.isArray(parsed.hiddenBatchIds)
            ? parsed.hiddenBatchIds.map(String)
            : [],
          hiddenSubjectKeys: Array.isArray(parsed.hiddenSubjectKeys)
            ? parsed.hiddenSubjectKeys.map(String)
            : [],
          hiddenLectureIds: Array.isArray(parsed.hiddenLectureIds)
            ? parsed.hiddenLectureIds.map(String)
            : [],
          visitorLogs: Array.isArray(parsed.visitorLogs)
            ? parsed.visitorLogs
            : [],
          lectureOverrides:
            parsed.lectureOverrides && typeof parsed.lectureOverrides === 'object'
              ? parsed.lectureOverrides
              : {},
          telegramCompletedByCourse:
            parsed.telegramCompletedByCourse &&
            typeof parsed.telegramCompletedByCourse === 'object'
              ? parsed.telegramCompletedByCourse
              : {},
          telegramTopicCache: {
            CDP: 3,
            ...(parsed.telegramTopicCache &&
            typeof parsed.telegramTopicCache === 'object'
              ? parsed.telegramTopicCache
              : {}),
          },
          telegramMtprotoSession:
            typeof parsed.telegramMtprotoSession === 'string'
              ? parsed.telegramMtprotoSession
              : '',
        };
      }
    }
  } catch (err) {
    console.warn('Could not load adminControl.json:', err);
  }

  studyRoomState.appSettings = {
    appName: adminControlState.appName || 'mehulxstudy',
    tagline: adminControlState.tagline || 'Knowledge & Success',
    logoUrl: adminControlState.logoUrl || '',
  };
}

let adminSaveTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleAdminControlSave() {
  if (adminSaveTimer) return;
  adminSaveTimer = setTimeout(() => {
    adminSaveTimer = null;
    saveAdminControlNow();
  }, 2000);
}

function saveAdminControlNow() {
  try {
    adminControlState.updatedAt = new Date().toISOString();
    fs.mkdirSync(path.dirname(ADMIN_CONTROL_PATH), { recursive: true });
    fs.writeFileSync(ADMIN_CONTROL_PATH, JSON.stringify(adminControlState, null, 2));
  } catch (err) {
    console.warn('Failed to persist adminControl.json:', err);
  }
}

function extractVisitorIp(req: express.Request, clientReportedIp?: string): string {
  const cleanIp = (raw: string): string => {
    const trimmed = raw.trim();
    if (!trimmed) return '';
    return trimmed.replace(/^::ffff:/i, '');
  };

  const isPrivateOrLocal = (ip: string): boolean => {
    if (!ip) return true;
    return (
      ip === '127.0.0.1' ||
      ip === '::1' ||
      ip === 'localhost' ||
      ip.startsWith('10.') ||
      ip.startsWith('192.168.') ||
      ip.startsWith('169.254.') ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(ip)
    );
  };

  const headerCandidates = [
    req.headers['cf-connecting-ip'],
    req.headers['true-client-ip'],
    req.headers['x-real-ip'],
    req.headers['x-client-ip'],
    req.headers['x-forwarded-for'],
  ];

  const foundIps: string[] = [];
  for (const h of headerCandidates) {
    if (!h) continue;
    const rawStr = Array.isArray(h) ? h.join(',') : String(h);
    for (const part of rawStr.split(',')) {
      const cleaned = cleanIp(part);
      if (cleaned) foundIps.push(cleaned);
    }
  }

  if (req.ip) {
    foundIps.push(cleanIp(req.ip));
  }
  if (req.socket?.remoteAddress) {
    foundIps.push(cleanIp(req.socket.remoteAddress));
  }

  // Prefer public IP if clientReportedIp is provided and valid
  if (clientReportedIp) {
    const cleanedClient = cleanIp(clientReportedIp);
    if (cleanedClient && !isPrivateOrLocal(cleanedClient)) {
      return cleanedClient;
    }
  }

  const publicServerIp = foundIps.find((ip) => !isPrivateOrLocal(ip));
  if (publicServerIp) return publicServerIp;

  if (clientReportedIp && cleanIp(clientReportedIp)) {
    return cleanIp(clientReportedIp);
  }

  return foundIps[0] || 'Unknown IP';
}

function parseUserAgentSummary(uaRaw: string): string {
  const ua = String(uaRaw || '');
  if (!ua) return 'Unknown Device';

  let deviceType = 'Desktop';
  if (/ipad|tablet|playbook|silk/i.test(ua) || (/android/i.test(ua) && !/mobile/i.test(ua))) {
    deviceType = 'Tablet';
  } else if (/Mobile|iP(hone|od)|Android|BlackBerry|IEMobile|Kindle|Silk-Accelerated|(hpw|web)OS|Opera M(obi|ini)/i.test(ua)) {
    deviceType = 'Mobile';
  }

  let os = 'OS';
  if (/windows nt/i.test(ua)) os = 'Windows';
  else if (/android/i.test(ua)) os = 'Android';
  else if (/iphone|ipad|ipod/i.test(ua)) os = 'iOS';
  else if (/mac os x/i.test(ua)) os = 'macOS';
  else if (/linux/i.test(ua)) os = 'Linux';

  let browser = 'Browser';
  if (/edg\//i.test(ua)) browser = 'Edge';
  else if (/opr\//i.test(ua) || /opera/i.test(ua)) browser = 'Opera';
  else if (/chrome|crios/i.test(ua)) browser = 'Chrome';
  else if (/firefox|fxios/i.test(ua)) browser = 'Firefox';
  else if (/safari/i.test(ua) && !/chrome|crios/i.test(ua)) browser = 'Safari';

  return `${deviceType} · ${os} · ${browser}`;
}

function recordVisitorActivity(
  req: express.Request,
  opts?: {
    action?: string;
    clientPublicIp?: string;
    location?: string;
  }
): VisitorLogEntry {
  const ip = extractVisitorIp(req, opts?.clientPublicIp);
  const ua = String(req.headers['user-agent'] || '');
  const device = parseUserAgentSummary(ua);
  const countryHeader = String(
    req.headers['cf-ipcountry'] ||
      req.headers['x-appengine-country'] ||
      req.headers['x-vercel-ip-country'] ||
      ''
  ).trim();
  const cityHeader = String(
    req.headers['x-appengine-city'] || req.headers['x-vercel-ip-city'] || ''
  ).trim();
  const headerLoc = [cityHeader, countryHeader].filter(Boolean).join(', ');
  const location = opts?.location?.trim() || headerLoc || 'India / Global';
  const action = opts?.action?.trim() || 'Visited mehulxstudy Website';
  const nowIso = new Date().toISOString();

  if (!Array.isArray(adminControlState.visitorLogs)) {
    adminControlState.visitorLogs = [];
  }

  // Match existing visitor by IP + Device so we update their visit count & latest activity
  const existingIdx = adminControlState.visitorLogs.findIndex(
    (v) => v.ip === ip && v.device === device
  );

  let entry: VisitorLogEntry;
  if (existingIdx !== -1) {
    const prev = adminControlState.visitorLogs[existingIdx];
    const timeDiffMs = Date.now() - new Date(prev.lastSeenAt || 0).getTime();
    // Increment visitCount if > 30 seconds since last ping or if action changed meaningfully
    const nextCount =
      timeDiffMs > 30_000 || (opts?.action && opts.action !== prev.lastAction)
        ? (Number(prev.visitCount) || 1) + 1
        : Number(prev.visitCount) || 1;

    entry = {
      ...prev,
      ip,
      device,
      userAgent: ua || prev.userAgent,
      location: location !== 'India / Global' ? location : prev.location || location,
      lastSeenAt: nowIso,
      visitCount: nextCount,
      lastAction: action,
    };
    adminControlState.visitorLogs.splice(existingIdx, 1);
    adminControlState.visitorLogs.unshift(entry);
  } else {
    entry = {
      id: `vis_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      ip,
      device,
      userAgent: ua,
      location,
      firstSeenAt: nowIso,
      lastSeenAt: nowIso,
      visitCount: 1,
      lastAction: action,
    };
    adminControlState.visitorLogs.unshift(entry);
  }

  if (adminControlState.visitorLogs.length > 500) {
    adminControlState.visitorLogs = adminControlState.visitorLogs.slice(0, 500);
  }

  scheduleAdminControlSave();
  return entry;
}

function checkBatchHidden(batchId: string, courseName?: string): boolean {
  const set = new Set(adminControlState.hiddenBatchIds);
  if (set.has(String(batchId))) return true;
  if (courseName && set.has(String(courseName).trim())) return true;
  return false;
}

function checkSubjectHidden(courseId: string, subjectId: string): boolean {
  const set = new Set(adminControlState.hiddenSubjectKeys);
  const sId = String(subjectId);
  return set.has(sId) || set.has(`${courseId}::${sId}`);
}

function checkLectureHidden(lectureId: string, courseId?: string, subjectId?: string): boolean {
  if (courseId && checkBatchHidden(courseId)) return true;
  if (courseId && subjectId && checkSubjectHidden(courseId, subjectId)) return true;
  const set = new Set(adminControlState.hiddenLectureIds);
  const lId = String(lectureId);
  if (set.has(lId)) return true;
  if (courseId && set.has(`${courseId}::${lId}`)) return true;
  return false;
}

function applyLectureOverride(lec: any, courseId?: string): any {
  if (!lec || !lec.id) return lec;
  const lId = String(lec.id);
  const composite = courseId ? `${courseId}::${lId}` : lId;
  const override =
    adminControlState.lectureOverrides?.[composite] ||
    adminControlState.lectureOverrides?.[lId];
  if (!override) return lec;

  const updated = { ...lec, hasBackupOverride: true, backupOverride: override };
  if (override.youtubeUrl) {
    const ytId = extractYouTubeId(override.youtubeUrl);
    updated.videoLink = override.youtubeUrl;
    if (ytId) {
      updated.youtubeId = ytId;
      if (!updated.thumbnail) {
        updated.thumbnail = buildYouTubeThumbnailUrl(ytId);
      }
    }
  }
  if (override.mp4Url) {
    updated.videoLink2 = override.mp4Url;
    updated.file_link = override.mp4Url;
    updated.download_link = override.mp4Url;
  }
  if (override.pdfUrl) {
    updated.pdf_link = override.pdfUrl;
  }
  return updated;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleVaultSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      lecturesVault.updatedAt = new Date().toISOString();
      fs.mkdirSync(path.dirname(LECTURES_VAULT_PATH), { recursive: true });
      fs.writeFileSync(LECTURES_VAULT_PATH, JSON.stringify(lecturesVault));
    } catch (err) {
      console.warn('Failed to persist lecturesVault.json:', err);
    }
  }, 1500);
}

let srSaveTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleStudyRoomSave() {
  if (srSaveTimer) return;
  srSaveTimer = setTimeout(() => {
    srSaveTimer = null;
    try {
      studyRoomState.updatedAt = new Date().toISOString();
      fs.mkdirSync(path.dirname(STUDY_ROOM_CACHE_PATH), { recursive: true });
      fs.writeFileSync(STUDY_ROOM_CACHE_PATH, JSON.stringify(studyRoomState));
    } catch (err) {
      console.warn('Failed to persist studyRoomCache.json:', err);
    }
  }, 1500);
}

async function fetchJsonWithTimeout(url: string, timeoutMs = 9000): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    clearTimeout(timer);
    return null;
  }
}

let lastRtdbSyncMs = 0;
let rtdbSyncPromise: Promise<void> | null = null;
let lastSahukgsUpstreamSyncMs = 0;
let sahukgsUpstreamSyncPromise: Promise<{ updated: number; message: string }> | null = null;
let lastSahukgsSyncIso = new Date().toISOString();
let kgsCatalogCache: any[] = [];
let lastKgsCatalogFetchMs = 0;

async function fetchKgsCatalog(force = false): Promise<any[]> {
  const now = Date.now();
  if (!force && kgsCatalogCache.length > 0 && now - lastKgsCatalogFetchMs < 300_000) {
    return kgsCatalogCache;
  }
  const batches = await fetchJsonWithTimeout(`${STUDY_ROOM_API}/api/batches`, 12000);
  if (Array.isArray(batches) && batches.length > 0) {
    kgsCatalogCache = batches;
    lastKgsCatalogFetchMs = Date.now();
    for (const b of batches) {
      const img = b.image_large || b.image_thumb || '';
      if (img && b.id) {
        studyRoomState.kgsThumbnailsById[String(b.id)] = img;
      }
      if (img && b.title) {
        studyRoomState.kgsThumbnailsByTitle[String(b.title).trim().toLowerCase()] = img;
      }
    }
    scheduleStudyRoomSave();
  }
  return kgsCatalogCache;
}

async function syncStudyRoomFromFirebase(force = false): Promise<void> {
  const now = Date.now();
  const hasExistingData = Object.keys(studyRoomState.structuredLessons).length > 0;
  if (!force && hasExistingData && now - lastRtdbSyncMs < 30_000) {
    return;
  }
  if (rtdbSyncPromise) {
    return rtdbSyncPromise;
  }

  rtdbSyncPromise = (async () => {
    try {
      const [
        structured,
        archived,
        pinned,
        order,
        tracked,
        customNames,
        settings,
      ] = await Promise.all([
        fetchJsonWithTimeout(`${STUDY_ROOM_RTDB}/structured_lessons.json`, 10000),
        fetchJsonWithTimeout(`${STUDY_ROOM_RTDB}/archived_lessons.json`, 10000),
        fetchJsonWithTimeout(`${STUDY_ROOM_RTDB}/pinned_courses.json`, 6000),
        fetchJsonWithTimeout(`${STUDY_ROOM_RTDB}/course_order.json`, 6000),
        fetchJsonWithTimeout(`${STUDY_ROOM_RTDB}/tracked_batches.json`, 6000),
        fetchJsonWithTimeout(`${STUDY_ROOM_RTDB}/custom_batch_names.json`, 6000),
        fetchJsonWithTimeout(`${STUDY_ROOM_RTDB}/app_settings.json`, 6000),
      ]);

      let changed = false;
      if (structured && typeof structured === 'object') {
        studyRoomState.structuredLessons = structured;
        changed = true;
      }
      if (archived && typeof archived === 'object') {
        studyRoomState.archivedLessons = archived;
        changed = true;
      }
      if (Array.isArray(pinned)) {
        studyRoomState.pinnedCourses = pinned.filter(Boolean).map(String);
        changed = true;
      }
      if (Array.isArray(order)) {
        studyRoomState.courseOrder = order.filter(Boolean).map(String);
        changed = true;
      }
      if (Array.isArray(tracked)) {
        studyRoomState.trackedBatches = tracked.filter(Boolean).map(String);
        changed = true;
      } else if (tracked && typeof tracked === 'object') {
        studyRoomState.trackedBatches = Object.values(tracked).filter(Boolean).map(String);
        changed = true;
      }
      if (customNames && typeof customNames === 'object') {
        studyRoomState.customBatchNames = customNames;
        changed = true;
      }
      if (settings && typeof settings === 'object') {
        studyRoomState.appSettings = {
          appName: adminControlState.appName || 'mehulxstudy',
          logoUrl: adminControlState.logoUrl || settings.logoUrl || '',
          tagline: adminControlState.tagline || settings.tagline || 'Knowledge & Success',
        };
        changed = true;
      }

      if (changed) {
        lastRtdbSyncMs = Date.now();
        scheduleStudyRoomSave();
      }

      // Also fetch KGS batch catalog thumbnails in background if not yet populated
      if (Object.keys(studyRoomState.kgsThumbnailsByTitle).length === 0) {
        fetchKgsCatalog(false).catch(() => {});
      }
    } finally {
      rtdbSyncPromise = null;
    }
  })();

  return rtdbSyncPromise;
}

/**
 * Triggers the upstream Sahukgs.com scraper (`POST /api/sync` on Study ROOM API)
 * so any new lecture or PDF uploaded on https://www.sahukgs.com/batches for tracked
 * batches is immediately written to Firebase RTDB and synced into our server!
 */
async function triggerSahukgsLiveSync(
  force = false
): Promise<{ updated: number; message: string }> {
  const now = Date.now();
  if (!force && now - lastSahukgsUpstreamSyncMs < 180_000) {
    await syncStudyRoomFromFirebase(false);
    return { updated: 0, message: 'Up to date with sahukgs.com' };
  }
  if (sahukgsUpstreamSyncPromise) {
    return sahukgsUpstreamSyncPromise;
  }

  sahukgsUpstreamSyncPromise = (async () => {
    try {
      lastSahukgsUpstreamSyncMs = Date.now();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 14000);
      let updated = 0;
      let message = 'Synced from sahukgs.com/batches';
      try {
        const res = await fetch(`${STUDY_ROOM_API}/api/sync`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          signal: controller.signal,
        });
        clearTimeout(timer);
        if (res.ok) {
          const json: any = await res.json();
          updated = Number(json?.updated) || 0;
          message = json?.message || message;
        }
      } catch {
        clearTimeout(timer);
      }

      await syncStudyRoomFromFirebase(true);
      lastSahukgsSyncIso = new Date().toISOString();
      return { updated, message };
    } finally {
      sahukgsUpstreamSyncPromise = null;
    }
  })();

  return sahukgsUpstreamSyncPromise;
}

function normalizeItemsArray(rawItems?: any[] | Record<string, any>): any[] {
  if (!rawItems) return [];
  if (Array.isArray(rawItems)) return rawItems.filter(Boolean);
  if (typeof rawItems === 'object') return Object.values(rawItems).filter(Boolean);
  return [];
}

function makeStudyRoomCourseId(courseName: string, kgsBatchId?: string | null): string {
  if (kgsBatchId) return `sr_kgs_${kgsBatchId}`;
  const slug = courseName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 36);
  return `sr_${slug || 'course'}`;
}

interface ParsedStudyRoomCourse {
  id: string;
  course_name: string;
  course_thumbnail: string;
  provider: 'kgs' | 'pwthor';
  isArchived: boolean;
  isStudyRoom: true;
  subjectCount: number;
  lectureCount: number;
  orderIndex: number;
  folders: Array<{
    folderKey: string;
    folderName: string;
    createdAt: number;
    provider: 'kgs' | 'pwthor';
    items: any[];
  }>;
}

function buildStudyRoomCoursesMap(): Map<string, ParsedStudyRoomCourse> {
  const byCourseName = new Map<
    string,
    {
      courseName: string;
      isArchived: boolean;
      kgsBatchId: string | null;
      provider: 'kgs' | 'pwthor';
      folders: Array<{
        folderKey: string;
        folderName: string;
        createdAt: number;
        provider: 'kgs' | 'pwthor';
        items: any[];
      }>;
    }
  >();

  const processRecordMap = (
    recordMap: Record<string, StudyRoomFolderRecord>,
    isArchived: boolean
  ) => {
    for (const [folderKey, folder] of Object.entries(recordMap || {})) {
      if (!folder || !folder.courseName) continue;
      const courseName = String(folder.courseName).trim();
      const folderName = String(folder.folderName || 'General Classes').trim();
      const items = normalizeItemsArray(folder.items);

      const syncMatch = folderKey.match(/^sync_(\d+)_/);
      const kgsBatchId = syncMatch ? syncMatch[1] : null;
      const provider: 'kgs' | 'pwthor' =
        folder.provider === 'pwthor' || folderKey.startsWith('pw_') ? 'pwthor' : 'kgs';

      let entry = byCourseName.get(courseName);
      if (!entry) {
        entry = {
          courseName,
          isArchived,
          kgsBatchId,
          provider,
          folders: [],
        };
        byCourseName.set(courseName, entry);
      } else {
        if (!entry.kgsBatchId && kgsBatchId) entry.kgsBatchId = kgsBatchId;
        if (!isArchived) entry.isArchived = false;
      }

      entry.folders.push({
        folderKey,
        folderName,
        createdAt: Number(folder.createdAt) || 0,
        provider,
        items,
      });
    }
  };

  processRecordMap(studyRoomState.structuredLessons, false);
  processRecordMap(studyRoomState.archivedLessons, true);

  const resultById = new Map<string, ParsedStudyRoomCourse>();
  const orderList = studyRoomState.courseOrder || [];

  for (const entry of byCourseName.values()) {
    const id = makeStudyRoomCourseId(entry.courseName, entry.kgsBatchId);
    // Sort folders: Orientation first, then alphabetical
    entry.folders.sort((a, b) => {
      const aOrient = a.folderName.toLowerCase().includes('orientation');
      const bOrient = b.folderName.toLowerCase().includes('orientation');
      if (aOrient && !bOrient) return -1;
      if (!aOrient && bOrient) return 1;
      return a.folderName.localeCompare(b.folderName);
    });

    const totalLectures = entry.folders.reduce((sum, f) => sum + f.items.length, 0);
    const orderIdx = orderList.indexOf(entry.courseName);

    let thumb = '';
    if (entry.kgsBatchId && studyRoomState.kgsThumbnailsById[entry.kgsBatchId]) {
      thumb = studyRoomState.kgsThumbnailsById[entry.kgsBatchId];
    } else if (studyRoomState.kgsThumbnailsByTitle[entry.courseName.toLowerCase()]) {
      thumb = studyRoomState.kgsThumbnailsByTitle[entry.courseName.toLowerCase()];
    }

    resultById.set(id, {
      id,
      course_name: entry.courseName,
      course_thumbnail: thumb,
      provider: entry.provider,
      isArchived: entry.isArchived,
      isStudyRoom: true,
      subjectCount: entry.folders.length,
      lectureCount: totalLectures,
      orderIndex: orderIdx !== -1 ? orderIdx : 999,
      folders: entry.folders,
    });
  }

  return resultById;
}

function formatStudyRoomLectureItem(
  rawItem: any,
  idx: number,
  course: ParsedStudyRoomCourse,
  folder: { folderKey: string; folderName: string }
): any {
  const vLink1 = typeof rawItem.videoLink === 'string' ? rawItem.videoLink.trim() : '';
  const vLink2 = typeof rawItem.videoLink2 === 'string' ? rawItem.videoLink2.trim() : '';
  const ytId = extractYouTubeId(vLink1) || extractYouTubeId(vLink2);

  // Pick direct MP4/HLS stream if available
  const directStreamUrl =
    vLink2 && !extractYouTubeId(vLink2)
      ? vLink2
      : vLink1 && !extractYouTubeId(vLink1)
      ? vLink1
      : '';

  const pubDate = rawItem.publishedAt || rawItem.uploadedAt;
  let formattedDate = '';
  if (pubDate) {
    try {
      const d = new Date(pubDate);
      if (!isNaN(d.getTime())) {
        formattedDate = d.toLocaleDateString('en-IN', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        });
      }
    } catch {
      // ignore
    }
  }

  const thumb = ytId
    ? buildYouTubeThumbnailUrl(ytId)
    : course.course_thumbnail || '';

  return {
    id: `${folder.folderKey}_item_${idx}`,
    Title: rawItem.name || `Lecture ${idx + 1}`,
    thumbnail: thumb,
    date_and_time: formattedDate,
    publishedAt: rawItem.publishedAt || (rawItem.uploadedAt ? new Date(rawItem.uploadedAt).toISOString() : undefined),
    uploadedAt: rawItem.uploadedAt || (rawItem.publishedAt ? new Date(rawItem.publishedAt).getTime() : 0),
    videoLink: vLink1,
    videoLink2: vLink2,
    youtubeId: ytId,
    file_link: directStreamUrl,
    download_link: directStreamUrl,
    pdf_link: rawItem.pdfLink || '',
    type: rawItem.type || (vLink1 || vLink2 ? 'video' : 'note'),
    course_id: course.id,
    courseName: course.course_name,
    subject: folder.folderName,
    folderName: folder.folderName,
  };
}

function mergeByKey(existing: any[], incoming: any[], keyField: string): any[] {
  const map = new Map<string, any>();
  for (const item of existing || []) {
    if (item && item[keyField] != null) {
      map.set(String(item[keyField]), item);
    }
  }
  for (const item of incoming || []) {
    if (item && item[keyField] != null) {
      map.set(String(item[keyField]), item);
    }
  }
  return Array.from(map.values());
}

async function fetchUpstream(endpointPath: string): Promise<any> {
  const directUrl = `${UPSTREAM_BASE}${endpointPath}`;
  const proxiedUrl = `${WORKER_PROXY}${encodeURIComponent(directUrl)}`;
  const headers = {
    'X-API-Key': UPSTREAM_KEY,
    Accept: 'application/json',
  };

  for (const url of [directUrl, proxiedUrl]) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 7500);
      const res = await fetch(url, { headers, signal: controller.signal });
      clearTimeout(timeout);
      if (!res.ok) continue;
      const json: any = await res.json();
      if (
        json &&
        typeof json === 'object' &&
        'status' in json &&
        Number(json.status) !== 200
      ) {
        continue;
      }
      return json && typeof json === 'object' && 'data' in json && json.data !== undefined
        ? json.data
        : json;
    } catch {
      // try next fallback
    }
  }
  return null;
}

function getAlternateSachinSubjectId(subjectId: string): string {
  const sId = String(subjectId || '').trim();
  const map: Record<string, string> = {
    '2': '245',
    '56': '89',
    '81': '3',
    '200': '91',
    '10': '91',
    '214': '91',
    '219': '50',
    '183': '50',
  };
  return map[sId] || sId;
}

/**
 * Resolves the active upstream courseId and subjectId on maxxapi-sa.vercel.app
 * for Sachin Academy courses (maps CTET Paper-1 249 & 366 to active CTET 364 token).
 */
function resolveSachinUpstreamTarget(
  courseId: string,
  subjectId?: string
): { upstreamCourseId: string; upstreamSubjectId: string } {
  const cId = String(courseId || '').trim();
  const sId = String(subjectId || '').trim();
  if (cId === '249' || cId === '366') {
    if (sId === '56') {
      return { upstreamCourseId: '364', upstreamSubjectId: '89' };
    }
    if (sId === '2') {
      return { upstreamCourseId: '364', upstreamSubjectId: '245' };
    }
    return { upstreamCourseId: '364', upstreamSubjectId: sId };
  }
  return { upstreamCourseId: cId, upstreamSubjectId: sId };
}

let sharedSubTopCacheVersion = '';
let sharedSubTopMap = new Map<string, any[]>();

function ensureSharedSubTopIndex(): Map<string, any[]> {
  const ver = `${lecturesVault.updatedAt}_${Object.keys(lecturesVault.videosByTopic).length}`;
  if (sharedSubTopCacheVersion === ver && sharedSubTopMap.size > 0) {
    return sharedSubTopMap;
  }
  const nextMap = new Map<string, any[]>();
  for (const [k, vids] of Object.entries(lecturesVault.videosByTopic)) {
    if (!Array.isArray(vids) || vids.length === 0) continue;
    const parts = k.split('_');
    if (parts.length < 3) continue;
    const [, sId, tId] = parts;
    const stKey = `${sId}_${tId}`;
    const existing = nextMap.get(stKey);
    if (!existing || existing.length < vids.length) {
      nextMap.set(stKey, vids);
    }
  }
  sharedSubTopMap = nextMap;
  sharedSubTopCacheVersion = ver;
  return sharedSubTopMap;
}

function getSharedTopicVideos(courseId: string, subjectId: string, topicId: string): any[] {
  const cId = String(courseId || '').trim();
  const sId = String(subjectId || '').trim();
  const tId = String(topicId || '').trim();
  const { upstreamCourseId, upstreamSubjectId } = resolveSachinUpstreamTarget(cId, sId);

  const direct = lecturesVault.videosByTopic[`${cId}_${sId}_${tId}`];
  if (Array.isArray(direct) && direct.length > 0) return direct;

  const upstreamArr = lecturesVault.videosByTopic[`${upstreamCourseId}_${upstreamSubjectId}_${tId}`];
  if (Array.isArray(upstreamArr) && upstreamArr.length > 0) return upstreamArr;

  const idx = ensureSharedSubTopIndex();
  const sharedPrimary = idx.get(`${sId}_${tId}`);
  if (Array.isArray(sharedPrimary) && sharedPrimary.length > 0) return sharedPrimary;

  const altSid = getAlternateSachinSubjectId(sId);
  const sharedAlt = idx.get(`${altSid}_${tId}`);
  if (Array.isArray(sharedAlt) && sharedAlt.length > 0) return sharedAlt;

  return [];
}

function annotateTopicWithCounts(courseId: string, subjectId: string, top: any): any {
  const topId = String(top?.topicid || '');
  const vids = getSharedTopicVideos(courseId, subjectId, topId);
  let lectureCount = 0;
  let noteCount = 0;
  for (const item of vids) {
    if (!item || typeof item !== 'object') continue;
    if (item.material_type === 'PDF' || item.type === 'note') {
      noteCount++;
    } else {
      lectureCount++;
    }
  }
  return {
    ...top,
    topicid: topId,
    topic_name: String(top?.topic_name || `Chapter ${topId}`),
    lectureCount: vids.length,
    videoCount: lectureCount,
    noteCount,
  };
}

function getSachinTopicsForSubject(courseId: string, subjectId: string): any[] {
  const cId = String(courseId || '').trim();
  const sId = String(subjectId || '').trim();
  const ownTopics = archiveStore.topicsBySubject[`${cId}_${sId}`] || [];

  let ownVideosCount = 0;
  for (const t of ownTopics) {
    ownVideosCount += getSharedTopicVideos(cId, sId, String(t.topicid)).length;
  }

  if (ownVideosCount > 0 && cId !== '249' && cId !== '366') {
    return ownTopics.map((t) => annotateTopicWithCounts(cId, sId, t));
  }

  const altSid = getAlternateSachinSubjectId(sId);
  let bestDonorTopics: any[] = [];
  let bestDonorCount = 0;

  for (const [tk, tList] of Object.entries(archiveStore.topicsBySubject)) {
    if (!Array.isArray(tList) || tList.length === 0) continue;
    const [donCid, donSid] = tk.split('_');
    if (donSid !== sId && donSid !== altSid) continue;
    let count = 0;
    for (const t of tList) {
      count += getSharedTopicVideos(donCid, donSid, String(t.topicid)).length;
    }
    if (
      count > bestDonorCount ||
      (donCid === '364' && count > 0 && count >= bestDonorCount)
    ) {
      bestDonorCount = count;
      bestDonorTopics = tList;
    }
  }

  const topicMap = new Map<string, any>();
  for (const t of ownTopics) {
    const annotated = annotateTopicWithCounts(cId, sId, t);
    topicMap.set(annotated.topicid, annotated);
  }

  if (ownVideosCount === 0 || cId === '366') {
    for (const t of bestDonorTopics) {
      const annotated = annotateTopicWithCounts(cId, sId, t);
      if (annotated.lectureCount > 0 && !topicMap.has(annotated.topicid)) {
        topicMap.set(annotated.topicid, annotated);
      }
    }
  }

  const resolved = Array.from(topicMap.values());
  if (resolved.length > 0) {
    return resolved;
  }
  return ownTopics.map((t) => annotateTopicWithCounts(cId, sId, t));
}

function computeSachinSubjectStats(
  courseId: string,
  subjectId: string
): { topicCount: number; lectureCount: number; noteCount: number; hasScannedTopics: boolean } {
  const cId = String(courseId || '').trim();
  const sId = String(subjectId || '').trim();
  const topics = getSachinTopicsForSubject(cId, sId);

  const seenIds = new Set<string>();
  let totalItems = 0;
  let noteCount = 0;
  let topicsWithLectures = 0;

  for (const top of topics) {
    const topId = String(top.topicid);
    const arr = getSharedTopicVideos(cId, sId, topId);
    if (arr.length > 0) {
      topicsWithLectures++;
      for (const item of arr) {
        if (!item || typeof item !== 'object') continue;
        const itemId = String(item.id || `${topId}_${totalItems}`);
        if (seenIds.has(itemId)) continue;
        seenIds.add(itemId);
        totalItems++;
        if (item.material_type === 'PDF' || item.type === 'note') {
          noteCount++;
        }
      }
    }
  }

  return {
    topicCount: topics.length,
    lectureCount: totalItems > 0 ? totalItems : topics.length,
    noteCount,
    hasScannedTopics: topicsWithLectures > 0,
  };
}

function computeSachinBatchSummary(
  courseId: string,
  includeHidden = true
): {
  subjectCount: number;
  lectureCount: number;
  subjects: Array<{
    subjectid: string;
    subject_name: string;
    subject_logo?: string;
    sortingparam?: any;
    topicCount: number;
    lectureCount: number;
    noteCount: number;
    isHidden: boolean;
  }>;
} {
  const cId = String(courseId || '').trim();
  const rawSubjects = archiveStore.subjectsByBatch[cId] || [];
  const annotatedSubjects = rawSubjects.map((s: any) => {
    const sId = String(s.subjectid);
    const stats = computeSachinSubjectStats(cId, sId);
    return {
      ...s,
      subjectid: sId,
      subject_name: String(s.subject_name || `Subject ${sId}`),
      topicCount: stats.topicCount,
      lectureCount: stats.lectureCount,
      noteCount: stats.noteCount,
      isHidden: checkSubjectHidden(cId, sId),
    };
  });

  const visibleSubjects = includeHidden
    ? annotatedSubjects
    : annotatedSubjects.filter((s) => !s.isHidden);

  const totalLectures = visibleSubjects.reduce(
    (sum, s) => sum + (Number(s.lectureCount) || 0),
    0
  );

  return {
    subjectCount: visibleSubjects.length,
    lectureCount: totalLectures,
    subjects: visibleSubjects,
  };
}

loadStores();
// Trigger initial Firebase RTDB + Sahukgs.com live sync on server boot
syncStudyRoomFromFirebase(true)
  .then(() => triggerSahukgsLiveSync(false))
  .catch(() => {});

// Automatic background KGS Auto-Sync every 5 minutes so new lectures from sahukgs.com/batches appear automatically
setInterval(() => {
  triggerSahukgsLiveSync(false).catch(() => {});
}, 5 * 60 * 1000);

async function startServer() {
  const app = express();
  app.set('trust proxy', true);
  app.use(express.json({ limit: '15mb' }));

  // Visitor IP & Activity Beacon Endpoint
  app.post('/api/visit', (req, res) => {
    const { action, clientPublicIp, location } = req.body || {};
    const entry = recordVisitorActivity(req, {
      action: action ? String(action) : 'Opened mehulxstudy Website',
      clientPublicIp: clientPublicIp ? String(clientPublicIp) : undefined,
      location: location ? String(location) : undefined,
    });
    res.json({ success: true, visitor: entry });
  });

  app.get('/api/admin/visitors', (_req, res) => {
    res.json({
      visitors: adminControlState.visitorLogs || [],
      totalUniqueIps: new Set((adminControlState.visitorLogs || []).map((v) => v.ip)).size,
      totalVisits: (adminControlState.visitorLogs || []).reduce(
        (sum, v) => sum + (Number(v.visitCount) || 1),
        0
      ),
    });
  });

  app.post('/api/admin/visitors/clear', (req, res) => {
    const { password } = req.body || {};
    if (password && String(password).trim() !== ADMIN_PASSWORD) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    adminControlState.visitorLogs = [];
    saveAdminControlNow();
    res.json({ success: true, visitors: [] });
  });

  // Permanent Key Status — Always active, never expires
  app.post('/api/keys/activate', (_req, res) => {
    const now = Date.now();
    res.json({
      success: true,
      key: 'study_room_permanent_lifetime_access',
      activatedAt: now,
      expiresAt: now + 365 * 24 * 3600 * 1000,
      remainingSeconds: 365 * 24 * 3600,
      message: 'Permanent Lifetime Access Active!',
    });
  });

  app.get('/api/keys/status', (_req, res) => {
    const now = Date.now();
    res.json({
      active: true,
      expired: false,
      key: 'study_room_permanent_lifetime_access',
      activatedAt: now,
      expiresAt: now + 365 * 24 * 3600 * 1000,
      remainingSeconds: 365 * 24 * 3600,
    });
  });

  // Website Lock & Admin Authentication Endpoints
  app.get('/api/site-lock/status', (_req, res) => {
    const hasCode = Boolean(adminControlState.lockCode.trim());
    res.json({
      lockEnabled: Boolean(adminControlState.lockEnabled && hasCode),
      hasLockCode: hasCode,
      lockVersion: adminControlState.lockVersion,
      appName: adminControlState.appName || 'mehulxstudy',
    });
  });

  app.post('/api/site-lock/verify', (req, res) => {
    const code = String(req.body?.code || '').trim();
    const expected = adminControlState.lockCode.trim();
    const isLocked = Boolean(adminControlState.lockEnabled && expected);
    const valid = !isLocked || code === expected || code === ADMIN_PASSWORD;
    recordVisitorActivity(req, {
      action: valid ? 'Unlocked Website with Access Code' : 'Failed Website Lock Code Attempt',
    });
    res.json({
      valid,
      lockEnabled: isLocked,
      lockVersion: adminControlState.lockVersion,
    });
  });

  app.post('/api/admin/login', (req, res) => {
    const password = String(req.body?.password || '').trim();
    if (password === ADMIN_PASSWORD) {
      res.json({ success: true });
      return;
    }
    res.status(401).json({ success: false, error: 'Invalid Admin Password' });
  });

  app.post('/api/admin/site-lock', (req, res) => {
    const { password, lockEnabled, lockCode } = req.body || {};
    if (String(password || '').trim() !== ADMIN_PASSWORD) {
      res.status(401).json({ error: 'Unauthorized: Invalid Admin Password' });
      return;
    }
    const cleanCode = lockCode !== undefined ? String(lockCode).trim() : adminControlState.lockCode;
    const nextEnabled = Boolean(lockEnabled) && Boolean(cleanCode);
    adminControlState.lockCode = cleanCode;
    adminControlState.lockEnabled = nextEnabled;
    adminControlState.lockVersion = `v_${Date.now()}`;
    saveAdminControlNow();
    res.json({
      success: true,
      siteLock: {
        lockEnabled: adminControlState.lockEnabled,
        lockCode: adminControlState.lockCode,
        lockVersion: adminControlState.lockVersion,
      },
    });
  });

  // 1. Batches (Combines Study ROOM Live & Archived Courses + Sachin Academy Batches)
  app.get('/api/my-batches', async (req, res) => {
    const includeHidden = req.query.includeHidden === '1';
    if (!includeHidden) {
      recordVisitorActivity(req, { action: 'Viewing All Batches (Home Page)' });
    }
    await syncStudyRoomFromFirebase(false);
    // Non-blocking background check against sahukgs.com if >3 mins since last check
    if (Date.now() - lastSahukgsUpstreamSyncMs > 180_000) {
      triggerSahukgsLiveSync(false).catch(() => {});
    }
    const srCoursesMap = buildStudyRoomCoursesMap();
    const srBatches = Array.from(srCoursesMap.values()).map((c) => {
      const visibleFolders = c.folders.filter(
        (f) => !checkSubjectHidden(c.id, f.folderKey)
      );
      let visibleLectureCount = 0;
      for (const f of visibleFolders) {
        for (let idx = 0; idx < f.items.length; idx++) {
          const itemId = `${f.folderKey}_item_${idx}`;
          if (!checkLectureHidden(itemId, c.id, f.folderKey)) {
            visibleLectureCount++;
          }
        }
      }
      return {
        id: c.id,
        course_name: c.course_name,
        course_thumbnail: c.course_thumbnail,
        provider: c.provider,
        isArchived: c.isArchived,
        isHidden: checkBatchHidden(c.id, c.course_name),
        isStudyRoom: true,
        subjectCount: includeHidden ? c.subjectCount : visibleFolders.length,
        lectureCount: includeHidden ? c.lectureCount : visibleLectureCount,
        orderIndex: c.orderIndex,
      };
    });

    const sachinBatches = (archiveStore.batches || []).map((b) => {
      const cId = String(b.id);
      const summary = computeSachinBatchSummary(cId, includeHidden);
      return {
        ...b,
        provider: 'sachin',
        isArchived: false,
        isHidden: checkBatchHidden(cId, b.course_name),
        isStudyRoom: false,
        subjectCount: summary.subjectCount,
        lectureCount: summary.lectureCount,
      };
    });

    const combined = [...srBatches, ...sachinBatches];
    const filtered = includeHidden ? combined : combined.filter((b) => !b.isHidden);

    res.json({
      data: filtered,
      pinnedCourses: studyRoomState.pinnedCourses,
      appSettings: {
        ...studyRoomState.appSettings,
        appName: adminControlState.appName || 'mehulxstudy',
      },
      siteLock: {
        lockEnabled: Boolean(adminControlState.lockEnabled && adminControlState.lockCode.trim()),
        hasLockCode: Boolean(adminControlState.lockCode.trim()),
        lockVersion: adminControlState.lockVersion,
      },
      lastSahukgsSyncAt: lastSahukgsSyncIso,
    });
  });

  // 2. Subjects / Folders for a Batch
  app.get('/api/subjects', async (req, res) => {
    const courseId = String(req.query.courseid || '');
    const includeHidden = req.query.includeHidden === '1';
    if (!courseId) {
      res.status(400).json({ error: 'Missing courseid' });
      return;
    }

    if (!includeHidden && checkBatchHidden(courseId)) {
      res.json({ data: [] });
      return;
    }

    if (courseId.startsWith('sr_')) {
      await syncStudyRoomFromFirebase(false);
      if (Date.now() - lastSahukgsUpstreamSyncMs > 180_000) {
        triggerSahukgsLiveSync(false).catch(() => {});
      }
      const srCoursesMap = buildStudyRoomCoursesMap();
      const course = srCoursesMap.get(courseId);
      if (!course) {
        res.json({ data: [] });
        return;
      }
      const subjects = course.folders
        .map((f, index) => {
          const visibleItems = includeHidden
            ? f.items
            : f.items.filter(
                (_, idx) => !checkLectureHidden(`${f.folderKey}_item_${idx}`, courseId, f.folderKey)
              );
          const videoCount = visibleItems.filter(
            (i) => i.type === 'video' || i.videoLink || i.videoLink2
          ).length;
          const noteCount = visibleItems.filter((i) => i.type === 'note' || i.pdfLink).length;
          return {
            subjectid: f.folderKey,
            subject_name: f.folderName,
            sortingparam: index + 1,
            lectureCount: videoCount || visibleItems.length,
            noteCount,
            directLectures: true,
            provider: f.provider,
            isHidden: checkSubjectHidden(courseId, f.folderKey),
          };
        })
        .filter((s) => includeHidden || !s.isHidden);
      res.json({ data: subjects });
      return;
    }

    const { upstreamCourseId } = resolveSachinUpstreamTarget(courseId);
    let archived = archiveStore.subjectsByBatch[courseId] || [];
    if (archived.length === 0) {
      const live = await fetchUpstream(
        `/api/subjects?courseid=${encodeURIComponent(courseId)}`
      );
      const liveList = Array.isArray(live) ? live : [];
      if (liveList.length > 0) {
        archived = liveList;
        archiveStore.subjectsByBatch[courseId] = liveList;
      } else if (upstreamCourseId !== courseId) {
        const donorSubs = archiveStore.subjectsByBatch[upstreamCourseId] || [];
        if (donorSubs.length > 0) {
          archiveStore.subjectsByBatch[courseId] = donorSubs;
        }
      }
    }

    const summary = computeSachinBatchSummary(courseId, includeHidden);
    res.json({ data: summary.subjects });
  });

  // 3. Topics / Chapters for a Subject
  app.get('/api/topics', async (req, res) => {
    const courseId = String(req.query.courseid || '');
    const subjectId = String(req.query.subjectid || '');
    const includeHidden = req.query.includeHidden === '1';
    if (!courseId || !subjectId) {
      res.status(400).json({ error: 'Missing courseid or subjectid' });
      return;
    }

    if (!includeHidden && (checkBatchHidden(courseId) || checkSubjectHidden(courseId, subjectId))) {
      res.json({ data: [] });
      return;
    }

    if (courseId.startsWith('sr_')) {
      await syncStudyRoomFromFirebase(false);
      const srCoursesMap = buildStudyRoomCoursesMap();
      const course = srCoursesMap.get(courseId);
      const folder = course?.folders.find((f) => f.folderKey === subjectId);
      if (!folder) {
        res.json({ data: [] });
        return;
      }
      res.json({
        data: [
          {
            topicid: folder.folderKey,
            topic_name: folder.folderName,
            sortingparam: 1,
            lectureCount: folder.items.length,
          },
        ],
      });
      return;
    }

    const { upstreamCourseId, upstreamSubjectId } = resolveSachinUpstreamTarget(
      courseId,
      subjectId
    );
    const key = `${courseId}_${subjectId}`;
    let topics = getSachinTopicsForSubject(courseId, subjectId);

    if (topics.length === 0) {
      const live = await fetchUpstream(
        `/api/topics?courseid=${encodeURIComponent(upstreamCourseId)}&subjectid=${encodeURIComponent(upstreamSubjectId)}`
      );
      const liveList = Array.isArray(live) ? live : [];
      if (liveList.length > 0) {
        archiveStore.topicsBySubject[key] = liveList;
        topics = liveList.map((t) => annotateTopicWithCounts(courseId, subjectId, t));
      }
    }

    const sorted = [...topics].sort(
      (a, b) => (Number(a.sortingparam) || 0) - (Number(b.sortingparam) || 0)
    );
    res.json({ data: sorted });
  });

  // 4. Videos / Lectures for a Topic or Study ROOM Subject Folder (Supports topicid=all to return all chapters in subject!)
  app.get('/api/videos', async (req, res) => {
    const courseId = String(req.query.courseid || '');
    const subjectId = String(req.query.subjectid || '');
    const topicId = String(req.query.topicid || subjectId || '');
    const includeHidden = req.query.includeHidden === '1';
    const forceRefresh = req.query.refresh === '1';
    if (!courseId || !subjectId) {
      res.status(400).json({ error: 'Missing courseid or subjectid' });
      return;
    }

    if (!includeHidden && (checkBatchHidden(courseId) || checkSubjectHidden(courseId, subjectId))) {
      res.json({ data: [] });
      return;
    }

    if (courseId.startsWith('sr_')) {
      await syncStudyRoomFromFirebase(false);
      const srCoursesMap = buildStudyRoomCoursesMap();
      const course = srCoursesMap.get(courseId);
      const folder =
        course?.folders.find((f) => f.folderKey === subjectId) ||
        course?.folders.find((f) => f.folderKey === topicId);
      if (!course || !folder) {
        res.json({ data: [] });
        return;
      }
      const lectures = folder.items
        .map((item, idx) => {
          const formatted = applyLectureOverride(
            formatStudyRoomLectureItem(item, idx, course, folder),
            courseId
          );
          return {
            ...formatted,
            isHidden: checkLectureHidden(formatted.id, courseId, folder.folderKey),
          };
        })
        .filter((lec) => includeHidden || !lec.isHidden);
      res.json({ data: lectures });
      return;
    }

    // Special Mode: topicid=all returns ALL lectures across ALL chapters of this Sachin Academy subject
    if (topicId.toLowerCase() === 'all') {
      const topics = getSachinTopicsForSubject(courseId, subjectId);
      const { upstreamCourseId, upstreamSubjectId } = resolveSachinUpstreamTarget(
        courseId,
        subjectId
      );

      // Auto-fetch any topics that have 0 cached videos in lecturesVault
      const missingTops = topics.filter(
        (t) =>
          forceRefresh ||
          getSharedTopicVideos(courseId, subjectId, String(t.topicid)).length === 0
      );
      if (missingTops.length > 0) {
        let modified = false;
        let idx = 0;
        const workers = Array.from({ length: Math.min(6, missingTops.length) }, async () => {
          while (idx < missingTops.length) {
            const top = missingTops[idx++];
            const topId = String(top.topicid);
            let vids = await fetchUpstream(
              `/api/videos?courseid=${encodeURIComponent(courseId)}&subjectid=${encodeURIComponent(subjectId)}&topicid=${encodeURIComponent(topId)}`
            );
            if ((!Array.isArray(vids) || vids.length === 0) && upstreamCourseId !== courseId) {
              vids = await fetchUpstream(
                `/api/videos?courseid=${encodeURIComponent(upstreamCourseId)}&subjectid=${encodeURIComponent(upstreamSubjectId)}&topicid=${encodeURIComponent(topId)}`
              );
            }
            if (Array.isArray(vids) && vids.length > 0) {
              lecturesVault.videosByTopic[`${courseId}_${subjectId}_${topId}`] = vids;
              lecturesVault.videosByTopic[
                `${upstreamCourseId}_${upstreamSubjectId}_${topId}`
              ] = vids;
              modified = true;
            }
          }
        });
        await Promise.all(workers);
        if (modified) {
          sharedSubTopCacheVersion = '';
          scheduleVaultSave();
        }
      }

      const seenLectureIds = new Set<string>();
      const aggregated: any[] = [];

      for (const top of topics) {
        const topId = String(top.topicid);
        const topName = String(top.topic_name || '');
        const vids = getSharedTopicVideos(courseId, subjectId, topId);
        for (const lec of vids) {
          if (!lec || typeof lec !== 'object') continue;
          const lid = String(lec.id || '').trim();
          if (!lid || seenLectureIds.has(lid)) continue;
          seenLectureIds.add(lid);
          aggregated.push(
            applyLectureOverride(
              {
                ...lec,
                course_id: courseId,
                topicid: topId,
                topic_name: topName,
                isHidden: checkLectureHidden(lid, courseId, subjectId),
              },
              courseId
            )
          );
        }
      }

      const filtered = aggregated.filter((lec) => includeHidden || !lec.isHidden);
      res.json({ data: filtered });
      return;
    }

    const { upstreamCourseId, upstreamSubjectId } = resolveSachinUpstreamTarget(
      courseId,
      subjectId
    );
    const key = `${courseId}_${subjectId}_${topicId}`;
    const upstreamKey = `${upstreamCourseId}_${upstreamSubjectId}_${topicId}`;
    const archived = getSharedTopicVideos(courseId, subjectId, topicId);

    let merged = archived;
    if (archived.length === 0 || forceRefresh) {
      const live = await fetchUpstream(
        `/api/videos?courseid=${encodeURIComponent(upstreamCourseId)}&subjectid=${encodeURIComponent(upstreamSubjectId)}&topicid=${encodeURIComponent(topicId)}`
      );
      const liveList = Array.isArray(live) ? live : [];
      merged = mergeByKey(archived, liveList, 'id');
      if (merged.length > 0) {
        lecturesVault.videosByTopic[key] = merged;
        lecturesVault.videosByTopic[upstreamKey] = merged;
        sharedSubTopCacheVersion = '';
        scheduleVaultSave();
      }
    }

    const annotated = merged
      .map((lec) =>
        applyLectureOverride(
          {
            ...lec,
            course_id: courseId,
            isHidden: checkLectureHidden(String(lec.id), courseId, subjectId),
          },
          courseId
        )
      )
      .filter((lec) => includeHidden || !lec.isHidden);
    res.json({ data: annotated });
  });

  // 5. Live & Upcoming Videos
  app.get('/api/live-upcoming', async (req, res) => {
    const courseId = String(req.query.courseid || '');
    const includeHidden = req.query.includeHidden === '1';
    const forceRefresh = req.query.refresh === '1';
    if (!courseId || courseId.startsWith('sr_')) {
      res.json({ data: [] });
      return;
    }
    if (!includeHidden && checkBatchHidden(courseId)) {
      res.json({ data: [] });
      return;
    }
    const archived = lecturesVault.liveByCourse[courseId] || [];
    let merged = archived;
    if (forceRefresh) {
      const { upstreamCourseId } = resolveSachinUpstreamTarget(courseId);
      const live = await fetchUpstream(
        `/api/live-upcoming?courseid=${encodeURIComponent(upstreamCourseId)}`
      );
      const incoming: any[] = [];
      if (Array.isArray(live)) {
        incoming.push(...live);
      } else if (live && typeof live === 'object') {
        if (Array.isArray(live.live)) incoming.push(...live.live);
        if (Array.isArray(live.upcoming)) incoming.push(...live.upcoming);
      }
      merged = mergeByKey(archived, incoming, 'id');
      if (merged.length > 0) {
        lecturesVault.liveByCourse[courseId] = merged;
        scheduleVaultSave();
      }
    }
    const annotated = merged
      .map((lec) => ({
        ...lec,
        course_id: courseId,
        isHidden: checkLectureHidden(String(lec.id), courseId),
      }))
      .filter((lec) => includeHidden || !lec.isHidden);
    res.json({ data: annotated });
  });

  // 6. Previous Live Videos
  app.get('/api/previous-live-videos', async (req, res) => {
    const courseId = String(req.query.courseid || '');
    const includeHidden = req.query.includeHidden === '1';
    const forceRefresh = req.query.refresh === '1';
    if (!courseId || courseId.startsWith('sr_')) {
      res.json({ data: [] });
      return;
    }
    if (!includeHidden && checkBatchHidden(courseId)) {
      res.json({ data: [] });
      return;
    }
    const archived = lecturesVault.prevLiveByCourse[courseId] || [];
    let merged = archived;
    if (forceRefresh) {
      const { upstreamCourseId } = resolveSachinUpstreamTarget(courseId);
      const live = await fetchUpstream(
        `/api/previous-live-videos?courseid=${encodeURIComponent(upstreamCourseId)}`
      );
      const liveList = Array.isArray(live) ? live : [];
      merged = mergeByKey(archived, liveList, 'id');
      if (merged.length > 0) {
        lecturesVault.prevLiveByCourse[courseId] = merged;
        scheduleVaultSave();
      }
    }
    const annotated = merged
      .map((lec) => ({
        ...lec,
        course_id: courseId,
        isHidden: checkLectureHidden(String(lec.id), courseId),
      }))
      .filter((lec) => includeHidden || !lec.isHidden);
    res.json({ data: annotated });
  });

  // 7. Single Video Details (Supports both Study ROOM and Sachin Academy lectures)
  app.get('/api/video-details', async (req, res) => {
    const courseId = String(req.query.courseid || '');
    const videoId = String(req.query.videoid || '');
    if (!courseId || !videoId) {
      res.status(400).json({ error: 'Missing courseid or videoid' });
      return;
    }

    if (courseId.startsWith('sr_')) {
      const srCoursesMap = buildStudyRoomCoursesMap();
      const course = srCoursesMap.get(courseId);
      if (course) {
        for (const folder of course.folders) {
          for (let i = 0; i < folder.items.length; i++) {
            const candidateId = `${folder.folderKey}_item_${i}`;
            if (candidateId === videoId) {
              const formatted = applyLectureOverride(
                formatStudyRoomLectureItem(folder.items[i], i, course, folder),
                courseId
              );
              res.json({ data: formatted });
              return;
            }
          }
        }
      }
      res.status(404).json({ error: 'Study ROOM lecture not found' });
      return;
    }

    const { upstreamCourseId } = resolveSachinUpstreamTarget(courseId);
    const key = `${courseId}_${videoId}`;
    const upstreamKey = `${upstreamCourseId}_${videoId}`;
    let live = await fetchUpstream(
      `/api/video-details?courseid=${encodeURIComponent(upstreamCourseId)}&videoid=${encodeURIComponent(videoId)}`
    );
    if ((!live || typeof live !== 'object') && upstreamCourseId !== courseId) {
      live = await fetchUpstream(
        `/api/video-details?courseid=${encodeURIComponent(courseId)}&videoid=${encodeURIComponent(videoId)}`
      );
    }
    if (live && typeof live === 'object') {
      lecturesVault.videoDetailsById[key] = live;
      lecturesVault.videoDetailsById[upstreamKey] = live;
      scheduleVaultSave();
      res.json({ data: applyLectureOverride(live, courseId) });
      return;
    }
    const cachedDetail =
      lecturesVault.videoDetailsById[upstreamKey] || lecturesVault.videoDetailsById[key];
    if (cachedDetail) {
      res.json({ data: applyLectureOverride(cachedDetail, courseId) });
      return;
    }
    res.status(404).json({ error: 'Video details not found' });
  });

  // 8. Global Search Across All Visible Lectures & Notes (KGS, PWThor & Sachin Academy)
  app.get('/api/search', async (req, res) => {
    const q = String(req.query.q || '').toLowerCase().trim();
    if (!q) {
      res.json({ data: [] });
      return;
    }
    await syncStudyRoomFromFirebase(false);
    const srCoursesMap = buildStudyRoomCoursesMap();
    const results: any[] = [];

    for (const course of srCoursesMap.values()) {
      if (checkBatchHidden(course.id, course.course_name)) continue;
      for (const folder of course.folders) {
        if (checkSubjectHidden(course.id, folder.folderKey)) continue;
        for (let idx = 0; idx < folder.items.length; idx++) {
          const itemId = `${folder.folderKey}_item_${idx}`;
          if (checkLectureHidden(itemId, course.id, folder.folderKey)) continue;
          const rawItem = folder.items[idx];
          const itemName = String(rawItem?.name || '').toLowerCase();
          const folderName = folder.folderName.toLowerCase();
          const courseName = course.course_name.toLowerCase();
          if (itemName.includes(q) || folderName.includes(q) || courseName.includes(q)) {
            results.push(formatStudyRoomLectureItem(rawItem, idx, course, folder));
            if (results.length >= 80) break;
          }
        }
        if (results.length >= 80) break;
      }
      if (results.length >= 80) break;
    }

    // Also search Sachin Academy vault lectures if space remains
    if (results.length < 80) {
      const sachinBatchMap = new Map<string, any>();
      for (const b of archiveStore.batches || []) {
        sachinBatchMap.set(String(b.id), b);
      }
      for (const [vKey, list] of Object.entries(lecturesVault.videosByTopic)) {
        if (!Array.isArray(list)) continue;
        const [cId, sId] = vKey.split('_');
        const batchObj = sachinBatchMap.get(String(cId));
        if (checkBatchHidden(String(cId), batchObj?.course_name)) continue;
        if (sId && checkSubjectHidden(String(cId), String(sId))) continue;
        for (const lec of list) {
          if (!lec || !lec.id) continue;
          if (checkLectureHidden(String(lec.id), String(cId), String(sId))) continue;
          const title = String(lec.Title || '').toLowerCase();
          const bName = String(batchObj?.course_name || '').toLowerCase();
          if (title.includes(q) || bName.includes(q)) {
            results.push({
              ...lec,
              course_id: String(cId),
              courseName: batchObj?.course_name || `Batch #${cId}`,
            });
            if (results.length >= 80) break;
          }
        }
        if (results.length >= 80) break;
      }
    }

    res.json({ data: results });
  });

  // 9. mehulxstudy Admin Panel & Visibility Control Endpoints
  app.get('/api/admin/overview', async (_req, res) => {
    await syncStudyRoomFromFirebase(true);
    const srCoursesMap = buildStudyRoomCoursesMap();
    const srCourses = Array.from(srCoursesMap.values()).map((c) => ({
      id: c.id,
      courseName: c.course_name,
      provider: c.provider as 'kgs' | 'pwthor' | 'sachin',
      isArchived: c.isArchived,
      isHidden: checkBatchHidden(c.id, c.course_name),
      isStudyRoom: true,
      subjectCount: c.subjectCount,
      lectureCount: c.lectureCount,
      folders: c.folders.map((f) => ({
        folderKey: f.folderKey,
        folderName: f.folderName,
        itemCount: f.items.length,
        isHidden: checkSubjectHidden(c.id, f.folderKey),
      })),
    }));

    const sachinCourses = (archiveStore.batches || []).map((b) => {
      const cId = String(b.id);
      const summary = computeSachinBatchSummary(cId, true);
      return {
        id: cId,
        courseName: String(b.course_name || `Batch #${cId}`),
        provider: 'sachin' as const,
        isArchived: false,
        isHidden: checkBatchHidden(cId, b.course_name),
        isStudyRoom: false,
        subjectCount: summary.subjects.length,
        lectureCount: summary.lectureCount,
        folders: summary.subjects.map((s) => ({
          folderKey: String(s.subjectid),
          folderName: String(s.subject_name || 'Subject'),
          itemCount: s.lectureCount,
          isHidden: checkSubjectHidden(cId, String(s.subjectid)),
        })),
      };
    });

    res.json({
      appSettings: {
        ...studyRoomState.appSettings,
        appName: adminControlState.appName || 'mehulxstudy',
      },
      siteLock: {
        lockEnabled: adminControlState.lockEnabled,
        lockCode: adminControlState.lockCode,
        lockVersion: adminControlState.lockVersion,
      },
      hiddenBatchIds: adminControlState.hiddenBatchIds,
      hiddenSubjectKeys: adminControlState.hiddenSubjectKeys,
      hiddenLectureIds: adminControlState.hiddenLectureIds,
      visitorLogs: adminControlState.visitorLogs || [],
      pinnedCourses: studyRoomState.pinnedCourses,
      trackedBatches: studyRoomState.trackedBatches,
      customBatchNames: studyRoomState.customBatchNames,
      courses: [...srCourses, ...sachinCourses],
    });
  });

  app.post('/api/admin/visibility', (req, res) => {
    const { type, ids, courseId, courseName, hidden } = req.body || {};
    if (!type || !Array.isArray(ids)) {
      res.status(400).json({ error: 'type and ids array are required' });
      return;
    }
    const shouldHide = Boolean(hidden);

    if (type === 'batch') {
      const set = new Set(adminControlState.hiddenBatchIds);
      for (const rawId of ids) {
        const cleanId = String(rawId).trim();
        if (!cleanId) continue;
        if (shouldHide) {
          set.add(cleanId);
          if (courseName) set.add(String(courseName).trim());
        } else {
          set.delete(cleanId);
          if (courseName) set.delete(String(courseName).trim());
        }
      }
      adminControlState.hiddenBatchIds = Array.from(set);
      saveAdminControlNow();
      res.json({
        success: true,
        hiddenBatchIds: adminControlState.hiddenBatchIds,
      });
      return;
    }

    if (type === 'subject') {
      const set = new Set(adminControlState.hiddenSubjectKeys);
      for (const rawId of ids) {
        const cleanId = String(rawId).trim();
        if (!cleanId) continue;
        const composite = courseId ? `${courseId}::${cleanId}` : cleanId;
        if (shouldHide) {
          set.add(cleanId);
          set.add(composite);
        } else {
          set.delete(cleanId);
          set.delete(composite);
        }
      }
      adminControlState.hiddenSubjectKeys = Array.from(set);
      saveAdminControlNow();
      res.json({
        success: true,
        hiddenSubjectKeys: adminControlState.hiddenSubjectKeys,
      });
      return;
    }

    if (type === 'lecture') {
      const set = new Set(adminControlState.hiddenLectureIds);
      for (const rawId of ids) {
        const cleanId = String(rawId).trim();
        if (!cleanId) continue;
        const composite = courseId ? `${courseId}::${cleanId}` : cleanId;
        if (shouldHide) {
          set.add(cleanId);
          set.add(composite);
        } else {
          set.delete(cleanId);
          set.delete(composite);
        }
      }
      adminControlState.hiddenLectureIds = Array.from(set);
      saveAdminControlNow();
      res.json({
        success: true,
        hiddenLectureIds: adminControlState.hiddenLectureIds,
      });
      return;
    }

    res.status(400).json({ error: 'Invalid visibility type' });
  });

  // Save or Clear Permanent Backup YT / Server MP4 Link on Any Lecture
  app.post('/api/admin/lecture-backup', (req, res) => {
    const { courseId, lectureId, youtubeUrl, mp4Url, pdfUrl, clear } = req.body || {};
    if (!lectureId) {
      res.status(400).json({ error: 'lectureId is required' });
      return;
    }
    const lId = String(lectureId).trim();
    const composite = courseId ? `${courseId}::${lId}` : lId;
    if (!adminControlState.lectureOverrides) {
      adminControlState.lectureOverrides = {};
    }

    if (clear) {
      delete adminControlState.lectureOverrides[lId];
      delete adminControlState.lectureOverrides[composite];
      saveAdminControlNow();
      res.json({ success: true, override: null });
      return;
    }

    const override: LectureBackupOverride = {
      youtubeUrl: youtubeUrl ? String(youtubeUrl).trim() : undefined,
      mp4Url: mp4Url ? String(mp4Url).trim() : undefined,
      pdfUrl: pdfUrl ? String(pdfUrl).trim() : undefined,
      updatedAt: new Date().toISOString(),
    };
    adminControlState.lectureOverrides[lId] = override;
    adminControlState.lectureOverrides[composite] = override;
    saveAdminControlNow();
    res.json({ success: true, override });
  });

  // Direct Server-to-YouTube Auto-Upload Endpoint (Streams MP4 to YouTube Data API v3)
  app.post('/api/admin/youtube-auto-upload', async (req, res) => {
    const {
      courseId,
      lectureId,
      title,
      description,
      sourceMp4Url,
      youtubeAccessToken,
      privacyStatus,
    } = req.body || {};

    if (!lectureId || !youtubeAccessToken) {
      res.status(400).json({
        error: 'lectureId and youtubeAccessToken (Google OAuth Token) are required',
      });
      return;
    }

    try {
      let targetStreamUrl = sourceMp4Url ? String(sourceMp4Url).trim() : '';

      // If no direct MP4 URL was passed, resolve it from the lecture details
      if (!targetStreamUrl && courseId) {
        if (String(courseId).startsWith('sr_')) {
          const srCoursesMap = buildStudyRoomCoursesMap();
          const course = srCoursesMap.get(String(courseId));
          if (course) {
            for (const folder of course.folders) {
              for (let i = 0; i < folder.items.length; i++) {
                if (`${folder.folderKey}_item_${i}` === String(lectureId)) {
                  const formatted = formatStudyRoomLectureItem(
                    folder.items[i],
                    i,
                    course,
                    folder
                  );
                  targetStreamUrl = formatted.file_link || formatted.videoLink2 || '';
                }
              }
            }
          }
        } else {
          const detailKey = `${courseId}_${lectureId}`;
          let detail = lecturesVault.videoDetailsById[detailKey];
          if (!detail) {
            detail = await fetchUpstream(
              `/api/video-details?courseid=${encodeURIComponent(String(courseId))}&videoid=${encodeURIComponent(String(lectureId))}`
            );
          }
          if (detail) {
            const qualities = extractStreamQualities(detail);
            if (qualities.length > 0) {
              targetStreamUrl = qualities[0].url;
            }
          }
        }
      }

      if (!targetStreamUrl || !targetStreamUrl.startsWith('http')) {
        res.status(400).json({
          error:
            'Could not find a direct .mp4 stream URL for this lecture to upload to YouTube.',
        });
        return;
      }

      if (targetStreamUrl.includes('.m3u8')) {
        res.status(400).json({
          error:
            'This lecture uses an HLS (.m3u8) segmented stream. Please download it first using the in-app Download button (.mp4) or use a direct .mp4 lecture.',
        });
        return;
      }

      // 1. Fetch source video stream headers/body
      const videoRes = await fetch(targetStreamUrl);
      if (!videoRes.ok) {
        res.status(502).json({
          error: `Failed to fetch source lecture video (HTTP ${videoRes.status})`,
        });
        return;
      }

      const contentType = videoRes.headers.get('content-type') || 'video/mp4';
      const contentLength = videoRes.headers.get('content-length');

      // 2. Initiate YouTube Data API v3 Resumable Upload Session
      const initHeaders: Record<string, string> = {
        Authorization: `Bearer ${String(youtubeAccessToken).trim()}`,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Type': contentType,
      };
      if (contentLength) {
        initHeaders['X-Upload-Content-Length'] = contentLength;
      }

      const initRes = await fetch(
        'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',
        {
          method: 'POST',
          headers: initHeaders,
          body: JSON.stringify({
            snippet: {
              title: String(title || `mehulxstudy Lecture ${lectureId}`).slice(0, 95),
              description:
                description ||
                `Uploaded via mehulxstudy Auto-Backup.\nCourse ID: ${courseId || ''}\nLecture ID: ${lectureId}`,
              categoryId: '27', // Education
            },
            status: {
              privacyStatus:
                privacyStatus === 'private' || privacyStatus === 'public'
                  ? privacyStatus
                  : 'unlisted',
              selfDeclaredMadeForKids: false,
            },
          }),
        }
      );

      if (!initRes.ok) {
        const errText = await initRes.text();
        res.status(initRes.status).json({
          error: `YouTube API rejected upload initiation: ${errText.slice(0, 300)}`,
        });
        return;
      }

      const uploadUrl = initRes.headers.get('location');
      if (!uploadUrl) {
        res.status(500).json({
          error: 'YouTube API did not return a resumable upload location URL.',
        });
        return;
      }

      // 3. Stream video buffer to YouTube Resumable Upload URL
      const videoBuffer = Buffer.from(await videoRes.arrayBuffer());
      const uploadRes = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': contentType,
          'Content-Length': String(videoBuffer.byteLength),
        },
        body: videoBuffer,
      });

      if (!uploadRes.ok) {
        const errText = await uploadRes.text();
        res.status(uploadRes.status).json({
          error: `YouTube video transfer failed: ${errText.slice(0, 300)}`,
        });
        return;
      }

      const ytData: any = await uploadRes.json();
      const uploadedVideoId = ytData?.id;
      if (!uploadedVideoId) {
        res.status(500).json({ error: 'Upload finished but no YouTube Video ID returned.' });
        return;
      }

      const youtubeUrl = `https://youtu.be/${uploadedVideoId}`;
      const lId = String(lectureId).trim();
      const composite = courseId ? `${courseId}::${lId}` : lId;
      const override: LectureBackupOverride = {
        youtubeUrl,
        mp4Url: targetStreamUrl,
        updatedAt: new Date().toISOString(),
      };
      adminControlState.lectureOverrides[lId] = override;
      adminControlState.lectureOverrides[composite] = override;
      saveAdminControlNow();

      res.json({
        success: true,
        youtubeVideoId: uploadedVideoId,
        youtubeUrl,
        override,
      });
    } catch (err: any) {
      res.status(500).json({
        error: err?.message || 'Server-to-YouTube auto-upload failed',
      });
    }
  });

  app.post('/api/admin/add-item', async (req, res) => {
    const { courseName, folderName, name, type, videoLink, videoLink2, pdfLink } = req.body || {};
    if (!courseName || !folderName || !name) {
      res.status(400).json({ error: 'courseName, folderName, and name are required' });
      return;
    }
    const cleanCourse = String(courseName).trim();
    const cleanFolder = String(folderName).trim();

    let targetKey = Object.keys(studyRoomState.structuredLessons).find((k) => {
      const rec = studyRoomState.structuredLessons[k];
      return rec && rec.courseName === cleanCourse && rec.folderName === cleanFolder;
    });

    if (!targetKey) {
      targetKey = `custom_${Date.now()}`;
      studyRoomState.structuredLessons[targetKey] = {
        courseName: cleanCourse,
        folderName: cleanFolder,
        provider: 'kgs',
        createdAt: Date.now(),
        items: [],
      };
    }

    const folderRec = studyRoomState.structuredLessons[targetKey];
    const itemsArr = normalizeItemsArray(folderRec.items);
    const newItem = {
      name: String(name).trim(),
      type: type === 'note' ? 'note' : 'video',
      videoLink: videoLink ? String(videoLink).trim() : '',
      videoLink2: videoLink2 ? String(videoLink2).trim() : '',
      pdfLink: pdfLink ? String(pdfLink).trim() : '',
      uploadedAt: Date.now(),
      publishedAt: new Date().toISOString(),
    };
    itemsArr.unshift(newItem);
    folderRec.items = itemsArr;
    scheduleStudyRoomSave();

    // Best-effort sync to Firebase RTDB
    fetch(`${STUDY_ROOM_RTDB}/structured_lessons/${encodeURIComponent(targetKey)}.json`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(folderRec),
    }).catch(() => {});

    res.json({ success: true, folderKey: targetKey, item: newItem });
  });

  app.post('/api/admin/batch-action', async (req, res) => {
    const { action, courseName, batchId, newCourseName } = req.body || {};
    if (!action || (!courseName && !batchId)) {
      res.status(400).json({ error: 'Missing action or courseName' });
      return;
    }
    const target = String(courseName || batchId).trim();

    if (action === 'pin') {
      const set = new Set(studyRoomState.pinnedCourses);
      if (set.has(target)) set.delete(target);
      else set.add(target);
      studyRoomState.pinnedCourses = Array.from(set);
      scheduleStudyRoomSave();
      fetch(`${STUDY_ROOM_RTDB}/pinned_courses.json`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(studyRoomState.pinnedCourses),
      }).catch(() => {});
      res.json({ success: true, pinnedCourses: studyRoomState.pinnedCourses });
      return;
    }

    if (action === 'archive') {
      for (const [k, rec] of Object.entries(studyRoomState.structuredLessons)) {
        if (rec && rec.courseName === target) {
          studyRoomState.archivedLessons[k] = rec;
          delete studyRoomState.structuredLessons[k];
        }
      }
      scheduleStudyRoomSave();
      res.json({ success: true });
      return;
    }

    if (action === 'restore') {
      for (const [k, rec] of Object.entries(studyRoomState.archivedLessons)) {
        if (rec && rec.courseName === target) {
          studyRoomState.structuredLessons[k] = rec;
          delete studyRoomState.archivedLessons[k];
        }
      }
      scheduleStudyRoomSave();
      res.json({ success: true });
      return;
    }

    if (action === 'rename' && newCourseName) {
      const cleanNew = String(newCourseName).trim();
      for (const rec of Object.values(studyRoomState.structuredLessons)) {
        if (rec && rec.courseName === target) rec.courseName = cleanNew;
      }
      for (const rec of Object.values(studyRoomState.archivedLessons)) {
        if (rec && rec.courseName === target) rec.courseName = cleanNew;
      }
      scheduleStudyRoomSave();
      res.json({ success: true });
      return;
    }

    if (action === 'delete') {
      for (const [k, rec] of Object.entries(studyRoomState.structuredLessons)) {
        if (rec && rec.courseName === target) delete studyRoomState.structuredLessons[k];
      }
      for (const [k, rec] of Object.entries(studyRoomState.archivedLessons)) {
        if (rec && rec.courseName === target) delete studyRoomState.archivedLessons[k];
      }
      scheduleStudyRoomSave();
      res.json({ success: true });
      return;
    }

    res.status(400).json({ error: 'Unsupported action' });
  });

  app.post('/api/admin/branding', (req, res) => {
    const { appName, tagline, logoUrl } = req.body || {};
    adminControlState.appName = appName ? String(appName).trim() : adminControlState.appName;
    adminControlState.tagline =
      tagline !== undefined ? String(tagline).trim() : adminControlState.tagline;
    adminControlState.logoUrl =
      logoUrl !== undefined ? String(logoUrl).trim() : adminControlState.logoUrl;
    studyRoomState.appSettings = {
      appName: adminControlState.appName,
      tagline: adminControlState.tagline,
      logoUrl: adminControlState.logoUrl,
    };
    saveAdminControlNow();
    scheduleStudyRoomSave();
    res.json({ success: true, appSettings: studyRoomState.appSettings });
  });

  // Live sahukgs.com/batches Catalog Endpoint (1,143+ KGS Batches)
  app.get('/api/kgs/catalog', async (req, res) => {
    const force = req.query.force === '1';
    const [catalog] = await Promise.all([
      fetchKgsCatalog(force),
      syncStudyRoomFromFirebase(false),
    ]);
    res.json({
      data: catalog,
      trackedBatches: studyRoomState.trackedBatches,
      customBatchNames: studyRoomState.customBatchNames,
      lastSahukgsSyncAt: lastSahukgsSyncIso,
    });
  });

  app.post('/api/admin/sync-kgs', async (req, res) => {
    const { batchId, customCourseName } = req.body || {};
    try {
      const cleanBatchId = batchId ? String(batchId).trim() : '';
      const cleanCustomName = customCourseName ? String(customCourseName).trim() : '';

      if (cleanBatchId) {
        const nextTracked = Array.from(
          new Set([...(studyRoomState.trackedBatches || []), cleanBatchId])
        );
        studyRoomState.trackedBatches = nextTracked;

        await fetch(`${STUDY_ROOM_RTDB}/tracked_batches.json`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(nextTracked),
        }).catch(() => {});

        if (cleanCustomName) {
          studyRoomState.customBatchNames[cleanBatchId] = cleanCustomName;
          await fetch(
            `${STUDY_ROOM_RTDB}/custom_batch_names/${encodeURIComponent(cleanBatchId)}.json`,
            {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(cleanCustomName),
            }
          ).catch(() => {});
        }
        scheduleStudyRoomSave();
      }

      const syncResult = await triggerSahukgsLiveSync(true);

      res.json({
        success: true,
        updated: syncResult.updated,
        message: syncResult.message,
        trackedBatches: studyRoomState.trackedBatches,
        lastSahukgsSyncAt: lastSahukgsSyncIso,
        totalFolders: Object.keys(studyRoomState.structuredLessons).length,
      });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Sync failed' });
    }
  });

  app.post('/api/admin/untrack-kgs', async (req, res) => {
    const { batchId } = req.body || {};
    const cleanId = batchId ? String(batchId).trim() : '';
    if (!cleanId) {
      res.status(400).json({ error: 'Missing batchId' });
      return;
    }
    studyRoomState.trackedBatches = (studyRoomState.trackedBatches || []).filter(
      (id) => String(id) !== cleanId
    );
    scheduleStudyRoomSave();
    await fetch(`${STUDY_ROOM_RTDB}/tracked_batches.json`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(studyRoomState.trackedBatches),
    }).catch(() => {});

    res.json({
      success: true,
      trackedBatches: studyRoomState.trackedBatches,
    });
  });

  // 10. Vault Status & Full Batch Permanent Archiver
  app.get('/api/vault/status', (_req, res) => {
    const srCoursesMap = buildStudyRoomCoursesMap();
    let srSubjectCount = 0;
    let srLectureCount = 0;
    for (const c of srCoursesMap.values()) {
      srSubjectCount += c.subjectCount;
      srLectureCount += c.lectureCount;
    }

    const totalArchivedTopics =
      Object.keys(lecturesVault.videosByTopic).length + srSubjectCount;
    let totalArchivedLectures = srLectureCount;
    for (const list of Object.values(lecturesVault.videosByTopic)) {
      totalArchivedLectures += Array.isArray(list) ? list.length : 0;
    }
    res.json({
      savedAt: archiveStore.savedAt,
      updatedAt: studyRoomState.updatedAt || lecturesVault.updatedAt,
      totalBatches: srCoursesMap.size + archiveStore.batches.length,
      totalSubjects:
        srSubjectCount +
        Object.values(archiveStore.subjectsByBatch).reduce(
          (acc, arr) => acc + (Array.isArray(arr) ? arr.length : 0),
          0
        ),
      totalChapters:
        srSubjectCount +
        Object.values(archiveStore.topicsBySubject).reduce(
          (acc, arr) => acc + (Array.isArray(arr) ? arr.length : 0),
          0
        ),
      totalArchivedTopics,
      totalArchivedLectures,
      syncedBatches: lecturesVault.syncedBatches,
    });
  });

  app.post('/api/vault/sync-batch', async (req, res) => {
    const courseId = String(req.body?.courseId || '');
    if (!courseId) {
      res.status(400).json({ error: 'Missing courseId' });
      return;
    }

    if (courseId.startsWith('sr_')) {
      await syncStudyRoomFromFirebase(true);
      const srCoursesMap = buildStudyRoomCoursesMap();
      const course = srCoursesMap.get(courseId);
      const lectureCount = course ? course.lectureCount : 0;
      lecturesVault.syncedBatches[courseId] = {
        syncedAt: new Date().toISOString(),
        lectureCount,
      };
      scheduleVaultSave();
      res.json({
        success: true,
        courseId,
        lectureCount,
        syncedAt: lecturesVault.syncedBatches[courseId].syncedAt,
      });
      return;
    }

    try {
      let subjects = archiveStore.subjectsByBatch[courseId] || [];
      if (subjects.length === 0) {
        const liveSubs = await fetchUpstream(
          `/api/subjects?courseid=${encodeURIComponent(courseId)}`
        );
        if (Array.isArray(liveSubs)) {
          subjects = liveSubs;
          archiveStore.subjectsByBatch[courseId] = subjects;
        }
      }

      const pairs: Array<{ subjectId: string; topicId: string }> = [];
      for (const sub of subjects) {
        const tKey = `${courseId}_${sub.subjectid}`;
        let topics = archiveStore.topicsBySubject[tKey] || [];
        if (topics.length === 0) {
          const liveTops = await fetchUpstream(
            `/api/topics?courseid=${encodeURIComponent(courseId)}&subjectid=${encodeURIComponent(sub.subjectid)}`
          );
          if (Array.isArray(liveTops)) {
            topics = liveTops;
            archiveStore.topicsBySubject[tKey] = topics;
          }
        }
        for (const top of topics) {
          pairs.push({ subjectId: String(sub.subjectid), topicId: String(top.topicid) });
        }
      }

      let lectureCount = 0;
      const targetPairs = pairs.slice(0, 40);
      for (let i = 0; i < targetPairs.length; i += 10) {
        const slice = targetPairs.slice(i, i + 10);
        await Promise.all(
          slice.map(async ({ subjectId, topicId }) => {
            const vKey = `${courseId}_${subjectId}_${topicId}`;
            const vids = await fetchUpstream(
              `/api/videos?courseid=${encodeURIComponent(courseId)}&subjectid=${encodeURIComponent(subjectId)}&topicid=${encodeURIComponent(topicId)}`
            );
            if (Array.isArray(vids) && vids.length > 0) {
              lecturesVault.videosByTopic[vKey] = mergeByKey(
                lecturesVault.videosByTopic[vKey] || [],
                vids,
                'id'
              );
            }
            lectureCount += (lecturesVault.videosByTopic[vKey] || []).length;
          })
        );
      }

      lecturesVault.syncedBatches[courseId] = {
        syncedAt: new Date().toISOString(),
        lectureCount,
      };
      scheduleVaultSave();

      res.json({
        success: true,
        courseId,
        lectureCount,
        syncedAt: lecturesVault.syncedBatches[courseId].syncedAt,
      });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Failed to sync batch vault' });
    }
  });

  // 11. Direct PDF File Attachment Download for Phones & Desktop
  app.get('/api/download/pdf', async (req, res) => {
    const rawUrl = String(req.query.url || '');
    const title = String(req.query.title || 'Study_ROOM_Notes')
      .replace(/[^a-zA-Z0-9_\-\u0900-\u097F ]/g, '_')
      .trim()
      .slice(0, 60);

    if (!rawUrl || !rawUrl.startsWith('http')) {
      res.status(400).json({ error: 'Invalid PDF URL' });
      return;
    }

    const candidates = [
      rawUrl,
      `${WORKER_PROXY}${encodeURIComponent(rawUrl)}`,
    ];

    for (const target of candidates) {
      try {
        const upstream = await fetch(target);
        if (!upstream.ok) continue;
        const arrayBuf = await upstream.arrayBuffer();
        if (arrayBuf.byteLength === 0) continue;
        const safeAsciiName = title.replace(/[^\x20-\x7E]/g, '_') || 'Lecture_Notes';
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="${safeAsciiName}.pdf"; filename*=UTF-8''${encodeURIComponent(title)}.pdf`
        );
        res.setHeader('Content-Length', String(arrayBuf.byteLength));
        res.send(Buffer.from(arrayBuf));
        return;
      } catch {
        // try next candidate
      }
    }

    res.redirect(rawUrl);
  });

  // 12. CORS-Free Stream / Segment Proxy for Video Downloader
  app.get('/api/download/proxy', async (req, res) => {
    const rawUrl = String(req.query.url || '');
    if (!rawUrl || !rawUrl.startsWith('http')) {
      res.status(400).json({ error: 'Invalid target URL' });
      return;
    }
    const candidates = [
      rawUrl,
      `${WORKER_PROXY}${encodeURIComponent(rawUrl)}`,
    ];
    for (const target of candidates) {
      try {
        const upstream = await fetch(target);
        if (!upstream.ok) continue;
        const ct = upstream.headers.get('content-type') || 'application/octet-stream';
        const buf = Buffer.from(await upstream.arrayBuffer());
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Content-Type', ct);
        res.send(buf);
        return;
      } catch {
        // try next
      }
    }
    res.status(502).json({ error: 'Failed to proxy media segment' });
  });

  // 13. Built-in Bulk Telegram Auto-Uploader Engine (MTProto + Forum Topic Manager + FFmpeg HLS/MP4 Downloader)
  const TG_BOT_TOKEN =
    process.env.BOT_TOKEN || '9127297870:AAG0zn3vHfBbBXIL51Az7sOYR9AW4EuaiW4';
  const TG_API_ID = Number(process.env.API_ID || 34221469);
  const TG_API_HASH =
    process.env.API_HASH || '328b82637cec59c6386a2cbe2f6cb648';
  const TG_CHAT_ID = process.env.CHAT_ID || '-1004425704095';

  // Pre-populated Forum Topic Cache mapping subject_name -> message_thread_id
  const TOPIC_CACHE: Record<string, number> = {
    CDP: 3,
    ...(adminControlState.telegramTopicCache || {}),
  };

  let tgForumInfoCache: {
    chatTitle: string;
    isForum: boolean;
    canManageTopics: boolean;
    botUsername: string;
    lastCheckedAt: string | null;
    lastTopicError?: string | null;
  } = {
    chatTitle: 'sachin 1',
    isForum: true,
    canManageTopics: false,
    botUsername: 'sachinonlybot',
    lastCheckedAt: null,
    lastTopicError: null,
  };

  interface TelegramUploadJob {
    job_id: string;
    status: 'Downloading' | 'Uploading' | 'Completed' | 'Failed';
    progress: number;
    batch_name: string;
    subject_name: string;
    lecture_name: string;
    thread_id?: number;
    error: string | null;
  }

  const UPLOAD_PROGRESS: Record<string, TelegramUploadJob> = {};
  let sharedTgClient: TelegramClient | null = null;
  let tgClientConnecting: Promise<TelegramClient> | null = null;
  let mtprotoFloodUntilMs = 0;
  let uploadQueueChain: Promise<void> = Promise.resolve();

  async function getConnectedTelegramClient(): Promise<TelegramClient> {
    if (sharedTgClient && sharedTgClient.connected) {
      return sharedTgClient;
    }
    if (Date.now() < mtprotoFloodUntilMs) {
      const remSec = Math.ceil((mtprotoFloodUntilMs - Date.now()) / 1000);
      throw new Error(`MTProto bot auth cooldown active (${remSec}s remaining)`);
    }
    if (tgClientConnecting) {
      return tgClientConnecting;
    }
    tgClientConnecting = (async () => {
      const savedSessionStr = String(adminControlState.telegramMtprotoSession || '').trim();
      const client = new TelegramClient(
        new sessions.StringSession(savedSessionStr),
        TG_API_ID,
        TG_API_HASH,
        { connectionRetries: 2 }
      );
      try {
        client.setLogLevel('none' as any);
      } catch {
        // ignore logger level config
      }
      if (savedSessionStr) {
        await client.connect();
        const authorized = await client.isUserAuthorized().catch(() => false);
        if (!authorized) {
          await client.start({
            botAuthToken: TG_BOT_TOKEN,
          });
        }
      } else {
        await client.start({
          botAuthToken: TG_BOT_TOKEN,
        });
      }
      try {
        const rawSaved = (client.session as any).save();
        const exported = typeof rawSaved === 'string' ? rawSaved.trim() : '';
        if (exported && exported !== adminControlState.telegramMtprotoSession) {
          adminControlState.telegramMtprotoSession = exported;
          saveAdminControlNow();
        }
      } catch {
        // ignore session export error
      }
      sharedTgClient = client;
      tgClientConnecting = null;
      return client;
    })().catch((err: any) => {
      tgClientConnecting = null;
      sharedTgClient = null;
      const waitSec = Number(err?.seconds || 0);
      if (waitSec > 0 || err?.errorMessage === 'FLOOD' || String(err?.message || '').includes('wait of')) {
        const parsedSec =
          waitSec > 0
            ? waitSec
            : Number((String(err?.message || '').match(/wait of (\d+) seconds/i) || [])[1] || 1200);
        mtprotoFloodUntilMs = Date.now() + (parsedSec + 5) * 1000;
      }
      throw err;
    });
    return tgClientConnecting;
  }

  function matchExistingForumTopic(subjectName: string): number | undefined {
    const cleanSubject = (subjectName || 'General').trim() || 'General';
    if (TOPIC_CACHE[cleanSubject] !== undefined) {
      return TOPIC_CACHE[cleanSubject];
    }
    const lowerSub = cleanSubject.toLowerCase();
    for (const [k, tid] of Object.entries(TOPIC_CACHE)) {
      if (k.toLowerCase() === lowerSub) {
        TOPIC_CACHE[cleanSubject] = tid;
        return tid;
      }
    }
    // Also match prefix/keyword (e.g., "CDP (Paper - 1)" or "CDP Pedagogy" -> "CDP": 3)
    const strippedSub = lowerSub.replace(/\([^)]*\)/g, '').trim();
    for (const [k, tid] of Object.entries(TOPIC_CACHE)) {
      const lowerK = k.toLowerCase().trim();
      if (
        lowerK.length >= 2 &&
        (strippedSub === lowerK ||
          lowerSub.startsWith(`${lowerK} `) ||
          lowerSub.startsWith(`${lowerK}(`) ||
          lowerSub.includes(` ${lowerK} `))
      ) {
        TOPIC_CACHE[cleanSubject] = tid;
        return tid;
      }
    }
    return undefined;
  }

  async function syncForumTopicsFromTelegram(): Promise<Record<string, number>> {
    try {
      // 1. Check Chat & Bot Admin Permissions via Bot API
      const botId = TG_BOT_TOKEN.split(':')[0];
      const [chatRes, memberRes] = await Promise.all([
        fetch(
          `https://api.telegram.org/bot${TG_BOT_TOKEN}/getChat?chat_id=${encodeURIComponent(TG_CHAT_ID)}`
        ).catch(() => null),
        fetch(
          `https://api.telegram.org/bot${TG_BOT_TOKEN}/getChatMember?chat_id=${encodeURIComponent(TG_CHAT_ID)}&user_id=${encodeURIComponent(botId)}`
        ).catch(() => null),
      ]);
      if (chatRes && chatRes.ok) {
        const cj: any = await chatRes.json().catch(() => null);
        if (cj?.ok && cj?.result) {
          tgForumInfoCache.chatTitle = String(cj.result.title || 'sachin 1');
          tgForumInfoCache.isForum = Boolean(cj.result.is_forum);
        }
      }
      if (memberRes && memberRes.ok) {
        const mj: any = await memberRes.json().catch(() => null);
        if (mj?.ok && mj?.result) {
          tgForumInfoCache.canManageTopics = Boolean(mj.result.can_manage_topics);
          if (mj.result.user?.username) {
            tgForumInfoCache.botUsername = String(mj.result.user.username);
          }
          if (tgForumInfoCache.canManageTopics) {
            tgForumInfoCache.lastTopicError = null;
          }
        }
      }
      tgForumInfoCache.lastCheckedAt = new Date().toISOString();
    } catch {
      // ignore bot API check error
    }

    // 2. Only scan MTProto service messages if an MTProto client is already connected
    // so we never trigger unnecessary auth.ImportBotAuthorization calls on startup or topic sync
    if (sharedTgClient && sharedTgClient.connected && Date.now() >= mtprotoFloodUntilMs) {
      try {
        const probeIds = Array.from({ length: 120 }, (_, i) => i + 1);
        const msgs = await sharedTgClient.getMessages(TG_CHAT_ID, { ids: probeIds });
        let updated = false;
        for (const m of msgs || []) {
          if (!m) continue;
          const act: any = (m as any).action;
          if (
            act &&
            (act.className === 'MessageActionTopicCreate' ||
              act.className === 'MessageActionTopicEdit') &&
            act.title
          ) {
            const title = String(act.title).trim();
            const threadId = Number((m as any).replyTo?.replyToTopId || m.id);
            if (title && threadId > 0 && TOPIC_CACHE[title] !== threadId) {
              TOPIC_CACHE[title] = threadId;
              updated = true;
            }
          }
        }
        if (updated) {
          adminControlState.telegramTopicCache = { ...TOPIC_CACHE };
          scheduleAdminControlSave();
        }
      } catch {
        // silently ignore optional MTProto message scan
      }
    }

    return TOPIC_CACHE;
  }

  async function resolveOrCreateForumTopic(subjectName: string): Promise<number | undefined> {
    const cleanSubject = (subjectName || 'General').trim() || 'General';
    const cachedTid = matchExistingForumTopic(cleanSubject);
    if (cachedTid !== undefined) {
      return cachedTid;
    }

    // Create Forum Topic via official Telegram HTTP Bot API (fast, zero MTProto ImportBotAuthorization rate limits)
    try {
      const res = await fetch(
        `https://api.telegram.org/bot${TG_BOT_TOKEN}/createForumTopic`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({
            chat_id: TG_CHAT_ID,
            name: cleanSubject.slice(0, 128),
          }),
        }
      );
      const json: any = await res.json().catch(() => null);
      if (res.ok && json?.ok && json?.result?.message_thread_id) {
        const threadId = Number(json.result.message_thread_id);
        if (threadId > 0) {
          TOPIC_CACHE[cleanSubject] = threadId;
          adminControlState.telegramTopicCache = { ...TOPIC_CACHE };
          scheduleAdminControlSave();
          tgForumInfoCache.canManageTopics = true;
          tgForumInfoCache.lastTopicError = null;
          return threadId;
        }
      } else if (json?.description) {
        tgForumInfoCache.lastTopicError = String(json.description);
        if (String(json.description).toLowerCase().includes('not enough rights')) {
          tgForumInfoCache.canManageTopics = false;
        }
      }
    } catch {
      // ignore network error and fallback to General topic
    }

    return matchExistingForumTopic(cleanSubject);
  }

  async function fetchTextWithWorkerFallback(rawUrl: string): Promise<{
    text: string;
    usedWorker: boolean;
    effectiveBaseUrl: string;
  }> {
    const cleanRaw = rawUrl.startsWith(WORKER_PROXY)
      ? decodeURIComponent(rawUrl.slice(WORKER_PROXY.length))
      : rawUrl;
    const needsWorkerFirst =
      cleanRaw.includes('classx.co.in') ||
      cleanRaw.includes('akamai.net.in') ||
      cleanRaw.includes('sachinacademy') ||
      cleanRaw.includes('cloud-front.in');

    const candidates: Array<{ url: string; usedWorker: boolean }> = needsWorkerFirst
      ? [
          { url: `${WORKER_PROXY}${encodeURIComponent(cleanRaw)}`, usedWorker: true },
          { url: cleanRaw, usedWorker: false },
        ]
      : [
          { url: cleanRaw, usedWorker: false },
          { url: `${WORKER_PROXY}${encodeURIComponent(cleanRaw)}`, usedWorker: true },
        ];

    let lastErr = 'Unreachable stream manifest';
    for (const cand of candidates) {
      try {
        const res = await fetch(cand.url, {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          },
        });
        if (!res.ok) {
          lastErr = `HTTP ${res.status}`;
          continue;
        }
        const txt = await res.text();
        if (txt && txt.includes('#EXTM3U')) {
          return {
            text: txt,
            usedWorker: cand.usedWorker,
            effectiveBaseUrl: cleanRaw,
          };
        }
        lastErr = `Invalid M3U8 response (${txt.slice(0, 80)})`;
      } catch (err: any) {
        lastErr = err?.message || 'Fetch error';
      }
    }
    throw new Error(`Failed to fetch HLS manifest: ${lastErr}`);
  }

  function getFfmpegCandidates(): string[] {
    const list: string[] = [];
    if (process.env.FFMPEG_PATH && fs.existsSync(process.env.FFMPEG_PATH)) {
      list.push(process.env.FFMPEG_PATH);
    }
    if (fs.existsSync('/usr/bin/ffmpeg')) {
      list.push('/usr/bin/ffmpeg');
    }
    if (fs.existsSync('/usr/local/bin/ffmpeg')) {
      list.push('/usr/local/bin/ffmpeg');
    }
    list.push('ffmpeg');
    if (typeof ffmpegStatic === 'string' && ffmpegStatic.length > 0 && fs.existsSync(ffmpegStatic)) {
      list.push(ffmpegStatic);
    }
    return Array.from(new Set(list));
  }

  function runFfmpegSpawn(bin: string, args: string[]): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      try {
        const proc = spawn(bin, args);
        proc.on('error', () => resolve(false));
        proc.on('close', (code) => resolve(code === 0));
      } catch {
        resolve(false);
      }
    });
  }

  async function remuxTsToMp4Resilient(tempTsPath: string, destPath: string): Promise<void> {
    const candidates = getFfmpegCandidates();
    for (const bin of candidates) {
      // Attempt 1: Fast-start MP4 with AAC bitstream filter
      const okFastStart = await runFfmpegSpawn(bin, [
        '-y',
        '-i',
        tempTsPath,
        '-c',
        'copy',
        '-bsf:a',
        'aac_adtstoasc',
        '-movflags',
        '+faststart',
        destPath,
      ]);
      if (okFastStart && fs.existsSync(destPath) && fs.statSync(destPath).size > 0) {
        return;
      }

      // Attempt 2: Plain stream copy without AAC filter
      const okPlain = await runFfmpegSpawn(bin, [
        '-y',
        '-i',
        tempTsPath,
        '-c',
        'copy',
        destPath,
      ]);
      if (okPlain && fs.existsSync(destPath) && fs.statSync(destPath).size > 0) {
        return;
      }
    }

    // Ultimate fallback: if all FFmpeg binaries failed or were unavailable, preserve the valid MPEG-TS stream
    // so the downloaded lecture still uploads to Telegram without restarting or failing!
    fs.copyFileSync(tempTsPath, destPath);
  }

  function isValidMediaSegmentBuffer(buf: Buffer): boolean {
    if (!buf || buf.byteLength === 0) return false;
    if (buf.byteLength < 512) {
      const head = buf.toString('utf8', 0, 32).trim();
      if (/^(Error:|<!DOCTYPE|<html|\{)/i.test(head)) {
        return false;
      }
    }
    return true;
  }

  async function fetchBufferWithRetry(
    targetUrl: string,
    usedWorker: boolean,
    retries = 4
  ): Promise<Buffer> {
    let lastError: any = null;
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const res = await fetch(targetUrl, {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          },
        });
        if (res.ok) {
          const ab = await res.arrayBuffer();
          const buf = Buffer.from(ab);
          if (isValidMediaSegmentBuffer(buf)) {
            return buf;
          }
        }
        // If direct segment failed and we haven't tried worker proxy yet, try worker proxy
        if (!usedWorker && !targetUrl.startsWith(WORKER_PROXY)) {
          const wRes = await fetch(`${WORKER_PROXY}${encodeURIComponent(targetUrl)}`);
          if (wRes.ok) {
            const ab = await wRes.arrayBuffer();
            const buf = Buffer.from(ab);
            if (isValidMediaSegmentBuffer(buf)) {
              return buf;
            }
          }
        }
        lastError = new Error(`Segment HTTP ${res.status}`);
      } catch (err) {
        lastError = err;
      }
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 350 * attempt));
      }
    }
    throw lastError || new Error('Failed to download video segment');
  }

  interface PrefetchedHlsData {
    manifestText: string;
    usedWorker: boolean;
    effectiveBaseUrl: string;
  }

  async function selectBestReachableStream(candidateUrls: string[]): Promise<{
    chosenUrl: string;
    prefetchedHls?: PrefetchedHlsData;
  }> {
    let lastErr: any = null;
    for (const candidateUrl of candidateUrls) {
      if (!candidateUrl || !candidateUrl.startsWith('http')) continue;
      if (candidateUrl.includes('.m3u8')) {
        try {
          const fetched = await fetchTextWithWorkerFallback(candidateUrl);
          if (fetched.text && fetched.text.includes('#EXTM3U')) {
            return {
              chosenUrl: candidateUrl,
              prefetchedHls: {
                manifestText: fetched.text,
                usedWorker: fetched.usedWorker,
                effectiveBaseUrl: fetched.effectiveBaseUrl,
              },
            };
          }
        } catch (err) {
          lastErr = err;
        }
      } else {
        return { chosenUrl: candidateUrl };
      }
    }
    if (candidateUrls.length > 0) {
      return { chosenUrl: candidateUrls[0] };
    }
    throw lastErr || new Error('No reachable stream URL found');
  }

  async function downloadVideoToTmp(
    jobId: string,
    sourceUrl: string,
    destPath: string,
    prefetchedHls?: PrefetchedHlsData
  ): Promise<void> {
    const isHls = sourceUrl.includes('.m3u8');

    if (!isHls) {
      // Direct MP4 / stream download with worker fallback & real-time progress
      const candidates = [
        sourceUrl,
        `${WORKER_PROXY}${encodeURIComponent(sourceUrl)}`,
      ];
      let resp: Response | null = null;
      for (const c of candidates) {
        try {
          const r = await fetch(c, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
          });
          if (r.ok && r.body) {
            resp = r;
            break;
          }
        } catch {
          // try next candidate
        }
      }
      if (!resp || !resp.ok || !resp.body) {
        throw new Error('Failed to download direct MP4 video stream');
      }

      const totalBytes = Number(resp.headers.get('content-length') || 0);
      let downloadedBytes = 0;
      const fileStream = fs.createWriteStream(destPath);
      const reader = resp.body.getReader();

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) {
            downloadedBytes += value.byteLength;
            fileStream.write(Buffer.from(value));
            if (UPLOAD_PROGRESS[jobId]) {
              UPLOAD_PROGRESS[jobId].status = 'Downloading';
              if (totalBytes > 0) {
                UPLOAD_PROGRESS[jobId].progress = Math.max(
                  1,
                  Math.min(99, Math.round((downloadedBytes / totalBytes) * 100))
                );
              } else {
                const mb = downloadedBytes / (1024 * 1024);
                UPLOAD_PROGRESS[jobId].progress = Math.min(
                  95,
                  Math.round(Math.min(95, mb * 2))
                );
              }
            }
          }
        }
      } finally {
        await new Promise<void>((resolve) => fileStream.end(resolve));
      }
      if (UPLOAD_PROGRESS[jobId]) {
        UPLOAD_PROGRESS[jobId].progress = 100;
      }
      return;
    }

    // HLS (.m3u8) High-Speed Parallel Segment Downloader + FFmpeg MP4 Remuxer
    // Supports Sachin Academy (transcoded-videos.classx.co.in via Cloudflare Worker) & standard M3U8
    const tmpDir = path.dirname(destPath);
    const tempTsPath = path.join(tmpDir, `lecture_${jobId}_raw.ts`);

    try {
      let { manifestText, usedWorker, effectiveBaseUrl } = prefetchedHls
        ? prefetchedHls
        : await (async () => {
            const f = await fetchTextWithWorkerFallback(sourceUrl);
            return {
              manifestText: f.text,
              usedWorker: f.usedWorker,
              effectiveBaseUrl: f.effectiveBaseUrl,
            };
          })();

      const resolveRelativeUrl = (line: string, base: string, wrapWorker: boolean): string => {
        const trimmed = line.trim();
        if (trimmed.startsWith(WORKER_PROXY)) {
          return trimmed;
        }
        let abs = trimmed;
        if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
          try {
            abs = new URL(trimmed, base).toString();
          } catch {
            abs = trimmed;
          }
        }
        return wrapWorker ? `${WORKER_PROXY}${encodeURIComponent(abs)}` : abs;
      };

      const lines = manifestText
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l.length > 0);

      const highestVariantUrl = selectHighestHlsVariant(manifestText, effectiveBaseUrl);
      if (highestVariantUrl) {
        const subManifest = await fetchTextWithWorkerFallback(highestVariantUrl);
        manifestText = subManifest.text;
        usedWorker = subManifest.usedWorker;
        effectiveBaseUrl = subManifest.effectiveBaseUrl;
      } else if (lines.some((l) => l.startsWith('#EXT-X-STREAM-INF'))) {
        throw new Error('Master HLS playlist contains no playable variant streams.');
      }

      const mediaLines = manifestText
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l.length > 0);

      const segmentUrls: string[] = [];
      for (const line of mediaLines) {
        if (line.startsWith('#')) continue;
        segmentUrls.push(resolveRelativeUrl(line, effectiveBaseUrl, usedWorker));
      }

      if (segmentUrls.length === 0) {
        throw new Error('HLS playlist contains 0 video segments.');
      }

      const tsWriteStream = fs.createWriteStream(tempTsPath);
      const totalSegments = segmentUrls.length;
      const BATCH_CONCURRENCY = 16;
      let skippedSegments = 0;

      try {
        for (let i = 0; i < totalSegments; i += BATCH_CONCURRENCY) {
          const slice = segmentUrls.slice(i, i + BATCH_CONCURRENCY);
          const buffers = await Promise.all(
            slice.map(async (segUrl, sIdx) => {
              try {
                return await fetchBufferWithRetry(segUrl, usedWorker, 4);
              } catch (segErr) {
                // Only fail if the very first segment is unreachable or >10% of segments fail
                if (i === 0 && sIdx === 0) throw segErr;
                skippedSegments++;
                if (skippedSegments > Math.max(5, Math.ceil(totalSegments * 0.1))) {
                  throw segErr;
                }
                return Buffer.alloc(0);
              }
            })
          );
          for (const buf of buffers) {
            if (buf.byteLength === 0) continue;
            if (!tsWriteStream.write(buf)) {
              await new Promise<void>((resolve) => tsWriteStream.once('drain', resolve));
            }
          }
          const completedCount = Math.min(totalSegments, i + slice.length);
          if (UPLOAD_PROGRESS[jobId]) {
            UPLOAD_PROGRESS[jobId].status = 'Downloading';
            UPLOAD_PROGRESS[jobId].progress = Math.max(
              1,
              Math.min(96, Math.round((completedCount / totalSegments) * 96))
            );
          }
        }
      } finally {
        await new Promise<void>((resolve) => tsWriteStream.end(resolve));
      }

      if (!fs.existsSync(tempTsPath) || fs.statSync(tempTsPath).size === 0) {
        throw new Error('Downloaded TS stream is empty.');
      }

      if (UPLOAD_PROGRESS[jobId]) {
        UPLOAD_PROGRESS[jobId].progress = 98;
      }

      // Remux concatenated MPEG-TS into fast-start streamable MP4 container via system FFmpeg
      await remuxTsToMp4Resilient(tempTsPath, destPath);

      if (UPLOAD_PROGRESS[jobId]) {
        UPLOAD_PROGRESS[jobId].progress = 100;
      }
    } finally {
      // Always delete raw .ts immediately before Telegram upload begins so /tmp only holds 1 file
      try {
        if (fs.existsSync(tempTsPath)) {
          fs.unlinkSync(tempTsPath);
        }
      } catch {
        // ignore tempTsPath cleanup error
      }
    }
  }

  function resolveOrderedSachinStreamUrls(lec: any): string[] {
    if (!lec || typeof lec !== 'object') return [];
    return getOrderedStreamQualityUrls(lec);
  }

  function resolveBestSachinStreamUrl(lec: any): string {
    if (!lec || typeof lec !== 'object') return '';
    const highest = pickHighestQualityStream(lec);
    if (highest && highest.url) return highest.url;
    const ordered = resolveOrderedSachinStreamUrls(lec);
    return ordered[0] || '';
  }

  function pruneUploadProgressCache() {
    const keys = Object.keys(UPLOAD_PROGRESS);
    if (keys.length <= 120) return;
    let removed = 0;
    for (const k of keys) {
      const entry = UPLOAD_PROGRESS[k];
      if (entry && (entry.status === 'Completed' || entry.status === 'Failed')) {
        delete UPLOAD_PROGRESS[k];
        removed++;
        if (keys.length - removed <= 100) break;
      }
    }
  }

  async function sendSinglePartViaBotApi(
    partPath: string,
    partCaption: string,
    threadId: number | undefined,
    isPdfFile: boolean
  ): Promise<void> {
    const endpoint = isPdfFile ? 'sendDocument' : 'sendVideo';
    const fieldName = isPdfFile ? 'document' : 'video';
    const fileName = path.basename(partPath);
    const mimeType = isPdfFile ? 'application/pdf' : 'video/mp4';
    const fileBuffer = await fs.promises.readFile(partPath);
    const blob = new Blob([fileBuffer], { type: mimeType });

    const attemptSend = async (useThreadId?: number) => {
      const form = new FormData();
      form.append('chat_id', TG_CHAT_ID);
      if (useThreadId && useThreadId > 0) {
        form.append('message_thread_id', String(useThreadId));
      }
      form.append('caption', partCaption);
      form.append('parse_mode', 'Markdown');
      if (!isPdfFile) {
        form.append('supports_streaming', 'true');
      }
      form.append(fieldName, blob, fileName);

      const res = await fetch(`https://api.telegram.org/bot${TG_BOT_TOKEN}/${endpoint}`, {
        method: 'POST',
        body: form,
      });
      const json: any = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        const desc = String(json?.description || `HTTP ${res.status}`);
        throw new Error(desc);
      }
    };

    try {
      await attemptSend(threadId);
    } catch (err: any) {
      const msg = String(err?.message || '').toLowerCase();
      if (threadId && (msg.includes('thread') || msg.includes('topic'))) {
        await attemptSend(undefined);
      } else {
        throw err;
      }
    }
  }

  async function uploadFileViaHttpBotApi(
    jobId: string,
    filePath: string,
    caption: string,
    threadId: number | undefined,
    isPdfFile: boolean
  ): Promise<void> {
    const stat = fs.statSync(filePath);
    const MAX_SINGLE_BYTES = 48 * 1024 * 1024; // 48 MB safe threshold for HTTP Bot API (50 MB max)

    if (stat.size <= MAX_SINGLE_BYTES || isPdfFile) {
      if (UPLOAD_PROGRESS[jobId]) {
        UPLOAD_PROGRESS[jobId].status = 'Uploading';
        UPLOAD_PROGRESS[jobId].progress = 50;
      }
      await sendSinglePartViaBotApi(filePath, caption, threadId, isPdfFile);
      if (UPLOAD_PROGRESS[jobId]) {
        UPLOAD_PROGRESS[jobId].progress = 99;
      }
      return;
    }

    // Split MP4 > 48 MB into fast stream-copied segments via FFmpeg so HTTP Bot API uploads 100% reliably
    const tmpDir = path.dirname(filePath);
    const partPrefix = `part_${jobId}_`;
    const partPattern = path.join(tmpDir, `${partPrefix}%03d.mp4`);
    const numPartsEst = Math.max(2, Math.ceil(stat.size / (42 * 1024 * 1024)));

    // Probe duration or default to 900s (15 min) per part
    const segSeconds = Math.max(180, Math.floor(3600 / numPartsEst));
    for (const bin of getFfmpegCandidates()) {
      const okSeg = await runFfmpegSpawn(bin, [
        '-y',
        '-i',
        filePath,
        '-c',
        'copy',
        '-map',
        '0',
        '-f',
        'segment',
        '-segment_time',
        String(segSeconds),
        '-reset_timestamps',
        '1',
        partPattern,
      ]);
      if (okSeg) break;
    }

    const partFiles = fs
      .readdirSync(tmpDir)
      .filter((f) => f.startsWith(partPrefix) && f.endsWith('.mp4'))
      .sort()
      .map((f) => path.join(tmpDir, f));

    if (partFiles.length === 0) {
      throw new Error('Could not split large MP4 for Bot API fallback');
    }

    try {
      for (let i = 0; i < partFiles.length; i++) {
        const partPath = partFiles[i];
        const partCaption =
          partFiles.length > 1
            ? `${caption}\n📦 **Part:** ${i + 1}/${partFiles.length}`
            : caption;
        if (UPLOAD_PROGRESS[jobId]) {
          UPLOAD_PROGRESS[jobId].status = 'Uploading';
          UPLOAD_PROGRESS[jobId].progress = Math.max(
            5,
            Math.min(98, Math.round(((i + 0.5) / partFiles.length) * 100))
          );
        }
        await sendSinglePartViaBotApi(partPath, partCaption, threadId, false);
        try {
          fs.unlinkSync(partPath);
        } catch {
          // ignore
        }
      }
    } finally {
      for (const p of partFiles) {
        try {
          if (fs.existsSync(p)) fs.unlinkSync(p);
        } catch {
          // ignore
        }
      }
    }
  }

  async function processTelegramUploadJob(
    jobId: string,
    url: string,
    batchName: string,
    lectureName: string,
    subjectName = 'General'
  ): Promise<void> {
    const tmpDir = os.tmpdir() || '/tmp';
    let tempFilePath = path.join(tmpDir, `lecture_${jobId}.mp4`);
    const cleanSubject = (subjectName || 'General').trim() || 'General';

    try {
      pruneUploadProgressCache();
      if (UPLOAD_PROGRESS[jobId]) {
        UPLOAD_PROGRESS[jobId].status = 'Downloading';
        UPLOAD_PROGRESS[jobId].progress = 1;
        UPLOAD_PROGRESS[jobId].subject_name = cleanSubject;
      }

      let candidateUrls: string[] = [];
      if (url.startsWith('sachin_resolve://')) {
        const parts = url.replace('sachin_resolve://', '').split('/');
        const rawCid = parts[0] || '';
        const vId = parts[1] || '';
        const { upstreamCourseId } = resolveSachinUpstreamTarget(rawCid);
        const detailKey = `${upstreamCourseId}_${vId}`;

        // Always fetch fresh /api/video-details from upstream first so edge-cache-token is freshly signed!
        let detail: any = null;
        try {
          let freshDetail = await fetchUpstream(
            `/api/video-details?courseid=${encodeURIComponent(upstreamCourseId)}&videoid=${encodeURIComponent(vId)}`
          );
          if ((!freshDetail || typeof freshDetail !== 'object') && upstreamCourseId !== rawCid) {
            freshDetail = await fetchUpstream(
              `/api/video-details?courseid=${encodeURIComponent(rawCid)}&videoid=${encodeURIComponent(vId)}`
            );
          }
          if (freshDetail && typeof freshDetail === 'object') {
            detail = freshDetail;
            lecturesVault.videoDetailsById[detailKey] = freshDetail;
            lecturesVault.videoDetailsById[`${rawCid}_${vId}`] = freshDetail;
            scheduleVaultSave();
          }
        } catch {
          // fallback to cached detail if upstream is temporarily unreachable
        }

        if (!detail) {
          detail =
            lecturesVault.videoDetailsById[detailKey] ||
            lecturesVault.videoDetailsById[`${rawCid}_${vId}`];
        }

        candidateUrls = resolveOrderedSachinStreamUrls(detail);
        if (candidateUrls.length === 0) {
          // Fallback to lecture entry stored inside lecturesVault.videosByTopic / live lists
          const topicLists = Object.values(lecturesVault.videosByTopic);
          for (const list of topicLists) {
            if (!Array.isArray(list)) continue;
            const found = list.find((item: any) => String(item?.id) === String(vId));
            if (found) {
              const fallbackUrls = resolveOrderedSachinStreamUrls(found);
              if (fallbackUrls.length > 0) {
                candidateUrls = fallbackUrls;
                break;
              }
            }
          }
        }
        if (candidateUrls.length === 0) {
          throw new Error(
            `No downloadable video stream found for Sachin Academy Lecture #${vId}`
          );
        }
      } else {
        candidateUrls = [url];
      }

      // 1. Pre-flight check (<1s) to select the highest reachable stream quality (e.g. 1080p / 720p)
      // without ever re-downloading the full lecture in a loop!
      const { chosenUrl, prefetchedHls } = await selectBestReachableStream(candidateUrls);

      const isPdfFile =
        chosenUrl.toLowerCase().includes('.pdf') && !chosenUrl.includes('.m3u8');
      if (isPdfFile) {
        tempFilePath = path.join(tmpDir, `lecture_${jobId}.pdf`);
      }

      // 2. Download the selected highest-quality stream ONCE to /tmp
      await downloadVideoToTmp(jobId, chosenUrl, tempFilePath, prefetchedHls);

      if (!fs.existsSync(tempFilePath) || fs.statSync(tempFilePath).size === 0) {
        throw new Error('Downloaded lecture file is empty or missing.');
      }

      // 3. Resolve or automatically create the Forum Topic for `cleanSubject` in TG_CHAT_ID
      if (UPLOAD_PROGRESS[jobId]) {
        UPLOAD_PROGRESS[jobId].status = 'Uploading';
        UPLOAD_PROGRESS[jobId].progress = 1;
      }

      const threadId = await resolveOrCreateForumTopic(cleanSubject);
      if (UPLOAD_PROGRESS[jobId] && threadId) {
        UPLOAD_PROGRESS[jobId].thread_id = threadId;
      }

      const caption = `📁 **Batch:** ${batchName}\n📚 **Subject:** ${cleanSubject}\n🎬 **Lecture:** ${lectureName}`;
      const fileSize = fs.statSync(tempFilePath).size;
      let uploadedOk = false;
      let lastUploadErr: any = null;

      // Fast path: if file <= 48 MB or MTProto is in FloodWait cooldown, use direct HTTP Bot API first
      if (fileSize <= 48 * 1024 * 1024 || Date.now() < mtprotoFloodUntilMs) {
        try {
          await uploadFileViaHttpBotApi(jobId, tempFilePath, caption, threadId, isPdfFile);
          uploadedOk = true;
        } catch (botApiErr: any) {
          lastUploadErr = botApiErr;
        }
      }

      // MTProto path for large files (> 48 MB up to 2 GB) when MTProto is not in FloodWait cooldown
      if (!uploadedOk && Date.now() >= mtprotoFloodUntilMs) {
        for (let attempt = 1; attempt <= 2; attempt++) {
          try {
            const tgClient = await getConnectedTelegramClient();
            const sendParams: any = {
              file: tempFilePath,
              caption,
              supportsStreaming: !isPdfFile,
              workers: 8,
              progressCallback: (progress: number) => {
                const pct = Math.max(1, Math.min(99, Math.round(progress * 100)));
                if (UPLOAD_PROGRESS[jobId]) {
                  UPLOAD_PROGRESS[jobId].status = 'Uploading';
                  UPLOAD_PROGRESS[jobId].progress = pct;
                }
              },
            };
            if (threadId && attempt === 1) {
              sendParams.replyTo = threadId;
            }
            await tgClient.sendFile(TG_CHAT_ID, sendParams);
            uploadedOk = true;
            break;
          } catch (tgErr: any) {
            lastUploadErr = tgErr;
            if (Date.now() < mtprotoFloodUntilMs) {
              break;
            }
            const waitSec = Number(tgErr?.seconds || 0);
            if (waitSec > 0 && waitSec <= 60 && attempt < 2) {
              await new Promise((r) => setTimeout(r, (waitSec + 1) * 1000));
              continue;
            }
            sharedTgClient = null;
            tgClientConnecting = null;
          }
        }
      }

      // Final fallback: if MTProto failed on a >48 MB file, split & upload via HTTP Bot API
      if (!uploadedOk) {
        await uploadFileViaHttpBotApi(jobId, tempFilePath, caption, threadId, isPdfFile);
        uploadedOk = true;
      }

      if (!uploadedOk) {
        throw lastUploadErr || new Error('Telegram file upload failed');
      }

      if (UPLOAD_PROGRESS[jobId]) {
        UPLOAD_PROGRESS[jobId].status = 'Completed';
        UPLOAD_PROGRESS[jobId].progress = 100;
      }
    } catch (err: any) {
      console.error(`[TelegramAutoUploader] Job ${jobId} failed:`, err);
      if (UPLOAD_PROGRESS[jobId]) {
        UPLOAD_PROGRESS[jobId].status = 'Failed';
        UPLOAD_PROGRESS[jobId].error = err?.message || 'Telegram upload failed';
      }
    } finally {
      try {
        if (fs.existsSync(tempFilePath)) {
          fs.unlinkSync(tempFilePath);
        }
      } catch {
        // ignore cleanup error
      }
    }
  }

  // Full Batch & Subject Lectures Scanner for Bulk Telegram Auto-Uploader (Especially Sachin Academy)
  app.get('/api/telegram/batch-lectures', async (req, res) => {
    const courseId = String(req.query.courseid || '').trim();
    const forceRefresh = req.query.refresh === '1';
    if (!courseId) {
      res.status(400).json({ error: 'Missing courseid' });
      return;
    }

    const items: Array<{
      id: string;
      lectureName: string;
      subjectId: string;
      subjectName: string;
      topicName?: string;
      streamUrl: string;
    }> = [];
    const seenIds = new Set<string>();

    // Case 1: Study ROOM (KGS / PWThor) Batch
    if (courseId.startsWith('sr_')) {
      const srCoursesMap = buildStudyRoomCoursesMap();
      const course = srCoursesMap.get(courseId);
      if (!course) {
        res.json({ data: [], subjects: [] });
        return;
      }
      const subjectList: Array<{ id: string; name: string; count: number }> = [];
      for (const folder of course.folders) {
        let subCount = 0;
        for (let idx = 0; idx < folder.items.length; idx++) {
          const formatted = applyLectureOverride(
            formatStudyRoomLectureItem(folder.items[idx], idx, course, folder),
            courseId
          );
          if (formatted.type === 'note') continue;
          const streamUrl = resolveBestSachinStreamUrl(formatted);
          const lid = String(formatted.id || `${folder.folderKey}_${idx}`);
          if (streamUrl && !seenIds.has(lid)) {
            seenIds.add(lid);
            subCount++;
            items.push({
              id: lid,
              lectureName: `${folder.folderName} - ${formatted.Title || `Class ${idx + 1}`}`,
              subjectId: folder.folderKey,
              subjectName: folder.folderName,
              streamUrl,
            });
          }
        }
        subjectList.push({
          id: folder.folderKey,
          name: folder.folderName,
          count: subCount,
        });
      }
      res.json({ data: items, subjects: subjectList });
      return;
    }

    // Case 2: Sachin Academy Batch — Full Subject & Topic Scan across ALL subjects
    const { upstreamCourseId: batchUpstreamCourseId } = resolveSachinUpstreamTarget(courseId);
    let subjects = archiveStore.subjectsByBatch[courseId] || [];
    if (subjects.length === 0) {
      const liveSubs = await fetchUpstream(
        `/api/subjects?courseid=${encodeURIComponent(batchUpstreamCourseId)}`
      );
      if (Array.isArray(liveSubs) && liveSubs.length > 0) {
        subjects = liveSubs;
        archiveStore.subjectsByBatch[courseId] = subjects;
      }
    }

    const subjectNameMap = new Map<string, string>();
    for (const s of subjects) {
      subjectNameMap.set(String(s.subjectid), String(s.subject_name || `Subject ${s.subjectid}`));
    }

    interface TopicScanTask {
      displaySubjectId: string;
      displaySubjectName: string;
      upstreamCourseId: string;
      upstreamSubjectId: string;
      topicId: string;
      topicName: string;
      vKey: string;
      localKey: string;
    }

    const allTopicTasks: TopicScanTask[] = [];

    // 1. Gather all topics across ALL subjects of this Sachin Academy batch
    await Promise.all(
      subjects.map(async (sub: any) => {
        const displaySubId = String(sub.subjectid);
        const displaySubName = String(sub.subject_name || `Subject ${displaySubId}`);
        const { upstreamCourseId, upstreamSubjectId } = resolveSachinUpstreamTarget(
          courseId,
          displaySubId
        );

        let tops = getSachinTopicsForSubject(courseId, displaySubId);
        if (tops.length === 0) {
          const liveTops = await fetchUpstream(
            `/api/topics?courseid=${encodeURIComponent(upstreamCourseId)}&subjectid=${encodeURIComponent(upstreamSubjectId)}`
          );
          if (Array.isArray(liveTops) && liveTops.length > 0) {
            tops = liveTops;
            archiveStore.topicsBySubject[`${courseId}_${displaySubId}`] = tops;
            archiveStore.topicsBySubject[`${upstreamCourseId}_${upstreamSubjectId}`] = tops;
          }
        }

        for (const t of tops) {
          const topId = String(t.topicid);
          const topName = String(t.topic_name || '');
          allTopicTasks.push({
            displaySubjectId: displaySubId,
            displaySubjectName: displaySubName,
            upstreamCourseId,
            upstreamSubjectId,
            topicId: topId,
            topicName: topName,
            vKey: `${upstreamCourseId}_${upstreamSubjectId}_${topId}`,
            localKey: `${courseId}_${displaySubId}_${topId}`,
          });
        }
      })
    );

    // 2. Identify any topics not yet cached in lecturesVault and ALWAYS fetch missing topics automatically!
    const missingTasks = allTopicTasks.filter(
      (task) =>
        forceRefresh ||
        getSharedTopicVideos(courseId, task.displaySubjectId, task.topicId).length === 0
    );

    if (missingTasks.length > 0) {
      let taskIdx = 0;
      let vaultModified = false;
      const CONCURRENCY = Math.min(8, missingTasks.length);

      const workers = Array.from({ length: CONCURRENCY }, async () => {
        while (taskIdx < missingTasks.length) {
          const currentTask = missingTasks[taskIdx++];
          // Try exact courseId first, then upstreamCourseId fallback
          let vids = await fetchUpstream(
            `/api/videos?courseid=${encodeURIComponent(courseId)}&subjectid=${encodeURIComponent(currentTask.displaySubjectId)}&topicid=${encodeURIComponent(currentTask.topicId)}`
          );
          if (
            (!Array.isArray(vids) || vids.length === 0) &&
            currentTask.upstreamCourseId !== courseId
          ) {
            vids = await fetchUpstream(
              `/api/videos?courseid=${encodeURIComponent(currentTask.upstreamCourseId)}&subjectid=${encodeURIComponent(currentTask.upstreamSubjectId)}&topicid=${encodeURIComponent(currentTask.topicId)}`
            );
          }
          if (Array.isArray(vids) && vids.length > 0) {
            lecturesVault.videosByTopic[currentTask.vKey] = vids;
            lecturesVault.videosByTopic[currentTask.localKey] = vids;
            vaultModified = true;
          }
        }
      });

      await Promise.all(workers);
      if (vaultModified) {
        sharedSubTopCacheVersion = '';
        scheduleVaultSave();
      }
    }

    const addSachinLecture = (
      rawLec: any,
      displaySubId: string,
      displaySubName: string,
      topName: string,
      upstreamCourseId: string
    ) => {
      if (!rawLec || typeof rawLec !== 'object') return;
      const lid = String(rawLec.id || '').trim();
      const dedupKey = `${displaySubId}_${lid}`;
      if (!lid || seenIds.has(dedupKey)) return;

      const detailObj =
        lecturesVault.videoDetailsById[`${upstreamCourseId}_${lid}`] ||
        lecturesVault.videoDetailsById[`${courseId}_${lid}`];
      const mergedLec = applyLectureOverride(
        detailObj ? { ...rawLec, ...detailObj } : rawLec,
        courseId
      );

      let streamUrl = '';
      const isPdfItem = mergedLec.type === 'note' || mergedLec.material_type === 'PDF';

      if (isPdfItem) {
        const rawPdf =
          mergedLec.backupOverride?.pdfUrl ||
          mergedLec.pdf_link ||
          mergedLec.file_link ||
          mergedLec.download_link ||
          '';
        const decPdf = decryptSachinUrl(String(rawPdf).trim());
        if (decPdf.startsWith('http://') || decPdf.startsWith('https://')) {
          streamUrl = decPdf;
        } else {
          return;
        }
      } else {
        if (
          Array.isArray(mergedLec.download_links) &&
          mergedLec.download_links.length === 0 &&
          !mergedLec.file_link &&
          !mergedLec.hasBackupOverride
        ) {
          return;
        }
        streamUrl =
          mergedLec.hasBackupOverride && mergedLec.backupOverride?.mp4Url
            ? mergedLec.backupOverride.mp4Url
            : `sachin_resolve://${upstreamCourseId}/${lid}`;
      }

      seenIds.add(dedupKey);
      const uniqueItemId = seenIds.has(lid) ? `${displaySubId}_${lid}` : lid;
      seenIds.add(lid);
      const rawTitle = String(mergedLec.Title || `Lecture ${lid}`).trim();
      const fullLectureName = topName
        ? `${displaySubName} (${topName}) - ${rawTitle}`
        : `${displaySubName} - ${rawTitle}`;

      items.push({
        id: uniqueItemId,
        lectureName: fullLectureName,
        subjectId: displaySubId,
        subjectName: displaySubName,
        topicName: topName || undefined,
        streamUrl,
      });
    };

    // 3. Add lectures ordered by Subject & Topic across ALL subjects of the batch
    for (const task of allTopicTasks) {
      const list = getSharedTopicVideos(courseId, task.displaySubjectId, task.topicId);
      for (const lec of list) {
        addSachinLecture(
          lec,
          task.displaySubjectId,
          task.displaySubjectName,
          task.topicName,
          task.upstreamCourseId
        );
      }
    }

    // 4. Also include any Previous Live & Live classes for this Sachin Academy batch
    const defaultSubId = subjects[0] ? String(subjects[0].subjectid) : 'general';
    const defaultSubName = subjects[0]
      ? String(subjects[0].subject_name || 'Live Classes')
      : 'Live Classes';
    for (const lec of lecturesVault.prevLiveByCourse[courseId] || []) {
      const sId = String(lec.subject || defaultSubId);
      const sName = subjectNameMap.get(sId) || defaultSubName;
      addSachinLecture(lec, sId, sName, 'Previous Live', batchUpstreamCourseId);
    }
    for (const lec of lecturesVault.liveByCourse[courseId] || []) {
      const sId = String(lec.subject || defaultSubId);
      const sName = subjectNameMap.get(sId) || defaultSubName;
      addSachinLecture(lec, sId, sName, 'Live Class', batchUpstreamCourseId);
    }

    // 5. Build complete subject summary list initialized with ALL subjects of the batch!
    const countsBySub = new Map<string, { id: string; name: string; count: number }>();
    for (const s of subjects) {
      const sId = String(s.subjectid);
      const sName = String(s.subject_name || `Subject ${sId}`);
      countsBySub.set(sId, {
        id: sId,
        name: sName,
        count: 0,
      });
    }
    for (const item of items) {
      const existing = countsBySub.get(item.subjectId);
      if (existing) {
        existing.count++;
      } else {
        countsBySub.set(item.subjectId, {
          id: item.subjectId,
          name: item.subjectName,
          count: 1,
        });
      }
    }

    res.json({
      data: items,
      subjects: Array.from(countsBySub.values()),
    });
  });

  // 24x7 Autonomous Server-Side Bulk Queue State (Continues even when Browser/Laptop is closed!)
  interface BulkQueueLecture {
    id: string;
    lectureName: string;
    subjectId: string;
    subjectName: string;
    topicName?: string;
    streamUrl: string;
  }

  interface ServerBulkUploadState {
    isRunning: boolean;
    courseId: string;
    batchName: string;
    subjectFilter: string;
    startedAt: string | null;
    finishedAt: string | null;
    currentIndex: number;
    currentJobId: string | null;
    currentStatus: 'Idle' | 'Downloading' | 'Uploading' | 'Completed' | 'Failed' | 'Stopped';
    currentProgress: number;
    queue: BulkQueueLecture[];
    completedIds: string[];
    failedIds: Record<string, string>;
    stopRequested: boolean;
  }

  const COMPLETED_BY_COURSE: Record<string, Set<string>> = {};
  if (
    adminControlState.telegramCompletedByCourse &&
    typeof adminControlState.telegramCompletedByCourse === 'object'
  ) {
    for (const [cid, ids] of Object.entries(adminControlState.telegramCompletedByCourse)) {
      if (Array.isArray(ids)) {
        COMPLETED_BY_COURSE[cid] = new Set(ids.map(String));
      }
    }
  }

  const BULK_UPLOAD_STATE: ServerBulkUploadState = {
    isRunning: false,
    courseId: '',
    batchName: '',
    subjectFilter: 'all',
    startedAt: null,
    finishedAt: null,
    currentIndex: 0,
    currentJobId: null,
    currentStatus: 'Idle',
    currentProgress: 0,
    queue: [],
    completedIds: [],
    failedIds: {},
    stopRequested: false,
  };

  // Self-keepalive ping while a server bulk job is running so Render external URL gets traffic
  setInterval(() => {
    if (!BULK_UPLOAD_STATE.isRunning) return;
    const extUrl = process.env.RENDER_EXTERNAL_URL || process.env.APP_URL;
    const pingTarget = extUrl
      ? `${extUrl.replace(/\/+$/, '')}/ping`
      : `http://127.0.0.1:${Number(process.env.PORT) || 3000}/ping`;
    fetch(pingTarget).catch(() => {});
  }, 4 * 60 * 1000);

  async function runAutonomousServerBulkQueue(): Promise<void> {
    const courseId = BULK_UPLOAD_STATE.courseId;
    const batchName = BULK_UPLOAD_STATE.batchName;
    if (!COMPLETED_BY_COURSE[courseId]) {
      COMPLETED_BY_COURSE[courseId] = new Set(BULK_UPLOAD_STATE.completedIds);
    }
    const completedSet = COMPLETED_BY_COURSE[courseId];

    for (let i = 0; i < BULK_UPLOAD_STATE.queue.length; i++) {
      if (BULK_UPLOAD_STATE.stopRequested) {
        BULK_UPLOAD_STATE.isRunning = false;
        BULK_UPLOAD_STATE.currentStatus = 'Stopped';
        return;
      }

      const item = BULK_UPLOAD_STATE.queue[i];
      if (!item || completedSet.has(item.id)) {
        continue;
      }

      const jobId = crypto.randomBytes(6).toString('hex');
      const itemSubject = (item.subjectName || 'General').trim() || 'General';
      UPLOAD_PROGRESS[jobId] = {
        job_id: jobId,
        status: 'Downloading',
        progress: 1,
        batch_name: batchName,
        subject_name: itemSubject,
        lecture_name: item.lectureName,
        thread_id: TOPIC_CACHE[itemSubject],
        error: null,
      };

      BULK_UPLOAD_STATE.currentIndex = i;
      BULK_UPLOAD_STATE.currentJobId = jobId;
      BULK_UPLOAD_STATE.currentStatus = 'Downloading';
      BULK_UPLOAD_STATE.currentProgress = 1;

      await new Promise<void>((resolve) => {
        uploadQueueChain = uploadQueueChain
          .then(async () => {
            if (!BULK_UPLOAD_STATE.stopRequested) {
              await processTelegramUploadJob(
                jobId,
                item.streamUrl,
                batchName,
                item.lectureName,
                itemSubject
              );
            }
          })
          .catch(() => {})
          .finally(() => resolve());
      });

      if (BULK_UPLOAD_STATE.stopRequested) {
        BULK_UPLOAD_STATE.isRunning = false;
        BULK_UPLOAD_STATE.currentStatus = 'Stopped';
        return;
      }

      const finishedJob = UPLOAD_PROGRESS[jobId];
      if (finishedJob && finishedJob.status === 'Completed') {
        completedSet.add(item.id);
        BULK_UPLOAD_STATE.completedIds = Array.from(completedSet);
        if (!adminControlState.telegramCompletedByCourse) {
          adminControlState.telegramCompletedByCourse = {};
        }
        adminControlState.telegramCompletedByCourse[courseId] = Array.from(completedSet);
        scheduleAdminControlSave();
        delete BULK_UPLOAD_STATE.failedIds[item.id];
      } else {
        BULK_UPLOAD_STATE.failedIds[item.id] =
          finishedJob?.error || 'Upload failed';
      }
    }

    BULK_UPLOAD_STATE.isRunning = false;
    BULK_UPLOAD_STATE.currentStatus = 'Completed';
    BULK_UPLOAD_STATE.currentProgress = 100;
    BULK_UPLOAD_STATE.finishedAt = new Date().toISOString();
  }

  const handleStartBulkUpload = (req: express.Request, res: express.Response) => {
    const rawBody = req.body;
    const isArrayPayload = Array.isArray(rawBody);
    const items = isArrayPayload ? rawBody : rawBody?.items;
    if (!Array.isArray(items) || items.length === 0) {
      res.status(400).json({ detail: 'Non-empty items array is required for bulk upload.' });
      return;
    }

    if (BULK_UPLOAD_STATE.isRunning) {
      res.status(200).json({
        status: 'Bulk upload is already running on server',
        topic_cache: TOPIC_CACHE,
        bulkState: BULK_UPLOAD_STATE,
      });
      return;
    }

    const firstItem = items[0] || {};
    const cleanCourseId = String(
      (!isArrayPayload && rawBody?.courseId) || firstItem.courseId || 'batch'
    ).trim();
    const cleanBatchName = String(
      (!isArrayPayload && rawBody?.batchName) ||
        firstItem.batch_name ||
        firstItem.batchName ||
        cleanCourseId
    ).trim();
    const cleanSubjectFilter = String(
      (!isArrayPayload && rawBody?.subjectFilter) || 'all'
    ).trim();
    const existingCompleted = COMPLETED_BY_COURSE[cleanCourseId]
      ? Array.from(COMPLETED_BY_COURSE[cleanCourseId])
      : [];

    BULK_UPLOAD_STATE.isRunning = true;
    BULK_UPLOAD_STATE.stopRequested = false;
    BULK_UPLOAD_STATE.courseId = cleanCourseId;
    BULK_UPLOAD_STATE.batchName = cleanBatchName;
    BULK_UPLOAD_STATE.subjectFilter = cleanSubjectFilter;
    BULK_UPLOAD_STATE.startedAt = new Date().toISOString();
    BULK_UPLOAD_STATE.finishedAt = null;
    BULK_UPLOAD_STATE.currentIndex = 0;
    BULK_UPLOAD_STATE.currentJobId = null;
    BULK_UPLOAD_STATE.currentStatus = 'Downloading';
    BULK_UPLOAD_STATE.currentProgress = 1;
    BULK_UPLOAD_STATE.queue = items.map((x: any, idx: number) => ({
      id: String(x.id || `lec_${idx + 1}`),
      lectureName: String(x.lecture_name || x.lectureName || `Lecture ${idx + 1}`),
      subjectId: String(x.subjectId || x.subject_name || x.subjectName || 'General'),
      subjectName: String(x.subject_name || x.subjectName || 'General'),
      topicName: x.topicName ? String(x.topicName) : undefined,
      streamUrl: String(x.url || x.streamUrl || ''),
    }));
    BULK_UPLOAD_STATE.completedIds = existingCompleted;
    BULK_UPLOAD_STATE.failedIds = {};

    // Trigger autonomous background loop on server — runs even if user closes browser/laptop!
    runAutonomousServerBulkQueue().catch((err) => {
      console.error('[TelegramBulkQueue] Fatal error:', err);
      BULK_UPLOAD_STATE.isRunning = false;
    });

    res.status(200).json({
      status: 'Server background bulk upload started',
      total_queued: BULK_UPLOAD_STATE.queue.length,
      topic_cache: TOPIC_CACHE,
      bulkState: BULK_UPLOAD_STATE,
    });
  };

  const handleGetBulkStatus = (req: express.Request, res: express.Response) => {
    const activeJob = BULK_UPLOAD_STATE.currentJobId
      ? UPLOAD_PROGRESS[BULK_UPLOAD_STATE.currentJobId]
      : null;
    if (activeJob && BULK_UPLOAD_STATE.isRunning) {
      BULK_UPLOAD_STATE.currentStatus = activeJob.status;
      BULK_UPLOAD_STATE.currentProgress = activeJob.progress;
    }
    const queryCourseId = String(req.query.courseid || '').trim();
    const courseCompletedIds =
      queryCourseId && COMPLETED_BY_COURSE[queryCourseId]
        ? Array.from(COMPLETED_BY_COURSE[queryCourseId])
        : BULK_UPLOAD_STATE.completedIds;

    const currentItem = BULK_UPLOAD_STATE.queue[BULK_UPLOAD_STATE.currentIndex];
    const currentSubject =
      activeJob?.subject_name || currentItem?.subjectName || 'General';
    const currentThreadId =
      activeJob?.thread_id ?? matchExistingForumTopic(currentSubject) ?? null;

    res.status(200).json({
      ...BULK_UPLOAD_STATE,
      courseCompletedIds,
      currentSubject,
      currentThreadId,
      topicCache: TOPIC_CACHE,
      forumInfo: tgForumInfoCache,
      // Snake_case fields matching FastAPI /batch-status contract
      is_running: BULK_UPLOAD_STATE.isRunning,
      batch_name: BULK_UPLOAD_STATE.batchName,
      total: BULK_UPLOAD_STATE.queue.length,
      completed: BULK_UPLOAD_STATE.completedIds.length,
      failed: Object.keys(BULK_UPLOAD_STATE.failedIds).length,
      current_index: BULK_UPLOAD_STATE.currentIndex,
      current_lecture: currentItem?.lectureName || '',
      current_subject: currentSubject,
      current_thread_id: currentThreadId,
      status: BULK_UPLOAD_STATE.currentStatus,
      progress: BULK_UPLOAD_STATE.currentProgress,
      completed_ids: BULK_UPLOAD_STATE.completedIds,
      failed_ids: BULK_UPLOAD_STATE.failedIds,
      topic_cache: TOPIC_CACHE,
      forum_info: tgForumInfoCache,
    });
  };

  const handleStopBulkUpload = (_req: express.Request, res: express.Response) => {
    BULK_UPLOAD_STATE.stopRequested = true;
    BULK_UPLOAD_STATE.isRunning = false;
    BULK_UPLOAD_STATE.currentStatus = 'Stopped';
    res.status(200).json({
      status: 'Stopped server bulk upload queue',
      bulkState: BULK_UPLOAD_STATE,
    });
  };

  const handlePing = (_req: express.Request, res: express.Response) => {
    res.json({
      status: 'alive',
      active_jobs: Object.keys(UPLOAD_PROGRESS).length,
      bulk_running: BULK_UPLOAD_STATE.isRunning,
      topic_cache: TOPIC_CACHE,
      forum_info: tgForumInfoCache,
    });
  };

  const handleSyncTopics = async (req: express.Request, res: express.Response) => {
    const { createSubjectName, createSubjectNames } = req.body || {};
    let createdThreadId: number | undefined;
    const createdMap: Record<string, number> = {};

    // Refresh bot permissions first so we know if can_manage_topics is enabled
    const cache = await syncForumTopicsFromTelegram();

    if (createSubjectName && typeof createSubjectName === 'string' && createSubjectName.trim()) {
      const sName = createSubjectName.trim();
      const existing = matchExistingForumTopic(sName);
      if (existing) {
        createdThreadId = existing;
        createdMap[sName] = existing;
      } else if (tgForumInfoCache.canManageTopics) {
        createdThreadId = await resolveOrCreateForumTopic(sName);
        if (createdThreadId) {
          createdMap[sName] = createdThreadId;
        }
      } else {
        // Probe once in case permissions were just enabled in Telegram
        createdThreadId = await resolveOrCreateForumTopic(sName);
        if (createdThreadId) {
          createdMap[sName] = createdThreadId;
        }
      }
    }

    if (Array.isArray(createSubjectNames)) {
      let probedPermission = false;
      for (const rawSub of createSubjectNames) {
        const sName = String(rawSub || '').trim();
        if (!sName || sName === 'all') continue;
        const existing = matchExistingForumTopic(sName);
        if (existing) {
          createdMap[sName] = existing;
          continue;
        }
        if (!tgForumInfoCache.canManageTopics && probedPermission) {
          continue;
        }
        probedPermission = true;
        const tid = await resolveOrCreateForumTopic(sName);
        if (tid) {
          createdMap[sName] = tid;
        }
      }
    }

    res.status(200).json({
      status: 'synced',
      topic_cache: cache,
      forum_info: tgForumInfoCache,
      created_thread_id: createdThreadId ?? null,
      created_topics: createdMap,
    });
  };

  // Auto-sync Forum Topics in background on startup
  setTimeout(() => {
    syncForumTopicsFromTelegram().catch(() => {});
  }, 1500);

  const handleStartUpload = (req: express.Request, res: express.Response) => {
    const { url, batch_name, subject_name, lecture_name } = req.body || {};
    const cleanUrl = String(url || '').trim();
    const cleanBatch = String(batch_name || 'Batch').trim();
    const cleanSubject = String(subject_name || 'General').trim() || 'General';
    const cleanLecture = String(lecture_name || 'Lecture').trim();

    if (
      !cleanUrl ||
      (!cleanUrl.startsWith('http') && !cleanUrl.startsWith('sachin_resolve://'))
    ) {
      res.status(400).json({ detail: 'Valid video URL is required.' });
      return;
    }

    const jobId = crypto.randomBytes(6).toString('hex');
    const matchedTid = matchExistingForumTopic(cleanSubject);
    UPLOAD_PROGRESS[jobId] = {
      job_id: jobId,
      status: 'Downloading',
      progress: 0,
      batch_name: cleanBatch,
      subject_name: cleanSubject,
      lecture_name: cleanLecture,
      thread_id: matchedTid,
      error: null,
    };

    // Enqueue sequentially in background so HTTP request returns immediately
    uploadQueueChain = uploadQueueChain
      .then(() =>
        processTelegramUploadJob(jobId, cleanUrl, cleanBatch, cleanLecture, cleanSubject)
      )
      .catch(() => {});

    res.status(200).json({
      status: 'Upload started in background',
      job_id: jobId,
      subject_name: cleanSubject,
      thread_id: matchedTid,
    });
  };

  const handleGetUploadStatus = (req: express.Request, res: express.Response) => {
    const jobId = String(req.params.job_id || '').trim();
    const job = UPLOAD_PROGRESS[jobId];
    if (!job) {
      res.status(404).json({ detail: 'Job ID not found' });
      return;
    }
    res.status(200).json(job);
  };

  app.get('/ping', handlePing);
  app.get('/api/telegram/ping', handlePing);
  app.post('/api/telegram/sync-topics', handleSyncTopics);
  app.post('/sync-topics', handleSyncTopics);
  app.post('/upload', handleStartUpload);
  app.post('/api/telegram/upload', handleStartUpload);
  app.get('/status/:job_id', handleGetUploadStatus);
  app.get('/api/telegram/status/:job_id', handleGetUploadStatus);
  app.post('/upload-batch', handleStartBulkUpload);
  app.post('/api/telegram/upload-batch', handleStartBulkUpload);
  app.post('/bulk-upload', handleStartBulkUpload);
  app.post('/api/telegram/bulk-start', handleStartBulkUpload);
  app.get('/batch-status', handleGetBulkStatus);
  app.get('/api/telegram/batch-status', handleGetBulkStatus);
  app.get('/bulk-status', handleGetBulkStatus);
  app.get('/api/telegram/bulk-status', handleGetBulkStatus);
  app.post('/batch-stop', handleStopBulkUpload);
  app.post('/bulk-stop', handleStopBulkUpload);
  app.post('/api/telegram/bulk-stop', handleStopBulkUpload);

  const hasDist = fs.existsSync(path.join(__dirname, 'dist', 'index.html'));
  const isProd = process.env.NODE_ENV === 'production' || (process.env.npm_lifecycle_event === 'start' && hasDist);
  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const port = Number(process.env.PORT) || 3000;
  app.listen(port, '0.0.0.0', () => {
    console.log(`Study ROOM Upgraded Permanent Portal running on http://0.0.0.0:${port}`);
  });
}

startServer();
