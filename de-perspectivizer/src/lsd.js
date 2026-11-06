export async function createLSD(bytes) {
  let exports;
  const imports = { math: Math, host: { fail(pointer) {
    if (!exports || !pointer) throw new Error('LSD failed');
    const view = new Uint8Array(exports.memory.buffer);
    let end = pointer;
    while (end < view.length && view[end]) end++;
    throw new Error(new TextDecoder().decode(view.subarray(pointer, end)));
  } } };
  if (!bytes) {
    const wasmURL = new URL('../assets/lsd.wasm', import.meta.url);
    const response = await fetch(wasmURL);
    if (!response.ok) throw new Error(`Could not load LSD (${response.status}): ${wasmURL.href}`);
    bytes = await response.arrayBuffer();
  }
  const instance = await WebAssembly.instantiate(bytes, imports);
  exports = instance.instance.exports;
  return {
    detect(gray, width, height) {
      if (gray.length !== width * height) throw new Error('Invalid grayscale frame');
      const pointer = exports.reserve_input(width, height);
      const input = new Float64Array(exports.memory.buffer, pointer, width * height);
      input.set(gray);
      const count = exports.detect(width, height);
      const output = new Float64Array(exports.memory.buffer, exports.result_pointer(), count * 7);
      return { segments: Float64Array.from(output), heapBytes: exports.heap_used() };
    }
  };
}
