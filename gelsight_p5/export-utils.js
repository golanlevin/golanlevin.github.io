(function (root, factory) {
  root.GelSightExport = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const SOLVER_DEPTH_SCALE = 1000;
  const SOLVER_DEPTH_OFFSET = 32768;
  const SOLVER_DEPTH_MIN = -32.768;
  const SOLVER_DEPTH_MAX = 32.767;

  const crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    crcTable[n] = c >>> 0;
  }

  /**
   * Format a local timestamp for export ZIP filenames.
   */
  function timestampForFilename(date = new Date()) {
    const pad = (value) => String(value).padStart(2, "0");
    return (
      `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_` +
      `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
    );
  }

  /**
   * Encode a canvas as PNG bytes.
   */
  async function canvasToPngBytes(canvas) {
    return canvasToImageBytes(canvas, "image/png", undefined, "PNG");
  }

  /**
   * Encode a canvas as JPEG bytes.
   */
  async function canvasToJpegBytes(canvas, quality = 0.92) {
    return canvasToImageBytes(canvas, "image/jpeg", quality, "JPEG");
  }

  /**
   * Encode a canvas to image bytes via canvas.toBlob().
   */
  async function canvasToImageBytes(canvas, mimeType, quality, label) {
    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob((result) => {
        if (result) {
          resolve(result);
        } else {
          reject(new Error(`Could not encode capture ${label}.`));
        }
      }, mimeType, quality);
    });
    return blobToBytes(blob);
  }

  /**
   * Convert a Blob into a Uint8Array.
   */
  async function blobToBytes(blob) {
    return new Uint8Array(await blob.arrayBuffer());
  }

  /**
   * Read uncompressed ZIP entries into a name-to-bytes map.
   */
  function readStoredZip(bytes) {
    const entries = new Map();
    let offset = 0;
    while (offset < bytes.length - 4) {
      const signature = readUint32LE(bytes, offset);
      if (signature === 0x02014b50 || signature === 0x06054b50) {
        break;
      }
      if (signature !== 0x04034b50) {
        offset += 1;
        continue;
      }

      const compressionMethod = readUint16LE(bytes, offset + 8);
      const compressedSize = readUint32LE(bytes, offset + 18);
      const uncompressedSize = readUint32LE(bytes, offset + 22);
      const nameLength = readUint16LE(bytes, offset + 26);
      const extraLength = readUint16LE(bytes, offset + 28);
      const nameStart = offset + 30;
      const dataStart = nameStart + nameLength + extraLength;
      const name = new TextDecoder().decode(
        bytes.subarray(nameStart, nameStart + nameLength),
      );
      if (compressionMethod !== 0) {
        throw new Error(`Unsupported ZIP compression for ${name}.`);
      }
      if (compressedSize !== uncompressedSize) {
        throw new Error(`Unexpected compressed ZIP entry size for ${name}.`);
      }
      entries.set(name, bytes.slice(dataStart, dataStart + compressedSize));
      offset = dataStart + compressedSize;
    }
    return entries;
  }

  /**
   * Decode the project 16-bit grayscale depth PNG format.
   */
  function decodeDepthPng16(bytes) {
    if (!matchesSignature(bytes, PNG_SIGNATURE)) {
      throw new Error("Depth file is not a PNG.");
    }

    let offset = PNG_SIGNATURE.length;
    let width = 0;
    let height = 0;
    let bitDepth = 0;
    let colorType = 0;
    const text = {};
    const idatParts = [];

    while (offset < bytes.length) {
      const length = readUint32BE(bytes, offset);
      const type = asciiString(bytes.subarray(offset + 4, offset + 8));
      const data = bytes.subarray(offset + 8, offset + 8 + length);
      offset += 12 + length;

      if (type === "IHDR") {
        width = readUint32BE(data, 0);
        height = readUint32BE(data, 4);
        bitDepth = data[8];
        colorType = data[9];
      } else if (type === "tEXt") {
        const nul = data.indexOf(0);
        if (nul >= 0) {
          text[asciiString(data.subarray(0, nul))] = asciiString(
            data.subarray(nul + 1),
          );
        }
      } else if (type === "IDAT") {
        idatParts.push(data);
      } else if (type === "IEND") {
        break;
      }
    }

    if (bitDepth !== 16 || colorType !== 0) {
      throw new Error("Expected a 16-bit grayscale depth PNG.");
    }

    const raw = inflateZlibStore(concatBytes(idatParts));
    const depthMin = Number(text.DepthMin);
    const depthMax = Number(text.DepthMax);
    const span = Number.isFinite(depthMax - depthMin) ? depthMax - depthMin : 1;
    const depth = new Float32Array(width * height);
    let input = 0;
    let output = 0;
    for (let y = 0; y < height; y += 1) {
      const filter = raw[input];
      input += 1;
      if (filter !== 0) {
        throw new Error("Unsupported PNG filter in depth PNG.");
      }
      for (let x = 0; x < width; x += 1) {
        const encoded = (raw[input] << 8) | raw[input + 1];
        input += 2;
        depth[output] = depthMin + (encoded / 65535) * span;
        output += 1;
      }
    }

    return {
      width,
      height,
      depth,
      depthMin,
      depthMax,
      text,
    };
  }

  /**
   * Encode depth as a per-capture normalized 16-bit grayscale PNG.
   */
  function encodeDepthPng16(depth, width, height) {
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < depth.length; i += 1) {
      const value = depth[i];
      if (value < min) min = value;
      if (value > max) max = value;
    }
    const span = max > min ? max - min : 1;
    const raw = new Uint8Array(height * (1 + width * 2));
    let out = 0;
    for (let y = 0; y < height; y += 1) {
      raw[out] = 0;
      out += 1;
      for (let x = 0; x < width; x += 1) {
        const value = depth[y * width + x];
        const normalized = Math.max(0, Math.min(1, (value - min) / span));
        const encoded = Math.round(normalized * 65535);
        raw[out] = encoded >>> 8;
        raw[out + 1] = encoded & 255;
        out += 2;
      }
    }

    const chunks = [
      pngChunk("IHDR", ihdr(width, height, 16, 0)),
      pngTextChunk(
        "DepthEncoding",
        "uint16 = round((depth - DepthMin) / (DepthMax - DepthMin) * 65535)",
      ),
      pngTextChunk("DepthMin", String(min)),
      pngTextChunk("DepthMax", String(max)),
      pngTextChunk("DepthWidth", String(width)),
      pngTextChunk("DepthHeight", String(height)),
      pngChunk("IDAT", zlibStore(raw)),
      pngChunk("IEND", new Uint8Array()),
    ];
    return concatBytes([PNG_SIGNATURE, ...chunks]);
  }

  /**
   * Encode depth in fixed solver units as a 16-bit grayscale PNG.
   */
  function encodeDepthSolverUnitsPng16(depth, width, height) {
    const raw = new Uint8Array(height * (1 + width * 2));
    let out = 0;
    let clippedLow = 0;
    let clippedHigh = 0;
    let nonFinite = 0;

    for (let y = 0; y < height; y += 1) {
      raw[out] = 0;
      out += 1;
      for (let x = 0; x < width; x += 1) {
        const value = depth[y * width + x];
        let encoded;
        if (!Number.isFinite(value)) {
          encoded = SOLVER_DEPTH_OFFSET;
          nonFinite += 1;
        } else {
          encoded = Math.round(value * SOLVER_DEPTH_SCALE + SOLVER_DEPTH_OFFSET);
          if (encoded < 0) {
            encoded = 0;
            clippedLow += 1;
          } else if (encoded > 65535) {
            encoded = 65535;
            clippedHigh += 1;
          }
        }
        raw[out] = encoded >>> 8;
        raw[out + 1] = encoded & 255;
        out += 2;
      }
    }

    const chunks = [
      pngChunk("IHDR", ihdr(width, height, 16, 0)),
      pngTextChunk(
        "DepthEncoding",
        "uint16 = clamp(round(depth * 1000 + 32768), 0, 65535)",
      ),
      pngTextChunk(
        "DepthDecode",
        "depth = (uint16 - 32768) / 1000",
      ),
      pngTextChunk("DepthUnits", "solver_units"),
      pngTextChunk("DepthScale", String(SOLVER_DEPTH_SCALE)),
      pngTextChunk("DepthOffset", String(SOLVER_DEPTH_OFFSET)),
      pngTextChunk("DepthMin", String(SOLVER_DEPTH_MIN)),
      pngTextChunk("DepthMax", String(SOLVER_DEPTH_MAX)),
      pngTextChunk("DepthZeroValue", String(SOLVER_DEPTH_OFFSET)),
      pngTextChunk("DepthWidth", String(width)),
      pngTextChunk("DepthHeight", String(height)),
      pngTextChunk("ClippedLowCount", String(clippedLow)),
      pngTextChunk("ClippedHighCount", String(clippedHigh)),
      pngTextChunk("NonFiniteCount", String(nonFinite)),
      pngChunk("IDAT", zlibStore(raw)),
      pngChunk("IEND", new Uint8Array()),
    ];
    return {
      bytes: concatBytes([PNG_SIGNATURE, ...chunks]),
      clippedLow,
      clippedHigh,
      nonFinite,
      scale: SOLVER_DEPTH_SCALE,
      offset: SOLVER_DEPTH_OFFSET,
      min: SOLVER_DEPTH_MIN,
      max: SOLVER_DEPTH_MAX,
    };
  }

  /**
   * Convert a depth heightfield into an OBJ triangle mesh.
   */
  function depthToObj(depth, width, height, scaleZ = 1) {
    const lines = [
      "# GelSight depth grid",
      `# width ${width}`,
      `# height ${height}`,
      `# z_scale ${scaleZ}`,
    ];
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        lines.push(
          `v ${x} ${-y} ${(depth[y * width + x] * scaleZ).toFixed(8)}`,
        );
      }
    }
    for (let y = 0; y < height - 1; y += 1) {
      for (let x = 0; x < width - 1; x += 1) {
        const a = y * width + x + 1;
        const b = a + 1;
        const c = a + width;
        const d = c + 1;
        lines.push(`f ${a} ${c} ${b}`);
        lines.push(`f ${b} ${c} ${d}`);
      }
    }
    return new TextEncoder().encode(`${lines.join("\n")}\n`);
  }

  /**
   * Create a stored ZIP archive from file byte entries.
   */
  function createZip(files) {
    const localParts = [];
    const centralParts = [];
    let offset = 0;

    for (const file of files) {
      const nameBytes = new TextEncoder().encode(file.name);
      const data = file.data;
      const crc = crc32(data);
      const local = new Uint8Array(30 + nameBytes.length);
      const localView = new DataView(local.buffer);
      localView.setUint32(0, 0x04034b50, true);
      localView.setUint16(4, 20, true);
      localView.setUint16(6, 0, true);
      localView.setUint16(8, 0, true);
      localView.setUint16(10, fileDosTime(file.date), true);
      localView.setUint16(12, fileDosDate(file.date), true);
      localView.setUint32(14, crc, true);
      localView.setUint32(18, data.length, true);
      localView.setUint32(22, data.length, true);
      localView.setUint16(26, nameBytes.length, true);
      localView.setUint16(28, 0, true);
      local.set(nameBytes, 30);
      localParts.push(local, data);

      const central = new Uint8Array(46 + nameBytes.length);
      const centralView = new DataView(central.buffer);
      centralView.setUint32(0, 0x02014b50, true);
      centralView.setUint16(4, 20, true);
      centralView.setUint16(6, 20, true);
      centralView.setUint16(8, 0, true);
      centralView.setUint16(10, 0, true);
      centralView.setUint16(12, fileDosTime(file.date), true);
      centralView.setUint16(14, fileDosDate(file.date), true);
      centralView.setUint32(16, crc, true);
      centralView.setUint32(20, data.length, true);
      centralView.setUint32(24, data.length, true);
      centralView.setUint16(28, nameBytes.length, true);
      centralView.setUint16(30, 0, true);
      centralView.setUint16(32, 0, true);
      centralView.setUint16(34, 0, true);
      centralView.setUint16(36, 0, true);
      centralView.setUint32(38, 0, true);
      centralView.setUint32(42, offset, true);
      central.set(nameBytes, 46);
      centralParts.push(central);

      offset += local.length + data.length;
    }

    const centralDirectory = concatBytes(centralParts);
    const end = new Uint8Array(22);
    const endView = new DataView(end.buffer);
    endView.setUint32(0, 0x06054b50, true);
    endView.setUint16(8, files.length, true);
    endView.setUint16(10, files.length, true);
    endView.setUint32(12, centralDirectory.length, true);
    endView.setUint32(16, offset, true);

    return concatBytes([...localParts, centralDirectory, end]);
  }

  /**
   * Trigger a browser download for a byte buffer.
   */
  function downloadBytes(
    bytes,
    filename,
    mimeType = "application/octet-stream",
  ) {
    const blob = new Blob([bytes], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /**
   * Create PNG IHDR chunk payload bytes.
   */
  function ihdr(width, height, bitDepth, colorType) {
    const bytes = new Uint8Array(13);
    const view = new DataView(bytes.buffer);
    view.setUint32(0, width, false);
    view.setUint32(4, height, false);
    bytes[8] = bitDepth;
    bytes[9] = colorType;
    bytes[10] = 0;
    bytes[11] = 0;
    bytes[12] = 0;
    return bytes;
  }

  /**
   * Create a PNG tEXt metadata chunk.
   */
  function pngTextChunk(keyword, text) {
    const keyBytes = asciiBytes(keyword);
    const textBytes = asciiBytes(text);
    const data = new Uint8Array(keyBytes.length + 1 + textBytes.length);
    data.set(keyBytes, 0);
    data[keyBytes.length] = 0;
    data.set(textBytes, keyBytes.length + 1);
    return pngChunk("tEXt", data);
  }

  /**
   * Create a complete PNG chunk with CRC.
   */
  function pngChunk(type, data) {
    const typeBytes = asciiBytes(type);
    const out = new Uint8Array(12 + data.length);
    const view = new DataView(out.buffer);
    view.setUint32(0, data.length, false);
    out.set(typeBytes, 4);
    out.set(data, 8);
    view.setUint32(
      8 + data.length,
      crc32(concatBytes([typeBytes, data])),
      false,
    );
    return out;
  }

  /**
   * Wrap raw bytes in an uncompressed zlib stream.
   */
  function zlibStore(raw) {
    const blocks = [];
    let offset = 0;
    while (offset < raw.length) {
      const len = Math.min(65535, raw.length - offset);
      const finalBlock = offset + len >= raw.length ? 1 : 0;
      const block = new Uint8Array(5 + len);
      block[0] = finalBlock;
      block[1] = len & 255;
      block[2] = len >>> 8;
      const nlen = ~len & 65535;
      block[3] = nlen & 255;
      block[4] = nlen >>> 8;
      block.set(raw.subarray(offset, offset + len), 5);
      blocks.push(block);
      offset += len;
    }
    const header = new Uint8Array([0x78, 0x01]);
    const checksum = new Uint8Array(4);
    new DataView(checksum.buffer).setUint32(0, adler32(raw), false);
    return concatBytes([header, ...blocks, checksum]);
  }

  /**
   * Inflate the uncompressed zlib stream format written by this module.
   */
  function inflateZlibStore(bytes) {
    if (bytes.length < 6) {
      throw new Error("Invalid zlib stream.");
    }
    const parts = [];
    let offset = 2;
    let finalBlock = 0;
    while (!finalBlock && offset < bytes.length - 4) {
      finalBlock = bytes[offset] & 1;
      const blockType = (bytes[offset] >> 1) & 3;
      offset += 1;
      if (blockType !== 0) {
        throw new Error("Only stored DEFLATE blocks are supported.");
      }
      const len = bytes[offset] | (bytes[offset + 1] << 8);
      const nlen = bytes[offset + 2] | (bytes[offset + 3] << 8);
      offset += 4;
      if (((len ^ nlen) & 65535) !== 65535) {
        throw new Error("Invalid stored DEFLATE block length.");
      }
      parts.push(bytes.subarray(offset, offset + len));
      offset += len;
    }
    return concatBytes(parts);
  }

  /**
   * Compute the CRC-32 checksum used by PNG chunks.
   */
  function crc32(bytes) {
    let crc = 0xffffffff;
    for (let i = 0; i < bytes.length; i += 1) {
      crc = crcTable[(crc ^ bytes[i]) & 255] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  /**
   * Compute the Adler-32 checksum used by zlib streams.
   */
  function adler32(bytes) {
    let a = 1;
    let b = 0;
    for (let i = 0; i < bytes.length; i += 1) {
      a = (a + bytes[i]) % 65521;
      b = (b + a) % 65521;
    }
    return ((b << 16) | a) >>> 0;
  }

  /**
   * Concatenate Uint8Array chunks.
   */
  function concatBytes(parts) {
    const total = parts.reduce((sum, part) => sum + part.length, 0);
    const out = new Uint8Array(total);
    let offset = 0;
    for (const part of parts) {
      out.set(part, offset);
      offset += part.length;
    }
    return out;
  }

  /**
   * Encode an ASCII string as bytes.
   */
  function asciiBytes(text) {
    const bytes = new Uint8Array(text.length);
    for (let i = 0; i < text.length; i += 1) {
      bytes[i] = text.charCodeAt(i) & 255;
    }
    return bytes;
  }

  /**
   * Decode bytes as an ASCII string.
   */
  function asciiString(bytes) {
    let out = "";
    for (let i = 0; i < bytes.length; i += 1) {
      out += String.fromCharCode(bytes[i]);
    }
    return out;
  }

  /**
   * Check whether a byte array starts with a signature.
   */
  function matchesSignature(bytes, signature) {
    if (bytes.length < signature.length) {
      return false;
    }
    for (let i = 0; i < signature.length; i += 1) {
      if (bytes[i] !== signature[i]) {
        return false;
      }
    }
    return true;
  }

  /**
   * Read a little-endian unsigned 16-bit integer.
   */
  function readUint16LE(bytes, offset) {
    return bytes[offset] | (bytes[offset + 1] << 8);
  }

  /**
   * Read a little-endian unsigned 32-bit integer.
   */
  function readUint32LE(bytes, offset) {
    return (
      (bytes[offset] |
        (bytes[offset + 1] << 8) |
        (bytes[offset + 2] << 16) |
        (bytes[offset + 3] << 24)) >>>
      0
    );
  }

  /**
   * Read a big-endian unsigned 32-bit integer.
   */
  function readUint32BE(bytes, offset) {
    return (
      ((bytes[offset] << 24) |
        (bytes[offset + 1] << 16) |
        (bytes[offset + 2] << 8) |
        bytes[offset + 3]) >>>
      0
    );
  }

  /**
   * Encode a Date as a DOS time field for ZIP metadata.
   */
  function fileDosTime(date) {
    return (
      (date.getHours() << 11) |
      (date.getMinutes() << 5) |
      Math.floor(date.getSeconds() / 2)
    );
  }

  /**
   * Encode a Date as a DOS date field for ZIP metadata.
   */
  function fileDosDate(date) {
    return (
      ((date.getFullYear() - 1980) << 9) |
      ((date.getMonth() + 1) << 5) |
      date.getDate()
    );
  }

  return {
    timestampForFilename,
    canvasToPngBytes,
    canvasToJpegBytes,
    blobToBytes,
    readStoredZip,
    decodeDepthPng16,
    encodeDepthPng16,
    encodeDepthSolverUnitsPng16,
    depthToObj,
    createZip,
    downloadBytes,
  };
});
