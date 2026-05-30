/**
 * 日本語の表記ゆれを吸収して比較用キーに変換するユーティリティ。
 * 字句一致（lexical match）の前処理に使う。
 */

/** カタカナ → ひらがな（長音符「ー」はそのまま残す） */
function kataToHira(s: string): string {
  return s.replace(/[ァ-ヶ]/g, (c) =>
    String.fromCharCode(c.charCodeAt(0) - 0x60),
  );
}

/**
 * 正規化キーを作る:
 *  1. NFKC（全角/半角・半角カナ・記号を統一）
 *  2. カタカナをひらがなへ
 *  3. 小文字化
 *  4. 空白・記号・括弧類を除去
 * 例: "アイロン台（3m以下）" → "あいろん台3m以下"
 */
export function normalize(input: string): string {
  if (!input) return "";
  let s = input.normalize("NFKC");
  s = kataToHira(s);
  s = s.toLowerCase();
  s = s.replace(
    /[\s　()（）[\]［］【】「」『』〔〕・,，.。、:：;；/／\\\-ー_＿'"`~!?！？]/g,
    "",
  );
  return s;
}

/** 先頭の分類接頭辞（可燃］/不燃］/特定］ など）にマッチ */
const PREFIX_RE = /^(?:可燃|不燃|特定|粗大|資源|有害|危険)[\]］]/;

/**
 * dustName から分類接頭辞と末尾の括弧注記を外した「素の品目名」を返す。
 * 例: "不燃］アイロン台(3m以下)" → "アイロン台"
 *     "特定］スプリング入りマットレス(ｼﾝｸﾞﾙ)" → "スプリング入りマットレス"
 */
export function cleanName(dustName: string): string {
  let s = dustName.replace(PREFIX_RE, "");
  // 末尾にある括弧注記（半角/全角）を1つだけ除去
  s = s.replace(/[（(][^（()）]*[)）]\s*$/, "");
  return s.trim();
}
