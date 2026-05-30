/**
 * ターミナル表示ユーティリティ（依存ゼロ）。
 * - ANSIカラー: NO_COLOR / FORCE_COLOR と TTY を見て自動で有効/無効を判定。
 *   パイプ・リダイレクト時（非TTY）は自動で色を落とすので、出力は汚れない。
 * - table(): 全角（日本語・絵文字）幅を考慮した罫線テーブル。
 *
 * これらは「人間向け」表示専用。stdout に出すJSON（LLM向け）には使わない。
 * ログは stderr、--pretty 表示は stdout なので、ストリーム別に色判定する。
 */

const CODES = {
  reset: 0,
  bold: 1,
  dim: 2,
  red: 31,
  green: 32,
  yellow: 33,
  blue: 34,
  magenta: 35,
  cyan: 36,
  gray: 90,
} as const;
type ColorName = keyof typeof CODES;

/** NO_COLOR / FORCE_COLOR による明示指定。未指定なら undefined（TTY判定に委ねる）。 */
function envOverride(): boolean | undefined {
  if (process.env.NO_COLOR) return false;
  const fc = process.env.FORCE_COLOR;
  if (fc !== undefined) return fc !== "0" && fc !== "" && fc !== "false";
  return undefined;
}

export type Colorizer = Record<ColorName, (s: string) => string> & {
  enabled: boolean;
};

function makeColorizer(stream: { isTTY?: boolean }): Colorizer {
  const enabled = envOverride() ?? Boolean(stream.isTTY);
  const c = { enabled } as Colorizer;
  for (const name of Object.keys(CODES) as ColorName[]) {
    const code = CODES[name];
    c[name] = (s: string) => (enabled ? `\x1b[${code}m${s}\x1b[0m` : s);
  }
  return c;
}

/** stderr 用（進捗・エラーログ） / stdout 用（--pretty 表示） */
export const err = makeColorizer(process.stderr);
export const out = makeColorizer(process.stdout);

// --- 全角対応のテーブル組み ---------------------------------------------

const ANSI_RE = /\x1b\[[0-9;]*m/g;

/** ざっくり East Asian Wide / Fullwidth / 絵文字なら 2、それ以外 1。 */
function charWidth(cp: number): 1 | 2 {
  if (
    (cp >= 0x1100 && cp <= 0x115f) || // Hangul Jamo
    cp === 0x2329 ||
    cp === 0x232a ||
    (cp >= 0x2e80 && cp <= 0x303e) || // CJK部首・康熙部首・記号
    (cp >= 0x3041 && cp <= 0x33ff) || // ひらがな・カタカナ・CJK記号
    (cp >= 0x3400 && cp <= 0x4dbf) || // CJK拡張A
    (cp >= 0x4e00 && cp <= 0x9fff) || // CJK統合漢字
    (cp >= 0xa000 && cp <= 0xa4cf) ||
    (cp >= 0xac00 && cp <= 0xd7a3) || // ハングル音節
    (cp >= 0xf900 && cp <= 0xfaff) || // CJK互換漢字
    (cp >= 0xfe30 && cp <= 0xfe4f) || // CJK互換形
    (cp >= 0xff00 && cp <= 0xff60) || // 全角英数・記号
    (cp >= 0xffe0 && cp <= 0xffe6) ||
    (cp >= 0x1f300 && cp <= 0x1faff) || // 絵文字
    (cp >= 0x20000 && cp <= 0x3fffd) // CJK拡張B以降
  ) {
    return 2;
  }
  return 1;
}

/** ANSIを除いた表示上の文字幅。 */
function strWidth(s: string): number {
  let w = 0;
  for (const ch of s.replace(ANSI_RE, "")) w += charWidth(ch.codePointAt(0)!);
  return w;
}

function pad(s: string, width: number, align: "left" | "right"): string {
  const fill = " ".repeat(Math.max(0, width - strWidth(s)));
  return align === "right" ? fill + s : s + fill;
}

/**
 * 罫線テーブルを文字列で返す。セルには色付き文字列を渡してよい（幅はANSIを除いて計測）。
 * align 未指定の列は左寄せ。
 */
export function table(
  head: string[],
  rows: string[][],
  align: ("left" | "right")[] = [],
): string {
  const c = out;
  const cols = head.length;
  const widths = Array.from({ length: cols }, (_, i) => {
    let w = strWidth(head[i] ?? "");
    for (const row of rows) w = Math.max(w, strWidth(row[i] ?? ""));
    return w;
  });

  // 罫線・見出しは「明示的な前景色」で出す。bold/dim 単独だと、stderr を赤くする
  // ような端末では地の色（=赤）を引き継いでしまうため。
  const rule = (l: string, m: string, r: string) =>
    c.gray(l + widths.map((w) => "─".repeat(w + 2)).join(m) + r);
  const bar = c.gray("│");
  const row = (cells: string[]) =>
    bar +
    cells
      .map((cell, i) => " " + pad(cell ?? "", widths[i]!, align[i] ?? "left") + " ")
      .join(bar) +
    bar;

  return [
    rule("┌", "┬", "┐"),
    row(head.map((h) => c.bold(c.cyan(h)))),
    rule("├", "┼", "┤"),
    ...rows.map(row),
    rule("└", "┴", "┘"),
  ].join("\n");
}
