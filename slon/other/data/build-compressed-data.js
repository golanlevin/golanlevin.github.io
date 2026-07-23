const fs = require("fs");
const zlib = require("zlib");

const outputPath = "2026_p5js/slon-data.js";
const sourceDir = "app_1024x768";

const datasetSpecs = [
  { file: "100k1297.txt.gz", nick: "1997 December", name: "December, 1997", source: "java-gzip" },
  { file: "100k0498.txt.gz", nick: "1998 April", name: "April, 1998", source: "java-gzip" },
  { file: "100k0102.txt.gz", nick: "2002 January", name: "January, 2002", source: "java-gzip" },
  { file: "100k0703.txt.gz", nick: "2003 July", name: "July, 2003", source: "java-gzip" },
  {
    file: "mojeek_2026_counts.tsv",
    nick: "2026 July",
    name: "July, 2026",
    source: "number-count-tsv",
    path: "2026_scrape/out/mojeek_2026_counts.tsv",
  },
];

function putVarint(out, inputValue) {
  let value = Number(inputValue) >>> 0;
  while (value >= 128) {
    out.push((value & 127) | 128);
    value >>>= 7;
  }
  out.push(value);
}

function bytesToBase64(bytes) {
  return Buffer.from(Uint8Array.from(bytes)).toString("base64");
}

function readJavaGzipCounts(fileName) {
  const rawLines = zlib
    .gunzipSync(fs.readFileSync(`${sourceDir}/${fileName}`))
    .toString("ascii")
    .split(/\r?\n/)
    .filter((lineValue) => lineValue.length);
  const values = new Array(100001).fill(0);
  for (let i = 0; i < Math.min(rawLines.length, values.length); i++) {
    const parsedValue = Number.parseInt(rawLines[i], 10);
    values[i] = Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : 0;
  }
  values[0] = 0;
  return values;
}

function readNumberCountTsv(filePath) {
  const values = new Array(100001).fill(0);
  const seen = new Set();
  const rawLines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const rawLine of rawLines) {
    if (!rawLine || rawLine.startsWith("number\t")) continue;
    const fields = rawLine.split("\t");
    const numberValue = Number.parseInt(fields[0], 10);
    const countValue = Number.parseInt(fields[1], 10);
    if (numberValue < 0 || numberValue > 100000) continue;
    if (!Number.isFinite(countValue) || countValue <= 0) {
      throw new Error(`Invalid popularity count for ${numberValue}: ${fields[1]}`);
    }
    values[numberValue] = countValue;
    seen.add(numberValue);
  }
  if (seen.size !== values.length) {
    throw new Error(`Expected ${values.length} TSV counts in ${filePath}, found ${seen.size}`);
  }
  return values;
}

function readCounts(spec) {
  if (spec.source === "java-gzip") return readJavaGzipCounts(spec.file);
  if (spec.source === "number-count-tsv") return readNumberCountTsv(spec.path);
  throw new Error(`Unsupported dataset source: ${spec.source}`);
}

function readPhrases() {
  const phraseText = fs.readFileSync(`${sourceDir}/phrase_database.txt`, "latin1");
  const lookup = {};
  for (const phraseLine of phraseText.split(/\r?\n/)) {
    if (!phraseLine || phraseLine === "EOF") continue;
    const match = phraseLine.match(/^'(\d+)'(.*)'$/);
    if (!match) continue;
    const numberValue = Number(match[1]);
    if (numberValue < 0 || numberValue > 100000) continue;
    const key = String(numberValue);
    if (!lookup[key]) lookup[key] = [];
    lookup[key].push(match[2]);
  }
  return lookup;
}

const datasets = datasetSpecs.map((spec) => {
  const bytes = [];
  for (const value of readCounts(spec)) putVarint(bytes, value);
  return { file: spec.file, nick: spec.nick, name: spec.name, counts: bytesToBase64(bytes) };
});

const phrases = readPhrases();
const phraseKeys = Object.keys(phrases).map(Number).sort((a, b) => a - b);
const phraseIndexBytes = [];
const phraseValues = [];
let previousKey = 0;
for (const key of phraseKeys) {
  const list = phrases[String(key)] || [];
  putVarint(phraseIndexBytes, key - previousKey);
  putVarint(phraseIndexBytes, list.length);
  previousKey = key;
  for (const phrase of list) phraseValues.push(phrase);
}

const payload = {
  datasets,
  phraseIndex: bytesToBase64(phraseIndexBytes),
  phraseText: Buffer.from(phraseValues.join("\n"), "utf8").toString("base64"),
};

const output = `// Generated from app_1024x768 source data. Compressed browser payload. Do not edit by hand.
(function () {
  const payload = ${JSON.stringify(payload)};

  function bytesFromBase64(encoded) {
    const binary = atob(encoded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  function varintsFromBase64(encoded) {
    const bytes = bytesFromBase64(encoded);
    const values = [];
    let value = 0;
    let shift = 0;
    for (let i = 0; i < bytes.length; i++) {
      const byteValue = bytes[i];
      value |= (byteValue & 0x7f) << shift;
      if (byteValue & 0x80) {
        shift += 7;
      } else {
        values.push(value >>> 0);
        value = 0;
        shift = 0;
      }
    }
    return values;
  }

  function phraseLookupFromPayload() {
    const indexValues = varintsFromBase64(payload.phraseIndex);
    const phraseBlob = new TextDecoder().decode(bytesFromBase64(payload.phraseText));
    const phraseValues = phraseBlob ? phraseBlob.split("\\n") : [];
    const lookup = {};
    let numberValue = 0;
    let phraseOffset = 0;
    for (let i = 0; i < indexValues.length; i += 2) {
      numberValue += indexValues[i];
      const phraseCount = indexValues[i + 1];
      lookup[String(numberValue)] = phraseValues.slice(phraseOffset, phraseOffset + phraseCount);
      phraseOffset += phraseCount;
    }
    return lookup;
  }

  window.SLON_DATA = {
    datasets: payload.datasets.map((datasetPayload) => ({
      file: datasetPayload.file,
      nick: datasetPayload.nick,
      name: datasetPayload.name,
      data: varintsFromBase64(datasetPayload.counts),
    })),
    phrases: phraseLookupFromPayload(),
  };
})();
`;

fs.writeFileSync(outputPath, output);

console.log(JSON.stringify({
  outputPath,
  outputBytes: fs.statSync(outputPath).size,
  datasetCount: datasets.length,
  phraseKeyCount: phraseKeys.length,
}, null, 2));
