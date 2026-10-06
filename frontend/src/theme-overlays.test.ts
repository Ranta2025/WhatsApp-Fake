import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

// Guard: white-based utilities only work on a dark background. Use the semantic
// tokens (`fg`, `fg-muted`, `on-accent`, `overlay*`, `border-subtle`, `scrim`) so
// every theme stays legible. Opt a single line out with a trailing `// theme-ok`
// (or `{/* theme-ok */}`) when the white sits on media or an accent surface.
const SRC_DIR = __dirname;

const WHITE_UTILITY =
  /(?:^|[\s"'`:])(?:[a-z-]+:)*!?(?:bg|text|border|ring|divide|from|to|via|outline|placeholder|fill|stroke)-white(?:\/[\w.[\]]+)?(?=[\s"'`])/;

// Migration is complete: no file is exempt. Keep the constant for future temporary exemptions.
const ALLOWLIST: readonly string[] = [];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return walk(full);
    return full.endsWith('.tsx') && !full.endsWith('.test.tsx') ? [full] : [];
  });
}

function offendingLines(file: string): string[] {
  return readFileSync(file, 'utf8')
    .split('\n')
    .map((line, i) => ({ line, n: i + 1 }))
    .filter(({ line }) => !line.includes('theme-ok') && WHITE_UTILITY.test(line))
    .map(({ line, n }) => `${n}: ${line.trim().slice(0, 120)}`);
}

describe('theme overlays', () => {
  const files = walk(SRC_DIR).map((f) => relative(SRC_DIR, f).split(sep).join('/'));

  it('allowlist only names files that exist and still need migration', () => {
    for (const entry of ALLOWLIST) {
      expect(files, `${entry} is on the allowlist but missing`).toContain(entry);
      expect(
        offendingLines(join(SRC_DIR, entry)).length,
        `${entry} is clean: remove it from the allowlist`,
      ).toBeGreaterThan(0);
    }
  });

  // `// theme-ok` after a JSX element that starts the line is JSX text, not a comment:
  // it renders literally. Use `{/* theme-ok */}` there instead.
  it('no line-comment markers in JSX children position', () => {
    const offenders = walk(SRC_DIR).flatMap((file) =>
      readFileSync(file, 'utf8')
        .split('\n')
        .map((line, i) => ({ line, n: i + 1 }))
        .filter(({ line }) => /^\s*<[^>]*>\s*\/\/\s*theme-ok/.test(line) || /^\s*<.*\/>\s*\/\/\s*theme-ok/.test(line))
        .map(({ n }) => `${relative(SRC_DIR, file)}:${n}`),
    );
    expect(offenders).toEqual([]);
  });

  it('no white-based utilities outside the allowlist', () => {
    const violations = files
      .filter((f) => !ALLOWLIST.includes(f))
      .flatMap((f) => offendingLines(join(SRC_DIR, f)).map((l) => `${f}:${l}`));
    expect(violations).toEqual([]);
  });
});
