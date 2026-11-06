import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createLSD} from '../src/lsd.js';

test('the publication includes a valid WASM binary, its source, and build inputs',async()=>{
  const wasm=await readFile(new URL('../assets/lsd.wasm',import.meta.url));
  assert.ok(WebAssembly.validate(wasm));
  for(const file of ['libraries/lsd/lsd.c','libraries/lsd/lsd.h','libraries/lsd/COPYING',
    'tools/lsd-runtime.c','tools/build-lsd.mjs','tools/wasm-include/math.h',
    'tools/wasm-include/stdio.h','tools/wasm-include/stdlib.h']){
    assert.ok((await readFile(new URL('../'+file,import.meta.url))).length>0,file);
  }
});

test('the publication loader fetches its bundled binary and identifies a failed URL',async t=>{
  const expected=new URL('../assets/lsd.wasm',import.meta.url),fetchBefore=globalThis.fetch;
  t.after(()=>{globalThis.fetch=fetchBefore;});
  globalThis.fetch=async url=>{
    assert.equal(url.href,expected.href);
    return new Response(await readFile(url));
  };
  const detector=await createLSD();
  assert.equal(detector.detect(new Uint8Array(64*64),64,64).segments.length,0);
  globalThis.fetch=async()=>new Response('Not found',{status:404});
  await assert.rejects(createLSD(),error=>error.message.includes('404')&&error.message.includes(expected.href));
  assert.equal(new URL('../assets/lsd.wasm','https://golanlevin.github.io/de-perspectivizer/src/lsd.js').href,
    'https://golanlevin.github.io/de-perspectivizer/assets/lsd.wasm');
});
