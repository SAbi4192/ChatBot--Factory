/**
 * Zero-dependency ZIP writer (STORE method).
 *
 * Export bundles are a handful of small plain-text files, so a STORE-only
 * archive is ideal: no compression CPU, no streaming complexity, and it
 * avoids pulling an extra runtime dependency into the backend. Every file
 * ends up smaller than the zip's own overhead would make a .gz pipeline
 * worthwhile, and any unzip tool handles STORE natively.
 *
 * Reference: APPNOTE.TXT (PKWARE) — local file headers + central directory
 * + end-of-central-directory record.
 */

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i += 1) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function dosDateTime(date = new Date()) {
  const d = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  const t = (date.getHours() << 11) | (date.getMinutes() << 5) | (Math.floor(date.getSeconds() / 2));
  return { time: t & 0xffff, date: d & 0xffff };
}

/**
 * Build a .zip Buffer.
 * @param {Record<string, string>} files map of zipPath -> utf8 contents
 * @param {Date} [timestamp] shared DOS timestamp for entries
 */
export function zipFiles(files, timestamp = new Date()) {
  const { time, date } = dosDateTime(timestamp);
  const entries = Object.entries(files).map(([path, content]) => {
    const nameBuf = Buffer.from(path.replaceAll('\\', '/'), 'utf8');
    const dataBuf = Buffer.from(content, 'utf8');
    const crc = crc32(dataBuf);
    const local = Buffer.alloc(30 + nameBuf.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(dataBuf.length, 18);
    local.writeUInt32LE(dataBuf.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    nameBuf.copy(local, 30);

    const central = Buffer.alloc(46 + nameBuf.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(date, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(dataBuf.length, 20);
    central.writeUInt32LE(dataBuf.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(0, 38);
    nameBuf.copy(central, 46);
    return { path, local, central, size: local.length + dataBuf.length, dataBuf };
  });

  let offset = 0;
  const locals = [];
  const centrals = entries.map((e) => {
    e.central.writeUInt32LE(offset, 42);
    locals.push(e.local, e.dataBuf);
    offset += e.local.length + e.dataBuf.length;
    return e.central;
  });

  const centralStart = offset;
  const centralBuf = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(centralStart, 16);

  return Buffer.concat([...locals, centralBuf, end]);
}
