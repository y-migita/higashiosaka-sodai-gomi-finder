/**
 * `bun run fetch`
 * 東大阪市「大型ごみインターネット受付」の品目検索ページが内部で叩く Teeda Ajax を
 * 再現し、分類(categories)と全品目(items)を取得して data/*.json を更新する。
 *
 * 取得経路（公開サイトの dustlistSearch.js / kumu/ajax.js をリバースして判明）:
 *   1. dustlistSearch.html を GET → JSESSIONID Cookie を得る（Teeda はセッションに紐づく）
 *   2. teeda.ajax に form-urlencoded で POST（callback名 `dustPage_ajaxXxx` →
 *      component=dustPage / action=ajaxXxx に分解される Teeda の規約）
 *        - 分類:   component=dustPage&action=ajaxGetClassList&AjaxParam0=false
 *        - 全品目: component=dustPage&action=ajaxGetDustAllList&AjaxParam0=0&AjaxParam1=&AjaxParam2=false
 *
 * 出力は既存ファイルのフォーマットに合わせる（categories=コンパクト / items=4スペース整形・
 * 末尾改行なし）。サイト側が無変更なら再取得しても git 差分は出ない。
 * データ更新後は `bun run index` で埋め込み(index.json)を作り直すこと。
 */
import { DATA } from "./data.ts";
import { err as c } from "./term.ts";
import type { ClassItem, DustItem } from "./types.ts";

const BASE = "https://www.ogomi-higashiosaka.jp/eco/view/higashiosaka";
const PAGE = `${BASE}/dustlistSearch.html`;
const AJAX = `${BASE}/teeda.ajax`;
const UA = "higashiosaka-gomi-finder/1.0 (data fetcher)";
// dustlistSearch.html の #carryFlag（収集モード=false / 持込モード=true）。CLIは収集前提。
const CARRY = "false";

/** 品目検索ページを開いて JSESSIONID を得る */
async function openSession(): Promise<string> {
  const res = await fetch(PAGE, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`ページ取得に失敗: HTTP ${res.status}`);
  await res.text(); // ボディは捨てて接続を解放
  const setCookies =
    res.headers.getSetCookie?.() ?? [res.headers.get("set-cookie") ?? ""];
  const jsid = setCookies.join("; ").match(/JSESSIONID=[^;]+/)?.[0];
  if (!jsid) throw new Error("JSESSIONID を取得できませんでした");
  return jsid;
}

/** teeda.ajax に POST して JSON 配列を得る */
async function teedaAjax<T>(
  cookie: string,
  action: string,
  ajaxParams: (string | number)[],
): Promise<T> {
  const body = new URLSearchParams({ component: "dustPage", action });
  ajaxParams.forEach((v, i) => body.set(`AjaxParam${i}`, String(v)));
  body.set("time", "0"); // ブラウザはキャッシュバスタを送る（サーバは無視）

  const res = await fetch(AJAX, {
    method: "POST",
    headers: {
      "User-Agent": UA,
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: cookie,
    },
    body: body.toString(),
  });
  if (!res.ok) throw new Error(`teeda.ajax(${action}) 失敗: HTTP ${res.status}`);
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`${action} の応答がJSONではありません（先頭: ${text.slice(0, 60)}…）`);
  }
}

async function main() {
  console.error(c.cyan(`東大阪市 大型ごみ受付から取得中… (${BASE})`));

  const cookie = await openSession();
  console.error(c.gray(`  セッション確立 (${cookie.split("=")[0]})`));

  const categories = await teedaAjax<ClassItem[]>(cookie, "ajaxGetClassList", [
    CARRY,
  ]);
  console.error(c.gray(`  分類 ${categories.length}件`));

  const items = await teedaAjax<DustItem[]>(cookie, "ajaxGetDustAllList", [
    0, // classId=0 → 全品目
    "", // 頭文字フィルタなし
    CARRY,
  ]);
  console.error(c.gray(`  品目 ${items.length}件`));

  if (categories.length === 0 || items.length === 0) {
    throw new Error("取得件数が0件。サイト仕様変更の可能性があります。");
  }

  // 既存フォーマットに合わせて書き出し（無駄な差分を出さない）
  await Bun.write(`${DATA}/categories.json`, JSON.stringify(categories));
  await Bun.write(`${DATA}/items.json`, JSON.stringify(items, null, 4));

  console.error(
    c.green(
      `✔ data/categories.json (${categories.length}件) / data/items.json (${items.length}件) を更新しました`,
    ),
  );
  console.error(
    c.gray("  ※ 埋め込みを作り直すには `bun run index` を実行してください。"),
  );
}

main().catch((e) => {
  console.error(c.red(`✖ 取得に失敗: ${e?.message ?? e}`));
  process.exit(1);
});
