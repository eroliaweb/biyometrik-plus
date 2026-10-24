const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

async function createIco() {
  const srcPng = path.join(__dirname, 'icon.png');
  const outIco = path.join(__dirname, 'icon.ico');

  const sizes = [256, 128, 64, 48, 32, 16];
  const pngBuffers = [];

  for (const size of sizes) {
    const buf = await sharp(srcPng)
      .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
    pngBuffers.push({ size, buffer: buf });
  }

  // Calculate ICO header & directory structure
  // Header: 6 bytes
  // Directory entries: 16 bytes each
  const headerSize = 6;
  const dirEntrySize = 16;
  const count = pngBuffers.length;
  let offset = headerSize + count * dirEntrySize;

  const icoBuffer = Buffer.alloc(offset + pngBuffers.reduce((sum, p) => sum + p.buffer.length, 0));

  // Write ICONDIR
  icoBuffer.writeUInt16LE(0, 0); // Reserved. Must always be 0.
  icoBuffer.writeUInt16LE(1, 2); // Specifies image type: 1 for icon (.ICO) image
  icoBuffer.writeUInt16LE(count, 4); // Number of images

  let dirOffset = 6;
  for (const img of pngBuffers) {
    const w = img.size >= 256 ? 0 : img.size;
    const h = img.size >= 256 ? 0 : img.size;

    icoBuffer.writeUInt8(w, dirOffset); // Width
    icoBuffer.writeUInt8(h, dirOffset + 1); // Height
    icoBuffer.writeUInt8(0, dirOffset + 2); // Color palette: 0 if not used
    icoBuffer.writeUInt8(0, dirOffset + 3); // Reserved: 0
    icoBuffer.writeUInt16LE(1, dirOffset + 4); // Color planes (1)
    icoBuffer.writeUInt16LE(32, dirOffset + 6); // Bits per pixel (32)
    icoBuffer.writeUInt32LE(img.buffer.length, dirOffset + 8); // Size of image data in bytes
    icoBuffer.writeUInt32LE(offset, dirOffset + 12); // Offset of image data

    img.buffer.copy(icoBuffer, offset);

    offset += img.buffer.length;
    dirOffset += dirEntrySize;
  }

  fs.writeFileSync(outIco, icoBuffer);
  console.log('Successfully generated multi-resolution icon.ico:', fs.statSync(outIco).size, 'bytes');
}

createIco().catch((err) => {
  console.error(err);
  process.exit(1);
});
