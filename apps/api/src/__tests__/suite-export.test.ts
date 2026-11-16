import vm from 'node:vm';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { casesToCsv, stepsToPlaywright, suiteToPlaywright } from '@qaforge/shared-types';

function compiles(code: string) {
  const js = ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  expect(js.diagnostics ?? []).toEqual([]);
  new vm.Script(js.outputText); // throws on a syntax error
}

const login = [
  { action: 'navigate', instruction: 'Open /login', value: '/login' },
  { action: 'fill', instruction: 'Type the password', selector: 'Password', value: '{{PASSWORD}}' },
  { action: 'click', instruction: 'Click "Sign in"', selector: 'Sign in' },
];
const cart = [{ action: 'assert_text', instruction: 'Total is right', selector: '#total', value: '$90.00, "net"' }];

describe('F11 suite export: Playwright file', () => {
  it('writes one test per case in one file that compiles, with the helper and header once', () => {
    const code = suiteToPlaywright(
      [
        { title: 'Login works', steps: login },
        { title: 'Cart total', steps: cart },
      ],
      'https://shop.example.com/',
    );
    compiles(code);
    expect(code.match(/^test\(/gm)).toHaveLength(2);
    expect(code).toContain('test("Login works", async ({ page }) => {');
    expect(code).toContain('test("Cart total", async ({ page }) => {');
    expect(code.match(/^async function find\(/gm)).toHaveLength(1);
    expect(code.match(/^import /gm)).toHaveLength(1);
    expect(code).toContain('const BASE_URL = "https://shop.example.com/"');
    expect(code).toContain('// PASSWORD'); // variables are read from the environment, never written
    expect(code).toContain("process.env.PASSWORD ?? ''");
  });

  it('numbers repeated titles, which Playwright would otherwise refuse', () => {
    const code = suiteToPlaywright([
      { title: 'Same', steps: cart },
      { title: 'Same', steps: cart },
      { title: 'Same', steps: cart },
    ]);
    compiles(code);
    expect(code).toContain('test("Same", ');
    expect(code).toContain('test("Same (2)", ');
    expect(code).toContain('test("Same (3)", ');
  });

  it('gives the same file as before for a single case', () => {
    expect(stepsToPlaywright(login, 'Login works', 'https://shop.example.com/')).toBe(
      suiteToPlaywright([{ title: 'Login works', steps: login }], 'https://shop.example.com/'),
    );
  });
});

describe('F11 suite export: CSV', () => {
  it('writes a header and one row per step, quoting commas, quotes and new lines', () => {
    const csv = casesToCsv([
      { title: 'Login works', priority: 'high', type: 'smoke', steps: login },
      { title: 'Cart, "total"', priority: 'medium', type: 'functional', steps: cart },
      { title: 'Multi\nline', steps: [] },
    ]);
    const lines = csv.split('\r\n');
    expect(lines[0]).toBe('Case,Priority,Type,Step,Action,Description,Element,Value');
    expect(lines[1]).toBe('Login works,high,smoke,1,navigate,Open /login,,/login');
    expect(lines[2]).toBe('Login works,high,smoke,2,fill,Type the password,Password,{{PASSWORD}}'); // the name, not a value
    expect(lines[3]).toBe('Login works,high,smoke,3,click,"Click ""Sign in""",Sign in,');
    expect(lines[4]).toBe('"Cart, ""total""",medium,functional,1,assert_text,Total is right,#total,"$90.00, ""net"""');
    expect(csv).toContain('"Multi\nline",,,,,,,\r\n'); // a case with no steps still gets a row
    expect(csv.endsWith('\r\n')).toBe(true);
  });

  it('stops a spreadsheet from running a cell as a formula', () => {
    const csv = casesToCsv([
      {
        title: '=HYPERLINK("http://evil.example","x")',
        steps: [{ action: 'fill', instruction: '+1', selector: '@field', value: '-2+3' }],
      },
    ]);
    const row = csv.split('\r\n')[1];
    expect(row).toBe(`"'=HYPERLINK(""http://evil.example"",""x"")",,,1,fill,'+1,'@field,'-2+3`);
  });
});
