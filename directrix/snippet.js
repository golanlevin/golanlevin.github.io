var query = new URLSearchParams(window.location.search);

window.$o = {
  _exports: {},
  _exported: null,
  _v: '1.0.0',
  capture,
  isCapture: query.has('capture'),
  registerExport,
  registerFeatures,
  seed: null,
  seedGlobal: null
};
['seed', 'seedGlobal'].forEach((p) => {
  if (query.get(p)) {
    $o[p] = parseSeed(
      query
        .get(p)
        .replace(/[^0-9a-f]/gi, 'f')
        .padStart(16, '0')
    );
    query.set(p, formatSeed($o[p]));
    window.history.pushState('', '', '?' + query.toString());
  } else {
    $o[p] = parseSeed([...Array(16)].map(() => Math.floor(Math.random() * 16).toString(16)).join(''));
  }
});

function formatSeed(seed) {
  const hex = [];
  for (let value of seed) {
    for (let i = 3; i >= 0; i--) {
      hex.push(((value >> (i * 8)) & 0xff).toString(16).padStart(2, '0'));
    }
  }
  return hex.join('');
}
function parseSeed(hex) {
  const bytes = [],
    abcd = new Uint32Array(4);
  for (let i = 0; i < hex.length; i += 2) {
    bytes.push(parseInt(hex.substr(i, 2), 16));
  }
  for (let i = 0; i < 4; i++) {
    abcd[i] = (bytes[i * 4] << 24) | (bytes[i * 4 + 1] << 16) | (bytes[i * 4 + 2] << 8) | bytes[i * 4 + 3];
  }
  return abcd;
}
function sfc32([a, b, c, d], p) {
  return (s) => {
    if (s === null) [a, b, c, d] = $o[p];
    a |= 0;
    b |= 0;
    c |= 0;
    d |= 0;
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
}

$o.rnd = sfc32($o.seed, 'seed');
$o.rndGlobal = sfc32($o.seedGlobal, 'seedGlobal');

function registerFeatures(features) {
  if (typeof features === 'undefined') {
    return ($o.features = null);
  }
  if (typeof features !== 'object' || Array.isArray(features)) {
    throw new Error('registerFeatures expects an object');
  }
  return ($o.features = features);
}

function registerExport(args, fn) {
  const err = new Error(`Cannot register exporter for ${JSON.stringify(args)}`);
  if (typeof fn !== 'function') throw err;
  if (typeof args !== 'object' || Array.isArray(args)) throw err;
  if (typeof args.mime !== 'string') throw err;
  if (!args.resolution?.x || !args.resolution?.x) throw err;
  if ($o._exports[args.mime]) throw err;
  if (args.aspectRatio) {
    args.resolution.y = args.resolution.x * args.aspectRatio;
  }
  args = {
    mime: args.mime,
    aspectRatio: args.aspectRatio,
    resolution: args.resolution,
    default: !!args.default,
    thumb: !!args.thumb
  };

  $o._exports[args.mime] = {...args, fn};
  cast('register-export', args);
  return true;
}

function cast(msgId, payload) {
  [parent, window].forEach((target) => {
    try {
      target?.postMessage({...payload, id: `$o:${msgId}`}, '*');
    } catch (_) {}
  });
}

async function capture() {
  if ($o.isCapture && !$o._exported) {      
    $o._exported = {status: 'pending'};
    const exporter = Object.values($o._exports).find((o) => o.default === true);
    if (!exporter) throw new Error(`No default exporter found`);
    const exported = await exporter.fn({
      resolution: exporter.resolution,
      status: 'done'
    });
    const {resolution, aspectRatio, mime} = exporter;
    $o._exported = {mime, resolution, aspectRatio, exported};
    cast('captured', {...$o._exported});
  }
}

window.addEventListener('message', (e) => {
  if (e.data.id === '$o:export') {
    const exporter = $o._exports[e.data.mime];
    exporter?.fn(e.data).then((exported) => {
      cast('exported', {...e.data, exported});
    });
  }
});