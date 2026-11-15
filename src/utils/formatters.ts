/**
 * Formatting, Filtering, and Sorting Pure Logic Utilities for Study ROOM + Permanent Vault Portal
 */

export type BatchProvider = 'kgs' | 'pwthor' | 'sachin';

export interface BatchItem {
  id: string;
  course_name: string;
  course_thumbnail?: string;
  provider?: BatchProvider;
  isArchived?: boolean;
  isHidden?: boolean;
  isStudyRoom?: boolean;
  subjectCount?: number;
  lectureCount?: number;
  orderIndex?: number;
}

export interface SubjectItem {
  subjectid: string;
  subject_name: string;
  subject_logo?: string;
  sortingparam?: string | number;
  is_paid?: string | number;
  topicCount?: number;
  lectureCount?: number;
  noteCount?: number;
  directLectures?: boolean;
  provider?: BatchProvider;
  isHidden?: boolean;
}

export interface TopicItem {
  topicid: string;
  topic_name: string;
  topic_logo?: string;
  sortingparam?: string | number;
  lectureCount?: number;
  noteCount?: number;
}

export interface LectureItem {
  id: string;
  Title: string;
  thumbnail?: string;
  duration?: string | number;
  date_and_time?: string;
  publishedAt?: string;
  uploadedAt?: number;
  pdf_link?: string;
  pdf_link2?: string;
  file_link?: string;
  download_link?: string;
  videoLink?: string;
  videoLink2?: string;
  youtubeId?: string | null;
  type?: 'video' | 'note';
  isHidden?: boolean;
  download_links?: Array<{
    bitrate?: string;
    quality?: string;
    path?: string;
    backup_url?: string;
    backup_url2?: string;
  }>;
  livestream_links?: Array<{
    quality?: string;
    path?: string;
  }>;
  course_id?: string;
  courseName?: string;
  subject?: string;
  folderName?: string;
  topic?: string;
  topic_name?: string;
  material_type?: string;
}

export const ADMIN_PANEL_PASSWORD = '341214';

export function verifyAdminPassword(input?: string | null): boolean {
  if (!input || typeof input !== 'string') return false;
  return input.trim() === ADMIN_PANEL_PASSWORD;
}

export function verifyWebsiteLockCode(
  inputCode?: string | null,
  configuredLockCode?: string | null,
  lockEnabled = false
): boolean {
  if (!lockEnabled) return true;
  const expected = (configuredLockCode || '').trim();
  if (!expected) return true;
  const actual = (inputCode || '').trim();
  // Allow either the configured site lock code OR the master admin password
  return actual === expected || actual === ADMIN_PANEL_PASSWORD;
}

export function isBatchHidden(
  batchId: string,
  courseName: string,
  hiddenBatchIds: Set<string>
): boolean {
  return (
    hiddenBatchIds.has(String(batchId)) ||
    (Boolean(courseName) && hiddenBatchIds.has(String(courseName).trim()))
  );
}

export function isLectureHidden(
  lectureId: string,
  courseId?: string,
  hiddenLectureIds: Set<string> = new Set(),
  hiddenBatchIds: Set<string> = new Set()
): boolean {
  if (courseId && hiddenBatchIds.has(String(courseId))) return true;
  const lid = String(lectureId);
  if (hiddenLectureIds.has(lid)) return true;
  if (courseId && hiddenLectureIds.has(`${courseId}::${lid}`)) return true;
  return false;
}

export function filterVisibleLectures(
  lectures: LectureItem[],
  courseId: string,
  hiddenLectureIds: Set<string>,
  hiddenBatchIds: Set<string> = new Set()
): LectureItem[] {
  if (!Array.isArray(lectures)) return [];
  return lectures.filter(
    (lec) =>
      !lec.isHidden &&
      !isLectureHidden(lec.id, courseId || lec.course_id, hiddenLectureIds, hiddenBatchIds)
  );
}

export type BatchCategoryFilter =
  | 'all'
  | 'studyroom'
  | 'pinned'
  | 'kgs'
  | 'pw'
  | 'sachin'
  | 'bpsc'
  | 'upsc'
  | 'ctet'
  | 'archived'
  | 'saved';

export function formatDurationHuman(raw?: string | number | null): string {
  if (raw == null || raw === '') return '00:00';
  const seconds = typeof raw === 'number' ? raw : parseInt(String(raw), 10);
  if (isNaN(seconds) || seconds <= 0) {
    return typeof raw === 'string' && raw.includes(':') ? raw : '00:00';
  }
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m ${s}s`;
}

export function formatPlayerTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

export function filterAndSortBatches(
  batches: BatchItem[],
  searchQuery: string,
  category: BatchCategoryFilter,
  savedBatchIds: Set<string> = new Set(),
  pinnedBatchIds: Set<string> = new Set()
): BatchItem[] {
  const q = searchQuery.toLowerCase().trim();
  return batches
    .filter((b) => {
      if (b.isHidden) return false;
      const name = (b.course_name || '').toLowerCase();
      const matchesSearch = q === '' || name.includes(q) || String(b.id).toLowerCase().includes(q);
      if (!matchesSearch) return false;

      // By default, archived batches only show in 'archived' or when searching, unless explicitly selected
      if (category === 'archived') return Boolean(b.isArchived);
      if (b.isArchived && category !== 'saved' && category !== 'pinned' && q === '') {
        return false;
      }

      if (category === 'studyroom') return Boolean(b.isStudyRoom) && !b.isArchived;
      if (category === 'pinned') return pinnedBatchIds.has(String(b.id)) || pinnedBatchIds.has(b.course_name);
      if (category === 'kgs') return b.provider === 'kgs' && !b.isArchived;
      if (category === 'pw') return b.provider === 'pwthor';
      if (category === 'sachin') return b.provider === 'sachin' || (!b.isStudyRoom && b.provider !== 'kgs' && b.provider !== 'pwthor');
      if (category === 'ctet') return name.includes('ctet') || name.includes('tet') || name.includes('tgt');
      if (category === 'bpsc') return name.includes('bpsc') || name.includes('bihar') || name.includes('tre') || name.includes('aedo');
      if (category === 'upsc') return name.includes('upsc') || name.includes('foundation') || name.includes('optional');
      if (category === 'saved') return savedBatchIds.has(String(b.id));
      return true;
    })
    .sort((a, b) => {
      // 1. Pinned batches always come first at the very top
      const aPinned = pinnedBatchIds.has(String(a.id)) || pinnedBatchIds.has(a.course_name);
      const bPinned = pinnedBatchIds.has(String(b.id)) || pinnedBatchIds.has(b.course_name);
      if (aPinned && !bPinned) return -1;
      if (!aPinned && bPinned) return 1;

      // 2. Study ROOM live batches come next (in their configured course_order)
      const aSR = Boolean(a.isStudyRoom) && !a.isArchived;
      const bSR = Boolean(b.isStudyRoom) && !b.isArchived;
      if (aSR && !bSR) return -1;
      if (!aSR && bSR) return 1;
      if (aSR && bSR && a.orderIndex !== undefined && b.orderIndex !== undefined) {
        if (a.orderIndex !== b.orderIndex) return a.orderIndex - b.orderIndex;
      }

      // 3. 2026 batches come next
      const a2026 = (a.course_name || '').includes('2026');
      const b2026 = (b.course_name || '').includes('2026');
      if (a2026 && !b2026) return -1;
      if (!a2026 && b2026) return 1;

      // 4. Alphabetical order
      return (a.course_name || '').localeCompare(b.course_name || '');
    });
}

export function formatLectureTitle(
  rawTitle?: string | null,
  topicName?: string | null,
  index = 0
): string {
  const trimmed = (rawTitle || '').trim();
  if (!trimmed) {
    return topicName ? `${topicName} — Class ${index + 1}` : `Lecture ${index + 1}`;
  }
  if (/^\d+$/.test(trimmed)) {
    return topicName ? `${topicName} — Class ${trimmed}` : `Lecture Class ${trimmed}`;
  }
  return trimmed;
}
