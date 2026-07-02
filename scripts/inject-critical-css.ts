#!/usr/bin/env node
/**
 * Post-build script: inject the _slug_*.css link into all HTML files in dist/
 *
 * Astro 5 CSS code splitting extracts Layout.astro scoped styles to _slug_*.css bundles,
 * but these CSS files are never linked in the HTML. This script finds the _slug_ CSS file and
 * injects a <link> tag into every HTML file's <head>.
 */

import fs from 'node:fs';
import path from 'node:path';

const distDir = path.join(process.cwd(), 'dist');
const astroDir = path.join(distDir, '_astro');

function injectCss() {
  // Find the _slug_*.css file
  let slugCss: string | null = null;
  try {
    const files = fs.readdirSync(astroDir);
    slugCss = files.find(f => f.startsWith('_slug_') && f.endsWith('.css')) || null;
  } catch {
    console.log('inject-critical-css> No _astro directory found, skipping CSS injection');
    return;
  }

  if (!slugCss) {
    console.log('[inject-critical-css] No _slug_*.css found, skipping');
    return;
  }

  console.log(`[inject-critical-css] Found: ${slugCss}`);

  const cssLink = `<link rel="stylesheet" href="/_astro/${slugCss}">`;
  let injectedCount = 0;

  function walk(dir: string) {
    for (const entry of fs.readdirSync(dir)) {
      const fullPath = path.join(dir, entry);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        walk(fullPath);
      } else if (entry.endsWith('.html')) {
        let content = fs.readFileSync(fullPath, 'utf-8');
        if (!content.includes(`/_astro/${slugCss}`)) {
          content = content.replace('</head>', `${cssLink}</head>`);
          fs.writeFileSync(fullPath, content, 'utf-8');
          injectedCount++;
        }
      }
    }
  }

  walk(distDir);
  console.log(`[inject-critical-css] Injected into ${injectedCount} HTML files`);
}

injectCss();
