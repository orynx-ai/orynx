import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { findStyleViolations, inStyleScope } from './style.ts';

const TSX = 'packages/app/src/features/home/home-screen.tsx';
const CSS = 'apps/web/src/index.css';

function rules(path: string, content: string, snippet = false): string[] {
  return findStyleViolations(path, content, { snippet }).map((f) => f.rule);
}

describe('inStyleScope', () => {
  it('covers ui, app and web source but not the theme files or other packages', () => {
    assert.equal(inStyleScope('packages/ui/src/components/button.tsx'), true);
    assert.equal(inStyleScope('apps/web/src/main.tsx'), true);
    assert.equal(inStyleScope('packages/ui/src/styles/tokens.css'), false);
    assert.equal(inStyleScope('packages/ui/src/styles/theme.css'), false);
    assert.equal(inStyleScope('packages/core/src/create-server.ts'), false);
    assert.equal(inStyleScope('packages/ui/src/components/button.md'), false);
  });
});

describe('findStyleViolations — colours', () => {
  it('flags raw hex colours in class and style strings', () => {
    const found = findStyleViolations(TSX, `const a = <div style={{ color: "#fcfcfb" }} className="p-2" />;`);
    const [first] = found;
    assert.equal(found.length, 1);
    assert.ok(first);
    assert.equal(first.rule, 'raw-colour');
    assert.equal(first.line, 1);
    assert.match(first.fix, /docs\/design-map\.md/);
  });

  it('flags rgb(), hsl() and oklch() literals in strings', () => {
    assert.deepEqual(rules(TSX, `const a = "rgba(0,0,0,.5)"; const b = 'oklch(0.7 0.1 200)';`), [
      'colour-function',
      'colour-function',
    ]);
  });

  it('ignores anchors, issue numbers, entities and comments', () => {
    const src = [
      `<a href="#main">Skip</a>`,
      `const label = "PR #2836";`,
      `const ent = "&#123;";`,
      `// colour was #ff0000 before`,
      `/* #abcdef */`,
    ].join('\n');
    assert.deepEqual(rules(TSX, src), []);
  });

  it('does not treat JSX text or identifiers as strings in file mode', () => {
    assert.deepEqual(rules(TSX, `const shadow = 1;\nexport const A = () => <p>Rounded shadow</p>;`), []);
  });

  it('checks CSS declaration values but not id selectors', () => {
    const css = `#app { padding: 0; }\n.x { color: #fff; background: rgb(1 2 3); }`;
    assert.deepEqual(rules(CSS, css), ['raw-colour', 'colour-function']);
  });
});

describe('findStyleViolations — Tailwind classes', () => {
  it('flags arbitrary values in the final utility segment', () => {
    for (const cls of ['p-[13px]', 'hover:bg-[#fff]', 'w-[calc(100%-2px)]', "content-['']", '[mask-type:luminance]']) {
      const found = findStyleViolations(TSX, `const c = "${cls}";`);
      assert.ok(
        found.some((f) => f.rule === 'arbitrary-value'),
        `${cls} should be flagged, got ${JSON.stringify(found)}`,
      );
    }
  });

  it('allows arbitrary variants (a bracket group followed by a colon)', () => {
    for (const cls of [
      'data-[state=open]:bg-subtle',
      '[&_svg]:size-4',
      'aria-[current=page]:text-foreground',
      'has-[input:checked]:border-info',
      'group-data-[collapsed=true]:hidden',
      'supports-[display:grid]:grid',
    ]) {
      assert.deepEqual(rules(TSX, `const c = "${cls}";`), [], `${cls} should pass`);
    }
  });

  it('flags an arbitrary value even behind an arbitrary variant', () => {
    const found = findStyleViolations(TSX, `const c = "data-[state=open]:p-[3px]";`);
    assert.deepEqual(
      found.map((f) => f.message),
      [`arbitrary value "p-[3px]"`],
    );
  });

  it('flags the default palette, white and black', () => {
    assert.deepEqual(rules(TSX, `const c = "bg-gray-100 hover:text-zinc-500/50 border-t-red-200 text-white";`), [
      'default-palette',
      'default-palette',
      'default-palette',
      'default-palette',
    ]);
  });

  it("flags default type sizes but not DevHub's named sizes", () => {
    assert.deepEqual(rules(TSX, `const c = "text-sm md:text-lg text-small text-label text-title-lg text-body";`), [
      'default-type-size',
      'default-type-size',
    ]);
  });

  it('flags default shadows but allows shadow-overlay and shadow-none', () => {
    assert.deepEqual(rules(TSX, `const c = "shadow shadow-md shadow-overlay shadow-none";`), [
      'default-shadow',
      'default-shadow',
    ]);
  });

  it('flags bare and oversized radii, allows the DevHub radii and sides', () => {
    assert.deepEqual(
      rules(
        TSX,
        `const c = "rounded rounded-xl rounded-t rounded-sm rounded-md rounded-lg rounded-xs rounded-full rounded-t-md";`,
      ),
      ['default-radius', 'default-radius', 'default-radius'],
    );
  });

  it('flags the dark: variant but not an object key named dark', () => {
    assert.deepEqual(rules(TSX, `const c = "dark:bg-raised";`), ['dark-variant']);
    assert.deepEqual(rules(TSX, `const themes = { dark: "Dark", light: "Light" };`, true), []);
  });

  it('flags the shadcn names this theme leaves out, with variants', () => {
    const found = findStyleViolations(
      TSX,
      `const c = "hover:bg-accent text-accent-foreground bg-secondary focus-visible:ring-destructive";`,
    );
    assert.deepEqual(
      found.map((f) => f.rule),
      ['omitted-shadcn-name', 'omitted-shadcn-name', 'omitted-shadcn-name', 'omitted-shadcn-name'],
    );
    assert.match(found[0]?.fix ?? '', /bg-subtle/);
    assert.match(found[2]?.fix ?? '', /raised/);
    assert.match(found[3]?.fix ?? '', /danger/);
  });

  it("allows the theme's own colour names", () => {
    assert.deepEqual(
      rules(
        TSX,
        `const c = "bg-canvas bg-raised text-muted-foreground border-control bg-info-subtle text-info-foreground bg-primary text-primary-foreground text-danger accent-info";`,
      ),
      [],
    );
  });

  it('checks @apply lines in CSS only', () => {
    assert.deepEqual(rules(CSS, `.a { @apply text-sm p-[3px]; }\n.text-sm-note { margin: 0; }`), [
      'default-type-size',
      'arbitrary-value',
    ]);
  });
});

describe('findStyleViolations — snippets and ignores', () => {
  it('checks every non-comment character of an Edit fragment', () => {
    assert.deepEqual(rules(TSX, `bg-gray-100 p-4`, true), ['default-palette']);
  });

  it('skips bare shadow/rounded words in snippets', () => {
    assert.deepEqual(rules(TSX, `const shadow = rounded;`, true), []);
  });

  it('honours an ignore comment that gives a reason', () => {
    const src = `// style-policy-ignore-next-line: diff gutter matches the design's 44px column\nconst c = "grid-cols-[44px_18px_1fr]";`;
    assert.deepEqual(rules(TSX, src), []);
  });

  it('reports an ignore comment without a reason', () => {
    const src = `// style-policy-ignore-next-line\nconst c = "p-[3px]";`;
    assert.deepEqual(rules(TSX, src), ['arbitrary-value', 'ignore-without-reason']);
  });

  it('returns nothing for files outside the scope', () => {
    assert.deepEqual(rules('packages/core/src/x.ts', `const c = "bg-gray-100 #fff";`), []);
  });
});
