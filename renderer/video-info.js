'use strict';

/**
 * Sonde de conteneur vidéo — les métadonnées que la balise <video> ne révèle
 * pas : codecs vidéo/audio, fréquence d'images, nombre d'images, piste audio
 * (canaux, échantillonnage). Alimente le popup d'informations et la barre
 * d'outils (voir showInfo / updateFileMeta dans renderer.js).
 *
 * Deux familles de conteneurs, lues sans dépendance :
 *  - ISO BMFF (MP4, M4V, MOV) : parcours des atomes jusqu'à « moov », lu
 *    intégralement (il peut se trouver en fin de fichier — d'où l'IPC
 *    read-file-range, qui ne rapatrie que la plage utile) ;
 *  - Matroska / WebM : lecture EBML des éléments Info et Tracks, situés en
 *    tête de fichier (avant le premier Cluster).
 *
 * Toute anomalie (format inconnu, en-tête tronqué, atome compressé…) rend
 * null : l'appelant retombe sur les seules données de la balise <video>.
 *
 * Script classique (même portée globale que renderer.js), exposé en
 * window.VideoInfo.probe(filePath) → Promise<VideoProbe | null>.
 *
 * @typedef {Object} VideoProbe
 * @property {string} container         « MP4 », « QuickTime », « Matroska », « WebM »
 * @property {number|null} duration     secondes, d'après le conteneur
 * @property {VideoTrack|null} video    première piste vidéo
 * @property {AudioTrack|null} audio    première piste audio
 * @property {number} audioCount        nombre de pistes audio
 *
 * @typedef {Object} VideoTrack
 * @property {string} codec             libellé lisible (« H.264 / AVC »…)
 * @property {string|null} profile      profil du codec quand il est connu
 * @property {number|null} width
 * @property {number|null} height
 * @property {number|null} fps          images par seconde
 * @property {number|null} frames       nombre total d'images
 *
 * @typedef {Object} AudioTrack
 * @property {string} codec
 * @property {number|null} channels
 * @property {number|null} sampleRate   Hz
 */

window.VideoInfo = (() => {
  const MOOV_MAX = 32 * 1024 * 1024; // au-delà : atome aberrant, on renonce
  const MKV_HEAD = 4 * 1024 * 1024; // Info + Tracks tiennent largement dedans
  const TOP_BOXES_MAX = 64; // garde-fou du parcours des atomes de premier niveau

  const ascii = (u8, o, n) => String.fromCharCode(...u8.subarray(o, o + n));

  async function readRange(filePath, offset, bytes) {
    const r = await window.viewer.readFileRange(filePath, offset, bytes);
    if (!r || !r.data) return null;
    return { data: new Uint8Array(r.data.buffer, r.data.byteOffset, r.data.byteLength), size: r.size };
  }

  /* ======================= ISO BMFF (MP4 / MOV) ======================= */

  const MP4_VIDEO_CODECS = {
    avc1: 'H.264 / AVC',
    avc3: 'H.264 / AVC',
    hvc1: 'H.265 / HEVC',
    hev1: 'H.265 / HEVC',
    av01: 'AV1',
    vp08: 'VP8',
    vp09: 'VP9',
    mp4v: 'MPEG-4 Part 2',
    jpeg: 'Motion JPEG',
    mjpa: 'Motion JPEG',
    mjpb: 'Motion JPEG',
    apch: 'Apple ProRes 422 HQ',
    apcn: 'Apple ProRes 422',
    apcs: 'Apple ProRes 422 LT',
    apco: 'Apple ProRes 422 Proxy',
    ap4h: 'Apple ProRes 4444',
    ap4x: 'Apple ProRes 4444 XQ',
    dvhe: 'Dolby Vision (HEVC)',
    dvh1: 'Dolby Vision (HEVC)',
  };

  const MP4_AUDIO_CODECS = {
    mp4a: 'AAC',
    'ac-3': 'AC-3',
    'ec-3': 'E-AC-3',
    Opus: 'Opus',
    alac: 'ALAC',
    fLaC: 'FLAC',
    twos: 'PCM',
    sowt: 'PCM',
    lpcm: 'PCM',
    in24: 'PCM 24 bits',
    in32: 'PCM 32 bits',
    fl32: 'PCM flottant',
    ulaw: 'µ-law',
    alaw: 'A-law',
    '.mp3': 'MP3',
    samr: 'AMR',
  };

  const AVC_PROFILES = {
    66: 'Baseline',
    77: 'Main',
    88: 'Extended',
    100: 'High',
    110: 'High 10',
    122: 'High 4:2:2',
    244: 'High 4:4:4',
  };

  const HEVC_PROFILES = { 1: 'Main', 2: 'Main 10', 3: 'Main Still Picture', 4: 'RExt' };

  /** Itère les atomes contenus dans u8[start, end) : { type, start, end, body }. */
  function* boxes(u8, start, end) {
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    let o = start;
    while (o + 8 <= end) {
      let size = dv.getUint32(o);
      const type = ascii(u8, o + 4, 4);
      let body = o + 8;
      if (size === 1) {
        if (o + 16 > end) return;
        // largesize 64 bits : les fichiers > 4 Go tiennent dans un double
        size = dv.getUint32(o + 8) * 2 ** 32 + dv.getUint32(o + 12);
        body = o + 16;
      } else if (size === 0) {
        size = end - o; // « jusqu'à la fin »
      }
      if (size < 8 || o + size > end) return; // atome tronqué ou aberrant
      yield { type, start: o, end: o + size, body };
      o += size;
    }
  }

  function findBox(u8, start, end, type) {
    for (const b of boxes(u8, start, end)) if (b.type === type) return b;
    return null;
  }

  /** Descend une chaîne d'atomes (« mdia/minf/stbl »). */
  function findPath(u8, box, path) {
    let cur = box;
    for (const type of path) {
      cur = findBox(u8, cur.body, cur.end, type);
      if (!cur) return null;
    }
    return cur;
  }

  /** timescale + durée d'un mvhd ou mdhd (version 0 ou 1). */
  function readHeaderTiming(u8, box) {
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    const version = u8[box.body];
    if (version === 1) {
      if (box.body + 32 > box.end) return null;
      return {
        timescale: dv.getUint32(box.body + 20),
        duration: dv.getUint32(box.body + 24) * 2 ** 32 + dv.getUint32(box.body + 28),
      };
    }
    if (box.body + 20 > box.end) return null;
    return { timescale: dv.getUint32(box.body + 12), duration: dv.getUint32(box.body + 16) };
  }

  /** Table stts : nombre d'images et durée cumulée (en ticks du mdhd). */
  function readSampleTiming(u8, stts) {
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    const count = dv.getUint32(stts.body + 4);
    let samples = 0;
    let ticks = 0;
    let o = stts.body + 8;
    for (let i = 0; i < count && o + 8 <= stts.end; i++, o += 8) {
      const n = dv.getUint32(o);
      samples += n;
      ticks += n * dv.getUint32(o + 4);
    }
    return { samples, ticks };
  }

  function readVideoProfile(u8, format, entry) {
    if (format === 'avc1' || format === 'avc3') {
      const c = findBox(u8, entry.body + 78, entry.end, 'avcC');
      return c && c.body + 2 <= c.end ? AVC_PROFILES[u8[c.body + 1]] || null : null;
    }
    if (format === 'hvc1' || format === 'hev1') {
      const c = findBox(u8, entry.body + 78, entry.end, 'hvcC');
      return c && c.body + 2 <= c.end ? HEVC_PROFILES[u8[c.body + 1] & 0x1f] || null : null;
    }
    return null;
  }

  /* Entrée audio : le tronc commun (canaux, échantillonnage) est le même
     partout, mais QuickTime connaît trois versions de SoundDescription, aux
     champs additionnels et aux atomes enfants placés différemment. */
  function readAudioEntry(u8, entry) {
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    if (entry.body + 28 > entry.end) return { channels: null, sampleRate: null, children: entry.end };
    const version = dv.getUint16(entry.body + 8);
    if (version === 2 && entry.body + 64 <= entry.end) {
      return {
        channels: dv.getUint32(entry.body + 40) || null,
        sampleRate: Math.round(dv.getFloat64(entry.body + 32)) || null,
        children: entry.body + 64,
      };
    }
    return {
      channels: dv.getUint16(entry.body + 16) || null,
      sampleRate: dv.getUint16(entry.body + 24) || null, // 16.16 → partie entière
      children: entry.body + (version === 1 ? 44 : 28),
    };
  }

  /** mp4a recouvre AAC comme MP3 : l'esds tranche (objectTypeIndication). */
  function readMp4aCodec(u8, entry, children) {
    const esds = findBox(u8, children, entry.end, 'esds');
    if (!esds) return 'AAC';
    // descripteurs : ES_Descriptor (0x03) … DecoderConfigDescriptor (0x04)
    for (let o = esds.body + 4; o + 2 <= esds.end; o++) {
      if (u8[o] !== 0x04) continue;
      let p = o + 1;
      while (p < esds.end && u8[p] & 0x80) p++; // longueur codée sur 1..4 octets
      const oti = u8[p + 1];
      return oti === 0x69 || oti === 0x6b ? 'MP3' : 'AAC';
    }
    return 'AAC';
  }

  function readTrack(u8, trak) {
    const mdia = findBox(u8, trak.body, trak.end, 'mdia');
    if (!mdia) return null;
    const hdlr = findBox(u8, mdia.body, mdia.end, 'hdlr');
    const mdhd = findBox(u8, mdia.body, mdia.end, 'mdhd');
    const stbl = findPath(u8, mdia, ['minf', 'stbl']);
    if (!hdlr || !mdhd || !stbl) return null;
    const kind = ascii(u8, hdlr.body + 8, 4);
    const stsd = findBox(u8, stbl.body, stbl.end, 'stsd');
    if (!stsd) return null;
    const entry = boxes(u8, stsd.body + 8, stsd.end).next().value; // première description d'échantillon
    if (!entry) return null;
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    const format = entry.type;

    if (kind === 'vide') {
      const timing = readHeaderTiming(u8, mdhd);
      const stts = findBox(u8, stbl.body, stbl.end, 'stts');
      let fps = null;
      let frames = null;
      if (timing && timing.timescale && stts) {
        const st = readSampleTiming(u8, stts);
        frames = st.samples || null;
        if (st.samples && st.ticks) fps = (st.samples * timing.timescale) / st.ticks;
      }
      return {
        kind,
        codec: MP4_VIDEO_CODECS[format] || format.trim().toUpperCase(),
        profile: readVideoProfile(u8, format, entry),
        width: entry.body + 26 <= entry.end ? dv.getUint16(entry.body + 24) : null,
        height: entry.body + 28 <= entry.end ? dv.getUint16(entry.body + 26) : null,
        fps,
        frames,
      };
    }
    if (kind === 'soun') {
      const a = readAudioEntry(u8, entry);
      return {
        kind,
        codec: format === 'mp4a' ? readMp4aCodec(u8, entry, a.children) : MP4_AUDIO_CODECS[format] || format.trim().toUpperCase(),
        channels: a.channels,
        sampleRate: a.sampleRate,
      };
    }
    return null;
  }

  function parseMoov(u8, moov, container) {
    const mvhd = findBox(u8, moov.body, moov.end, 'mvhd');
    const timing = mvhd ? readHeaderTiming(u8, mvhd) : null;
    const out = {
      container,
      duration: timing && timing.timescale ? timing.duration / timing.timescale : null,
      video: null,
      audio: null,
      audioCount: 0,
    };
    for (const trak of boxes(u8, moov.body, moov.end)) {
      if (trak.type !== 'trak') continue;
      const t = readTrack(u8, trak);
      if (!t) continue;
      if (t.kind === 'vide' && !out.video) {
        out.video = { codec: t.codec, profile: t.profile, width: t.width, height: t.height, fps: t.fps, frames: t.frames };
      } else if (t.kind === 'soun') {
        out.audioCount++;
        if (!out.audio) out.audio = { codec: t.codec, channels: t.channels, sampleRate: t.sampleRate };
      }
    }
    return out;
  }

  async function probeMp4(filePath) {
    let container = 'MP4';
    let offset = 0;
    for (let i = 0; i < TOP_BOXES_MAX; i++) {
      const head = await readRange(filePath, offset, 16);
      if (!head || head.data.length < 8) return null;
      const dv = new DataView(head.data.buffer, head.data.byteOffset, head.data.byteLength);
      let size = dv.getUint32(0);
      const type = ascii(head.data, 4, 4);
      if (size === 1 && head.data.length >= 16) size = dv.getUint32(8) * 2 ** 32 + dv.getUint32(12);
      else if (size === 0) size = head.size - offset;
      if (size < 8) return null;
      if (type === 'ftyp' && head.data.length >= 12) {
        container = ascii(head.data, 8, 4) === 'qt  ' ? 'QuickTime' : 'MP4';
      } else if (type === 'moov') {
        if (size > MOOV_MAX) return null;
        const r = await readRange(filePath, offset, size);
        if (!r || r.data.length < size) return null;
        const moov = { type, start: 0, end: size, body: size >= 2 ** 32 ? 16 : 8 };
        return parseMoov(r.data, moov, container);
      }
      offset += size;
      if (offset >= head.size) return null;
    }
    return null;
  }

  /* ======================= Matroska / WebM (EBML) ======================= */

  const EBML = {
    HEADER: 0x1a45dfa3,
    DOCTYPE: 0x4282,
    SEGMENT: 0x18538067,
    INFO: 0x1549a966,
    TIMECODE_SCALE: 0x2ad7b1,
    DURATION: 0x4489,
    TRACKS: 0x1654ae6b,
    TRACK_ENTRY: 0xae,
    TRACK_TYPE: 0x83,
    CODEC_ID: 0x86,
    DEFAULT_DURATION: 0x23e383,
    VIDEO: 0xe0,
    PIXEL_WIDTH: 0xb0,
    PIXEL_HEIGHT: 0xba,
    AUDIO: 0xe1,
    SAMPLING_FREQUENCY: 0xb5,
    CHANNELS: 0x9f,
    CLUSTER: 0x1f43b675,
  };

  const MKV_CODECS = {
    'V_MPEG4/ISO/AVC': 'H.264 / AVC',
    'V_MPEGH/ISO/HEVC': 'H.265 / HEVC',
    V_AV1: 'AV1',
    V_VP8: 'VP8',
    V_VP9: 'VP9',
    'V_MPEG4/ISO/ASP': 'MPEG-4 ASP',
    'V_MPEG4/ISO/SP': 'MPEG-4 SP',
    V_MPEG2: 'MPEG-2',
    V_MPEG1: 'MPEG-1',
    V_THEORA: 'Theora',
    V_PRORES: 'Apple ProRes',
    V_MJPEG: 'Motion JPEG',
    V_FFV1: 'FFV1',
    A_AAC: 'AAC',
    A_OPUS: 'Opus',
    A_VORBIS: 'Vorbis',
    'A_MPEG/L3': 'MP3',
    'A_MPEG/L2': 'MP2',
    A_AC3: 'AC-3',
    A_EAC3: 'E-AC-3',
    A_TRUEHD: 'Dolby TrueHD',
    A_DTS: 'DTS',
    A_FLAC: 'FLAC',
    A_ALAC: 'ALAC',
    'A_PCM/INT/LIT': 'PCM',
    'A_PCM/INT/BIG': 'PCM',
    'A_PCM/FLOAT/IEEE': 'PCM flottant',
  };

  function mkvCodecLabel(id) {
    if (MKV_CODECS[id]) return MKV_CODECS[id];
    const base = Object.keys(MKV_CODECS).find((k) => id.startsWith(k + '/'));
    if (base) return MKV_CODECS[base];
    return id.replace(/^[AV]_/, '');
  }

  /** Entier à longueur variable EBML (identifiant si keepMarker). */
  function vint(u8, o, keepMarker) {
    if (o >= u8.length) return null;
    const first = u8[o];
    if (!first) return null;
    let len = 1;
    let mask = 0x80;
    while (!(first & mask)) {
      len++;
      mask >>= 1;
    }
    if (o + len > u8.length) return null;
    let value = keepMarker ? first : first & (mask - 1);
    let allOnes = !keepMarker && value === mask - 1;
    for (let i = 1; i < len; i++) {
      value = value * 256 + u8[o + i];
      if (u8[o + i] !== 0xff) allOnes = false;
    }
    return { value, len, unknown: allOnes };
  }

  /** Éléments enfants de u8[start, end) : { id, body, end, size }. */
  function* ebmlChildren(u8, start, end) {
    let o = start;
    while (o < end) {
      const id = vint(u8, o, true);
      if (!id) return;
      const sz = vint(u8, o + id.len, false);
      if (!sz) return;
      const body = o + id.len + sz.len;
      // taille inconnue (flux en direct, Segment non finalisé) : l'élément
      // court jusqu'à la fin de la zone lue
      const elEnd = sz.unknown ? end : Math.min(end, body + sz.value);
      yield { id: id.value, body, end: elEnd, unknown: sz.unknown };
      if (sz.unknown) return;
      o = elEnd;
    }
  }

  function ebmlUint(u8, el) {
    let v = 0;
    for (let i = el.body; i < el.end; i++) v = v * 256 + u8[i];
    return v;
  }

  function ebmlFloat(u8, el) {
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    const n = el.end - el.body;
    if (n === 4) return dv.getFloat32(el.body);
    if (n === 8) return dv.getFloat64(el.body);
    return null;
  }

  function ebmlString(u8, el) {
    return new TextDecoder().decode(u8.subarray(el.body, el.end)).replace(/\0+$/, '');
  }

  function readMkvTrack(u8, entry) {
    const t = { type: 0, codecId: '', defaultDuration: null, width: null, height: null, channels: null, sampleRate: null };
    for (const el of ebmlChildren(u8, entry.body, entry.end)) {
      if (el.id === EBML.TRACK_TYPE) t.type = ebmlUint(u8, el);
      else if (el.id === EBML.CODEC_ID) t.codecId = ebmlString(u8, el);
      else if (el.id === EBML.DEFAULT_DURATION) t.defaultDuration = ebmlUint(u8, el);
      else if (el.id === EBML.VIDEO) {
        for (const v of ebmlChildren(u8, el.body, el.end)) {
          if (v.id === EBML.PIXEL_WIDTH) t.width = ebmlUint(u8, v);
          else if (v.id === EBML.PIXEL_HEIGHT) t.height = ebmlUint(u8, v);
        }
      } else if (el.id === EBML.AUDIO) {
        for (const a of ebmlChildren(u8, el.body, el.end)) {
          if (a.id === EBML.SAMPLING_FREQUENCY) t.sampleRate = ebmlFloat(u8, a);
          else if (a.id === EBML.CHANNELS) t.channels = ebmlUint(u8, a);
        }
      }
    }
    return t;
  }

  async function probeMkv(filePath) {
    const r = await readRange(filePath, 0, MKV_HEAD);
    if (!r) return null;
    const u8 = r.data;
    let container = 'Matroska';
    let segment = null;
    for (const el of ebmlChildren(u8, 0, u8.length)) {
      if (el.id === EBML.HEADER) {
        for (const h of ebmlChildren(u8, el.body, el.end)) {
          if (h.id === EBML.DOCTYPE && ebmlString(u8, h) === 'webm') container = 'WebM';
        }
      } else if (el.id === EBML.SEGMENT) {
        segment = el;
        break;
      }
    }
    if (!segment) return null;

    const out = { container, duration: null, video: null, audio: null, audioCount: 0 };
    let timecodeScale = 1e6; // ns, valeur par défaut de la norme
    let rawDuration = null;
    for (const el of ebmlChildren(u8, segment.body, segment.end)) {
      if (el.id === EBML.CLUSTER) break; // les métadonnées précèdent les données
      if (el.id === EBML.INFO) {
        for (const i of ebmlChildren(u8, el.body, el.end)) {
          if (i.id === EBML.TIMECODE_SCALE) timecodeScale = ebmlUint(u8, i);
          else if (i.id === EBML.DURATION) rawDuration = ebmlFloat(u8, i);
        }
      } else if (el.id === EBML.TRACKS) {
        for (const te of ebmlChildren(u8, el.body, el.end)) {
          if (te.id !== EBML.TRACK_ENTRY) continue;
          const t = readMkvTrack(u8, te);
          if (t.type === 1 && !out.video) {
            out.video = {
              codec: mkvCodecLabel(t.codecId),
              profile: null,
              width: t.width,
              height: t.height,
              fps: t.defaultDuration ? 1e9 / t.defaultDuration : null,
              frames: null,
            };
          } else if (t.type === 2) {
            out.audioCount++;
            if (!out.audio) {
              out.audio = { codec: mkvCodecLabel(t.codecId), channels: t.channels, sampleRate: t.sampleRate ? Math.round(t.sampleRate) : null };
            }
          }
        }
      }
    }
    if (rawDuration != null && timecodeScale) out.duration = (rawDuration * timecodeScale) / 1e9;
    return out;
  }

  /* ======================= Point d'entrée ======================= */

  const PROBES = {
    mp4: probeMp4,
    m4v: probeMp4,
    mov: probeMp4,
    mkv: probeMkv,
    webm: probeMkv,
  };

  /**
   * Sonde un fichier vidéo d'après son extension. Ne lève jamais : null si
   * le conteneur est inconnu ou illisible.
   * @param {string} filePath
   * @returns {Promise<VideoProbe|null>}
   */
  async function probe(filePath) {
    const ext = filePath.slice(filePath.lastIndexOf('.') + 1).toLowerCase();
    const fn = PROBES[ext];
    if (!fn) return null;
    try {
      return await fn(filePath);
    } catch {
      return null;
    }
  }

  return { probe };
})();
