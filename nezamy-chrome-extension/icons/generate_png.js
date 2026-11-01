const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// CRC32 table
const crcTable = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  }
  crcTable[i] = c >>> 0;
}

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createChunk(type, data) {
  const len = data.length;
  const chunk = Buffer.alloc(12 + len);
  chunk.writeUInt32BE(len, 0);
  chunk.write(type, 4, 4, 'ascii');
  data.copy(chunk, 8);
  const typeAndData = chunk.subarray(4, 8 + len);
  chunk.writeUInt32BE(crc32(typeAndData), 8 + len);
  return chunk;
}

function generateIcon(size) {
  const width = size;
  const height = size;

  // Scanlines: (1 byte filter + width * 4 bytes RGBA) * height
  const rowLen = 1 + width * 4;
  const raw = Buffer.alloc(rowLen * height);

  const cx = width / 2;
  const cy = height / 2;
  const r = width / 2 - 1;

  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowLen;
    raw[rowOffset] = 0; // Filter 0: None

    for (let x = 0; x < width; x++) {
      const pxOffset = rowOffset + 1 + x * 4;
      const dx = x - cx + 0.5;
      const dy = y - cy + 0.5;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist <= r) {
        // Emerald background: #059669 (5, 150, 105)
        let red = 5;
        let green = 150;
        let blue = 105;
        let alpha = 255;

        // Anti-aliasing at the boundary
        if (dist > r - 1) {
          alpha = Math.floor(255 * (r - dist));
        }

        // Inner golden ring
        if (dist >= r - 2 && dist <= r - 0.5 && size >= 32) {
          red = 245;
          green = 158;
          blue = 11;
        }

        // Letter 'ن' center dot and arc representation
        const nx = dx / r;
        const ny = dy / r;

        // The dot of 'ن' (circle above center)
        const dotDist = Math.sqrt(nx * nx + (ny + 0.35) * (ny + 0.35));
        if (dotDist <= 0.16) {
          red = 255;
          green = 255;
          blue = 255;
          alpha = 255;
        }

        // The bowl of 'ن' (arc in lower half)
        const bowlRadius = Math.sqrt(nx * nx + (ny - 0.05) * (ny - 0.05));
        if (bowlRadius >= 0.32 && bowlRadius <= 0.54 && ny >= -0.05) {
          red = 255;
          green = 255;
          blue = 255;
          alpha = 255;
        }

        raw[pxOffset] = red;
        raw[pxOffset + 1] = green;
        raw[pxOffset + 2] = blue;
        raw[pxOffset + 3] = alpha;
      } else {
        // Transparent
        raw[pxOffset] = 0;
        raw[pxOffset + 1] = 0;
        raw[pxOffset + 2] = 0;
        raw[pxOffset + 3] = 0;
      }
    }
  }

  // Header
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  // IHDR
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // bit depth
  ihdrData[9] = 6; // color type RGBA
  ihdrData[10] = 0; // compression
  ihdrData[11] = 0; // filter
  ihdrData[12] = 0; // interlace
  const ihdrChunk = createChunk('IHDR', ihdrData);

  // IDAT
  const compressed = zlib.deflateSync(raw);
  const idatChunk = createChunk('IDAT', compressed);

  // IEND
  const iendChunk = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([sig, ihdrChunk, idatChunk, iendChunk]);
}

const outDir = __dirname;
[16, 32, 48, 128].forEach(size => {
  const png = generateIcon(size);
  const filePath = path.join(outDir, `icon${size}.png`);
  fs.writeFileSync(filePath, png);
  console.log(`Generated pure PNG: ${filePath} (${png.length} bytes)`);
});
