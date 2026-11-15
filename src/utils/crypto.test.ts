import test from 'node:test';
import assert from 'node:assert/strict';
import {
  decryptSachinUrl,
  resolvePdfUrl,
  buildPdfViewerUrl,
  buildProxiedStreamUrl,
  extractStreamQualities,
  extractYouTubeId,
  buildYouTubeThumbnailUrl,
  parseM3u8Segments,
  buildPdfDownloadUrl,
  buildMasterM3u8Content,
  getResolutionMetadata,
  pickHighestQualityStream,
  getOrderedStreamQualityUrls,
  selectHighestHlsVariant,
  getSubjectTopicEmoji,
  buildSubjectHashtag,
  buildTelegramTopicTitle,
  buildTelegramLectureCaption,
} from './crypto';
import {
  formatDurationHuman,
  formatPlayerTime,
  filterAndSortBatches,
  formatLectureTitle,
  verifyAdminPassword,
  verifyWebsiteLockCode,
  isBatchHidden,
  isLectureHidden,
  filterVisibleLectures,
  type BatchItem,
  type LectureItem,
} from './formatters';

test('parseM3u8Segments extracts segment URLs from HLS playlist accurately', () => {
  const sampleM3u8 = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:12
#EXTINF:12.500000,
https://desimaxx.adityalkkumar4321.workers.dev/?url=https%3A%2F%2Fexample.com%2Fseg0.ts
#EXTINF:12.500000,
seg1.ts`;
  const parsed = parseM3u8Segments(sampleM3u8, 'https://example.com/hls/master.m3u8');
  assert.equal(parsed.isMasterPlaylist, false);
  assert.equal(parsed.urls.length, 2);
  assert.equal(
    parsed.urls[0],
    'https://desimaxx.adityalkkumar4321.workers.dev/?url=https%3A%2F%2Fexample.com%2Fseg0.ts'
  );
  assert.equal(parsed.urls[1], 'https://example.com/hls/seg1.ts');
  assert.ok(buildPdfDownloadUrl('https://example.com/a.pdf', 'CDP Notes').includes('/api/download/pdf?'));
});

test('extractYouTubeId extracts 11-char video ID from embed, youtu.be, and watch URLs', () => {
  assert.equal(
    extractYouTubeId('https://www.youtube.com/embed/TZ5gUNcOTsw'),
    'TZ5gUNcOTsw'
  );
  assert.equal(
    extractYouTubeId('https://youtu.be/40Ow7aNAQ0w?si=abc123'),
    '40Ow7aNAQ0w'
  );
  assert.equal(
    extractYouTubeId('https://www.youtube.com/watch?v=9xPqR123_ab&t=10s'),
    '9xPqR123_ab'
  );
  assert.equal(
    extractYouTubeId('https://kgs-v2.akamaized.net/320p/apr-2026/536528/kgss.mp4'),
    null
  );
  assert.equal(
    buildYouTubeThumbnailUrl('TZ5gUNcOTsw'),
    'https://i.ytimg.com/vi/TZ5gUNcOTsw/mqdefault.jpg'
  );
});

test('resolvePdfUrl unwraps Study ROOM sahukgs.vercel.app/view-pdf?url= links as well as AES links', () => {
  const studyRoomPdf =
    'https://sahukgs.vercel.app/view-pdf?url=https%3A%2F%2Fkgs-v2.akamaized.net%2Fkgs%2Fkgs%2Fpdfs%2F399a522d-5c8d-4e69-b946-2aaa65f62ed2.pdf&title=Polity';
  assert.equal(
    resolvePdfUrl(studyRoomPdf),
    'https://kgs-v2.akamaized.net/kgs/kgs/pdfs/399a522d-5c8d-4e69-b946-2aaa65f62ed2.pdf'
  );
});

test('extractStreamQualities extracts direct Akamai MP4 from Study ROOM lecture with YouTube primary link', () => {
  const qualities = extractStreamQualities({
    videoLink: 'https://youtu.be/40Ow7aNAQ0w',
    videoLink2:
      'https://kgs-v2.akamaized.net/320p/apr-2026/536528/kgss-1776339351-v536528_360p878kbs.mp4',
  });
  assert.equal(qualities.length, 1);
  assert.equal(qualities[0].label, '360p');
  assert.equal(qualities[0].isM3u8, false);
  assert.equal(
    qualities[0].url,
    'https://kgs-v2.akamaized.net/320p/apr-2026/536528/kgss-1776339351-v536528_360p878kbs.mp4'
  );
});

test('formatLectureTitle enriches purely numeric lecture titles with chapter name', () => {
  assert.equal(
    formatLectureTitle('1', 'Current Affairs Before August 2023', 0),
    'Current Affairs Before August 2023 — Class 1'
  );
  assert.equal(
    formatLectureTitle('Current Affairs Class by Atul Sir', 'JANUARY 2026', 0),
    'Current Affairs Class by Atul Sir'
  );
});

test('decryptSachinUrl decrypts AES-128-CBC encrypted HLS stream link accurately', () => {
  const encrypted =
    'm7hcRsBTJp5eNY5aTdn8qpPBOzdeUeGZQY2wVY0qocyzI/GQp7GTpQTXEQI3QwV4GxaQCGduQgAz4A+N7TPK1F57+tXepZZtkDJHeJIqLhnzyaarLC3x1MNkU/oUd7AK6eISEryB9JtYy4jVx5ykYVDy4bLHqtYOp/XCR81SileKP4mI03MDPQWm0ctrVbHx:ZmVkY2JhOTg3NjU0MzIxMA==';
  const decrypted = decryptSachinUrl(encrypted);
  assert.equal(
    decrypted,
    'https://transcoded-videos-v2.classx.co.in/videos/sachinacademy-data/3531759-1775740952/hls-d2724c/1080p/master-6585162.173340642.m3u8'
  );
});

test('resolvePdfUrl decrypts AES-128-CBC encrypted PDF handout link accurately', () => {
  const encryptedPdf =
    'UXWcDRZQ65VRP7EzB2igD64KxEEreAdUBntgMIn3CFUKPrZiYQ4U1PDfPInr5EjREoQoS01nLeM7SjgoVzYywD04Y3c+LQVBPzOdzHZ8KC9q6KSsO2lglo1izu9kVGWxsVJrp/AIJvHQLmfhhvE9VrrSnydOK50H4AVghBvN6mO1NaQrCnmqA/In1+5HQGg+qOEZeoAgbbuuiQgAj8v8UJBgT0kEtF+bbKgCaNoAvggGmuEnCXzEYNd/GdfeCq3LrK0Ra9vpxx3jpsnEBwwC2WhfkOKJu7DPYZNyLCPK25TD1vxH+PZ0oPD6qJSPJkzv2lIreoc0q/T0Nii2HjdzGvCqefjCf7poTAgLZkOpHW6Pi9gsMWYusIIVMLbYrDhpFPyQZ94p8uZXSzvVI0HWPn9Okj1pwTI9b8ka9n0cXXQUOoegvgaJHmCQjQ7xnoiK:ZmVkY2JhOTg3NjU0MzIxMA==';
  const resolved = resolvePdfUrl(encryptedPdf);
  assert.ok(resolved.startsWith('https://static-db-v2.appx.co.in/subject/2026-04-09-0.8983540647198192.pdf'));
  const viewerUrl = buildPdfViewerUrl(resolved);
  assert.ok(viewerUrl.startsWith('https://pdfweb.classx.co.in/pdfjs/web/viewer-new.html?file='));
});

test('extractStreamQualities orders resolutions from highest to lowest and builds proxy URLs', () => {
  const qualities = extractStreamQualities({
    download_links: [
      {
        quality: '360p',
        path: 'm7hcRsBTJp5eNY5aTdn8qpPBOzdeUeGZQY2wVY0qocyzI/GQp7GTpQTXEQI3QwV4GxaQCGduQgAz4A+N7TPK1F57+tXepZZtkDJHeJIqLhnzyaarLC3x1MNkU/oUd7AK9rpAw03QU3ihBr21ORhLHb7964bozSu2HC/APGRelkicrdY2mRIkJMqvBfD05pns:ZmVkY2JhOTg3NjU0MzIxMA==',
      },
      {
        quality: '1080p',
        path: 'm7hcRsBTJp5eNY5aTdn8qpPBOzdeUeGZQY2wVY0qocyzI/GQp7GTpQTXEQI3QwV4GxaQCGduQgAz4A+N7TPK1F57+tXepZZtkDJHeJIqLhnzyaarLC3x1MNkU/oUd7AK6eISEryB9JtYy4jVx5ykYVDy4bLHqtYOp/XCR81SileKP4mI03MDPQWm0ctrVbHx:ZmVkY2JhOTg3NjU0MzIxMA==',
      },
    ],
  });
  assert.equal(qualities.length, 2);
  assert.equal(qualities[0].label, '1080p');
  assert.equal(qualities[1].label, '360p');
  assert.equal(qualities[0].isM3u8, true);
  assert.ok(qualities[0].proxiedUrl.startsWith('https://desimaxx.adityalkkumar4321.workers.dev/?url='));

  const masterM3u8 = buildMasterM3u8Content(qualities);
  assert.ok(masterM3u8.startsWith('#EXTM3U'));
  const idx360 = masterM3u8.indexOf('RESOLUTION=640x360');
  const idx1080 = masterM3u8.indexOf('RESOLUTION=1920x1080');
  assert.ok(idx360 > 0 && idx1080 > idx360);
  assert.equal(getResolutionMetadata('240p').height, 240);
});

test('formatDurationHuman and formatPlayerTime format seconds accurately', () => {
  assert.equal(formatDurationHuman('3614'), '1h 0m');
  assert.equal(formatDurationHuman(125), '2m 5s');
  assert.equal(formatDurationHuman(''), '00:00');
  assert.equal(formatPlayerTime(3665), '1:01:05');
  assert.equal(formatPlayerTime(125), '02:05');
});

test('filterAndSortBatches prioritizes Study ROOM and 2026 batches and filters by category and search', () => {
  const sample: BatchItem[] = [
    { id: '56', course_name: 'BIHAR TRE 3.0 COMPLETE BATCH', provider: 'sachin' },
    { id: '364', course_name: 'CTET PAPER 1 & 2 COURSE (2026)', provider: 'sachin' },
    { id: '152', course_name: 'KVS PRT COMPLETE BATCH', provider: 'sachin' },
    { id: 'sr_330', course_name: 'Classroom off-Line 71st BPSC Batch (Musallahpur)', provider: 'kgs', isStudyRoom: true, orderIndex: 0 },
  ];
  const all = filterAndSortBatches(sample, '', 'all');
  assert.equal(all[0].id, 'sr_330');
  const kgs = filterAndSortBatches(sample, '', 'kgs');
  assert.equal(kgs.length, 1);
  assert.equal(kgs[0].id, 'sr_330');
  const bpsc = filterAndSortBatches(sample, '', 'bpsc');
  assert.equal(bpsc.length, 2);
  const saved = filterAndSortBatches(sample, '', 'saved', new Set(['152']));
  assert.equal(saved.length, 1);
  assert.equal(saved[0].id, '152');

  // Pinned batches should always rank above even Study ROOM or 2026 batches
  const pinned = filterAndSortBatches(sample, '', 'all', new Set(), new Set(['56']));
  assert.equal(pinned[0].id, '56');

  // Pinned category filter test
  const pinnedCategory = filterAndSortBatches(sample, '', 'pinned', new Set(), new Set(['56']));
  assert.equal(pinnedCategory.length, 1);
  assert.equal(pinnedCategory[0].id, '56');

  // Hidden batch filter test
  const withHidden = sample.map((b) => (b.id === '56' ? { ...b, isHidden: true } : b));
  const filteredHidden = filterAndSortBatches(withHidden, '', 'all');
  assert.equal(filteredHidden.some((b) => b.id === '56'), false);
});

test('verifyAdminPassword, verifyWebsiteLockCode, and lecture visibility filters work accurately', () => {
  assert.equal(verifyAdminPassword('341214'), true);
  assert.equal(verifyAdminPassword(' 341214 '), true);
  assert.equal(verifyAdminPassword('wrong'), false);

  assert.equal(verifyWebsiteLockCode('any', '9999', false), true);
  assert.equal(verifyWebsiteLockCode('9999', '9999', true), true);
  assert.equal(verifyWebsiteLockCode('341214', '9999', true), true);
  assert.equal(verifyWebsiteLockCode('1111', '9999', true), false);

  const hiddenBatches = new Set(['56', 'Economics Foundation by Khan Sir']);
  assert.equal(isBatchHidden('56', 'Some Course', hiddenBatches), true);
  assert.equal(isBatchHidden('sr_99', 'Economics Foundation by Khan Sir', hiddenBatches), true);
  assert.equal(isBatchHidden('364', 'CTET Course', hiddenBatches), false);

  const hiddenLectures = new Set(['lec_1', '364::lec_2']);
  assert.equal(isLectureHidden('lec_1', '364', hiddenLectures, hiddenBatches), true);
  assert.equal(isLectureHidden('lec_2', '364', hiddenLectures, hiddenBatches), true);
  assert.equal(isLectureHidden('lec_3', '56', hiddenLectures, hiddenBatches), true);
  assert.equal(isLectureHidden('lec_3', '364', hiddenLectures, hiddenBatches), false);

  const lectures: LectureItem[] = [
    { id: 'lec_1', Title: 'Hidden Lecture 1' },
    { id: 'lec_2', Title: 'Hidden Lecture 2' },
    { id: 'lec_3', Title: 'Visible Lecture 3' },
  ];
  const visible = filterVisibleLectures(lectures, '364', hiddenLectures, hiddenBatches);
  assert.equal(visible.length, 1);
  assert.equal(visible[0].id, 'lec_3');
});

test('pickHighestQualityStream and getOrderedStreamQualityUrls prioritize 1080p/720p over 240p/360p', () => {
  const best = pickHighestQualityStream({
    download_links: [
      { quality: '240p', path: 'https://cdn.example.com/240p/master.m3u8' },
      { quality: '480p', path: 'https://cdn.example.com/480p/master.m3u8' },
      { quality: '1080p', path: 'https://cdn.example.com/1080p/master.m3u8' },
      { quality: '720p', path: 'https://cdn.example.com/720p/master.m3u8' },
      { quality: '360p', path: 'https://cdn.example.com/360p/master.m3u8' },
    ],
  });
  assert.ok(best);
  assert.equal(best.label, '1080p');
  assert.equal(best.url, 'https://cdn.example.com/1080p/master.m3u8');

  const ordered = getOrderedStreamQualityUrls({
    videoLink2: 'https://kgs-v2.akamaized.net/360p/v1_360p.mp4',
    download_links: [
      { quality: '360p', path: 'https://cdn.example.com/360p/index.m3u8' },
      { quality: '720p', path: 'https://cdn.example.com/720p/v1.mp4' },
    ],
    file_link: 'https://cdn.example.com/fallback.m3u8',
  });
  assert.equal(ordered[0], 'https://cdn.example.com/720p/v1.mp4');
  assert.equal(ordered[1], 'https://cdn.example.com/360p/index.m3u8');
  assert.equal(ordered[2], 'https://cdn.example.com/fallback.m3u8');
});

test('selectHighestHlsVariant selects highest resolution and bandwidth from master playlist', () => {
  const masterPlaylist = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-STREAM-INF:BANDWIDTH=280000,RESOLUTION=426x240,NAME="240p"
240p/index.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=420000,RESOLUTION=640x360,NAME="360p"
360p/index.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=2400000,RESOLUTION=1920x1080,NAME="1080p"
1080p/index.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=1250000,RESOLUTION=1280x720,NAME="720p"
720p/index.m3u8`;

  const selected = selectHighestHlsVariant(masterPlaylist, 'https://cdn.example.com/hls/master.m3u8');
  assert.equal(selected, 'https://cdn.example.com/hls/1080p/index.m3u8');

  // Bandwidth tie-breaker when RESOLUTION tag is absent
  const bwOnlyMaster = `#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=450000
low/playlist.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=3100000
high/playlist.m3u8`;
  assert.equal(
    selectHighestHlsVariant(bwOnlyMaster, 'https://cdn.example.com/vod/master.m3u8'),
    'https://cdn.example.com/vod/high/playlist.m3u8'
  );

  // Media playlist (not master) returns null
  const mediaPlaylist = `#EXTM3U
#EXTINF:10.0,
seg0.ts`;
  assert.equal(selectHighestHlsVariant(mediaPlaylist, 'https://cdn.example.com/seg/index.m3u8'), null);
});

test('Telegram Subject Topic helpers format emojis, topic titles, hashtags, and captions accurately', () => {
  assert.equal(getSubjectTopicEmoji("Math's (Paper -1)"), '📐');
  assert.equal(getSubjectTopicEmoji('Hindi (Paper-1)'), '📕');
  assert.equal(getSubjectTopicEmoji('CDP (Child Development)'), '🧠');
  assert.equal(getSubjectTopicEmoji('EVS (Paper-1)'), '🌿');
  assert.equal(getSubjectTopicEmoji('English Grammar'), '📘');
  assert.equal(getSubjectTopicEmoji('Sanskrit'), '🕉️');

  assert.equal(buildSubjectHashtag("Math's (Paper -1)"), '#Maths_Paper_1');
  assert.equal(buildSubjectHashtag('Hindi / हिंदी'), '#Hindi_हिंदी');
  assert.equal(buildSubjectHashtag('CDP (Paper-1)'), '#CDP_Paper_1');

  assert.equal(
    buildTelegramTopicTitle("Math's (Paper -1)", '[SACHIN] CTET PAPER - 1 COURSE*', false),
    "📐 Math's (Paper -1)"
  );
  assert.equal(
    buildTelegramTopicTitle('CDP (Paper-1)', '[SACHIN] CTET PAPER - 1 COURSE*', true),
    '🧠 CDP (Paper-1) • CTET PAPER - 1 COURSE'
  );

  const caption = buildTelegramLectureCaption({
    batchName: '[SACHIN] CTET PAPER - 1 COURSE*',
    subjectName: "Math's (Paper -1)",
    topicName: 'Class Pdf',
    lectureName: "Math's (Paper -1) (Class Pdf) - Measurement System Class - 01",
    lectureIndex: 1,
  });
  assert.ok(caption.includes("📂 **Topic / Subject:** 📐 Math's (Paper -1)"));
  assert.ok(caption.includes('📖 **Chapter:** Class Pdf'));
  assert.ok(caption.includes('🎬 **Lecture #1:** Measurement System Class - 01'));
  assert.ok(caption.includes('#Maths_Paper_1'));
});


