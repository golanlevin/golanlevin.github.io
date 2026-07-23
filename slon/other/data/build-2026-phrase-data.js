const fs = require("fs");
const zlib = require("zlib");

const inputPath = "2026_p5js/data/30_final_phrases_2026_phrase_only_with_additions.tsv";
const outputPath = "2026_p5js/slon-data-2026.js";
const lineCount = 100000;

function bytesToBase64(bytes) {
  return Buffer.from(bytes).toString("base64");
}

function readPhraseLines() {
  const text = fs.readFileSync(inputPath, "utf8").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = text.endsWith("\n") ? text.slice(0, -1).split("\n") : text.split("\n");
  if (lines.length !== lineCount) {
    throw new Error(`Expected ${lineCount} phrase lines in ${inputPath}, found ${lines.length}`);
  }
  return lines;
}

const phraseText = readPhraseLines().join("\n");
const gzipped = zlib.gzipSync(Buffer.from(phraseText, "utf8"), { level: 9 });

const payload = {
  format: "slon-2026-phrases-v1",
  encoding: "gzip+base64+utf8",
  firstNumber: 1,
  lineCount,
  separator: " | ",
  textGzip: bytesToBase64(gzipped),
};

const output = `// Generated from 2026 phrase data. Gzip/base64 browser payload. Do not edit by hand.
(function () {
  const payload = ${JSON.stringify(payload)};

  function bytesFromBase64(encoded) {
    const binary = atob(encoded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  async function gunzipBytes(bytes) {
    if (typeof DecompressionStream !== "function") {
      throw new Error("This browser does not support DecompressionStream for gzip data.");
    }
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  function normalizeLines(text) {
    const normalized = text.replace(/\\r\\n/g, "\\n").replace(/\\r/g, "\\n");
    const lines = normalized.endsWith("\\n") ? normalized.slice(0, -1).split("\\n") : normalized.split("\\n");
    while (lines.length < payload.lineCount) lines.push("");
    if (lines.length > payload.lineCount) lines.length = payload.lineCount;
    return lines;
  }

  const api = {
    loaded: false,
    error: null,
    lineCount: payload.lineCount,
    firstNumber: payload.firstNumber,
    lines: null,
    get(num) {
      if (!this.loaded || !this.lines) return null;
      const index = num - this.firstNumber;
      if (index < 0 || index >= this.lines.length) return null;
      const line = this.lines[index];
      return line ? line.split(payload.separator).filter((phrase) => phrase.length) : null;
    },
  };

  api.ready = gunzipBytes(bytesFromBase64(payload.textGzip))
    .then((bytes) => {
      const text = new TextDecoder().decode(bytes);
      api.lines = normalizeLines(text);
      api.loaded = true;
      return api;
    })
    .catch((error) => {
      api.error = error;
      console.error("Unable to decode 2026 phrase data.", error);
      return api;
    });

  window.SLON_DATA_2026_PHRASES = api;
})();
`;

fs.writeFileSync(outputPath, output);

console.log(
  JSON.stringify(
    {
      inputPath,
      outputPath,
      inputBytes: fs.statSync(inputPath).size,
      gzipBytes: gzipped.length,
      outputBytes: fs.statSync(outputPath).size,
      lineCount,
    },
    null,
    2
  )
);
