/**
 * A .ico holding PNG images (supported by every browser since Vista-era
 * Windows): a 6-byte header, one 16-byte entry per image, then the PNGs.
 * @param {{ size: number, data: Buffer }[]} pngs smallest first
 * @returns {Buffer}
 */
export function icoFromPngs(pngs) {
  const header = Buffer.alloc(6 + 16 * pngs.length);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);
  let offset = header.length;
  pngs.forEach(({ size, data }, i) => {
    const at = 6 + 16 * i;
    header[at] = size >= 256 ? 0 : size; // width; 0 means 256
    header[at + 1] = size >= 256 ? 0 : size; // height
    header.writeUInt16LE(1, at + 4); // colour planes
    header.writeUInt16LE(32, at + 6); // bits per pixel
    header.writeUInt32LE(data.length, at + 8);
    header.writeUInt32LE(offset, at + 12);
    offset += data.length;
  });
  return Buffer.concat([header, ...pngs.map((p) => p.data)]);
}
