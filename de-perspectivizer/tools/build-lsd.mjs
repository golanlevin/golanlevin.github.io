import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const compiler = process.env.WASM_CC || [
  '/opt/local/libexec/llvm-14/bin/clang', '/opt/homebrew/opt/llvm/bin/clang',
  '/usr/local/opt/llvm/bin/clang', '/usr/bin/clang'
].find(existsSync) || 'clang';
const args = ['--target=wasm32', '-O3', '-nostdlib', '-fno-builtin',
  '-Itools/wasm-include', 'libraries/lsd/lsd.c', 'tools/lsd-runtime.c',
  '-Wl,--no-entry', '-Wl,--export=reserve_input',
  '-Wl,--export=detect', '-Wl,--export=result_pointer', '-Wl,--export=heap_used',
  '-Wl,--initial-memory=33554432', '-Wl,--max-memory=134217728',
  '-Wl,-z,stack-size=1048576', '-o', 'assets/lsd.wasm'];
const result = spawnSync(compiler, args, { cwd: root, stdio: 'inherit' });
if (result.error) console.error(result.error.message);
if (result.status !== 0) process.exit(result.status || 1);
console.log('Built assets/lsd.wasm using', compiler);
