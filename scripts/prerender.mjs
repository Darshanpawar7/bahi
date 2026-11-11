// Writes the server-rendered welcome screen into dist/index.html. Run after `vite build` and
// `vite build --ssr src/prerender.tsx --outDir dist-ssr` (see the build script in package.json).
import { readFile, rm, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const MARK = '<div id="root"></div>';
const { render } = await import(pathToFileURL(path.resolve('dist-ssr/prerender.js')).href);
const page = await readFile('dist/index.html', 'utf8');
if (!page.includes(MARK)) throw new Error('dist/index.html has no empty root to fill');
await writeFile('dist/index.html', page.replace(MARK, `<div id="root">${render()}</div>`));
await rm('dist-ssr', { recursive: true, force: true });
console.log('prerendered the welcome screen into dist/index.html');
