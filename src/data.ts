import type { ClassItem, DustItem } from "./types.ts";
import { cleanName, normalize } from "./normalize.ts";

/** プロジェクトルート（このファイルは src/ にあるので1つ上） */
export const ROOT = `${import.meta.dir}/..`;

/** データファイル（categories.json / items.json / index.json）の置き場 */
export const DATA = `${ROOT}/data`;

/** categories.json を classId→className の Map として読み込む */
export async function loadClasses(): Promise<Map<number, string>> {
  const arr = (await Bun.file(`${DATA}/categories.json`).json()) as ClassItem[];
  return new Map(arr.map((c) => [c.classId, c.className]));
}

/** items.json を配列で読み込む */
export async function loadDustItems(): Promise<DustItem[]> {
  return (await Bun.file(`${DATA}/items.json`).json()) as DustItem[];
}

/** dustType→classId で分類名を引く（見つからなければ className → 不明 にフォールバック） */
export function resolveCategory(
  item: DustItem,
  classes: Map<number, string>,
): string {
  return classes.get(item.dustType) ?? item.className ?? "（分類不明）";
}

/** 1品目から、埋め込み用テキストと字句一致用トークンを生成する */
export function buildSearchableFields(item: DustItem, category: string) {
  const name = cleanName(item.dustName);

  const readings = [
    item.dustNameHira,
    item.dustNameKana,
    item.dustNameKanaHira,
    item.keyword,
    item.keywordHira,
  ].filter((s): s is string => !!s && s.length > 0);

  // 埋め込み用の自然文（分類・読みも含めることで意味検索を効かせる）
  const embedText = `品目: ${name} / よみ: ${readings.join("、") || "なし"} / 分類: ${category}`;

  // 字句一致用の正規化トークン（重複除去）
  const norm = Array.from(
    new Set(
      [name, item.dustName, ...readings]
        .map(normalize)
        .filter((s) => s.length > 0),
    ),
  );

  return { name, readings, embedText, norm };
}
