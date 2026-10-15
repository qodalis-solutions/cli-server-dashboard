// Copies the CLI's optional WebAssembly module next to the app so the embedded
// terminal finds it at ./assets/wasm/ (relative to /qcli/admin/) instead of 404ing.
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

const source = join('node_modules', '@qodalis', 'cli', 'wasm', 'qodalis_cli_wasm_bg.wasm');
const target = join('public', 'assets', 'wasm', 'qodalis_cli_wasm_bg.wasm');

if (!existsSync(source)) {
  console.warn(`[copy-wasm] ${source} not found; the terminal falls back to JavaScript`);
} else {
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(source, target);
  console.log(`[copy-wasm] ${target}`);
}
