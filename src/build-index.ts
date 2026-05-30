/**
 * `bun run index`
 * items.json の全品目を埋め込み、index.json にキャッシュする。
 * 検索（search.ts）はこの index.json を読むだけで、毎回の埋め込みはクエリ1件で済む。
 */
import {
  buildSearchableFields,
  DATA,
  loadClasses,
  loadDustItems,
  resolveCategory,
} from "./data.ts";
import { EMBED_MODEL, embedAll, requireApiKey } from "./embeddings.ts";
import type { IndexedItem, IndexFile } from "./types.ts";

const OUT = `${DATA}/index.json`;

async function main() {
  // 1. データ読み込み（APIキー不要なので先に実行し、結合を検証できるようにする）
  const [classes, items] = await Promise.all([loadClasses(), loadDustItems()]);
  console.error(`items ${items.length}件 / categories ${classes.size}件 を読み込みました。`);

  // dustType → 分類 の対応を検証ログとして出す
  const typeMap = new Map<number, { category: string; count: number }>();
  for (const it of items) {
    const e = typeMap.get(it.dustType) ?? {
      category: resolveCategory(it, classes),
      count: 0,
    };
    e.count++;
    typeMap.set(it.dustType, e);
  }
  console.error("dustType → 分類 の対応:");
  for (const [t, e] of [...typeMap].sort((a, b) => a[0] - b[0])) {
    console.error(`  dustType=${t} → ${e.category}  (${e.count}件)`);
  }

  // 2. APIキー確認
  requireApiKey();

  // 3. 埋め込みテキスト生成
  const prepared = items.map((it) => {
    const category = resolveCategory(it, classes);
    return { it, category, ...buildSearchableFields(it, category) };
  });

  console.error(`埋め込みを生成中… (model=${EMBED_MODEL}, ${prepared.length}件)`);
  const embeddings = await embedAll(prepared.map((p) => p.embedText));

  // 4. index 化
  const indexed: IndexedItem[] = prepared.map((p, i) => ({
    dustCode: p.it.dustCode,
    dustName: p.it.dustName,
    name: p.name,
    category: p.category,
    priceYen: p.it.tanka,
    ticketYen: p.it.ticketKind?.[0] ?? p.it.tanka,
    tickets: p.it.ticketNumber?.[0] ?? 1,
    readings: p.readings,
    norm: p.norm,
    embedding: embeddings[i]!,
  }));

  const out: IndexFile = {
    model: EMBED_MODEL,
    sourceHash: String(Bun.hash(JSON.stringify(items))),
    builtAt: new Date().toISOString(),
    items: indexed,
  };

  await Bun.write(OUT, JSON.stringify(out));
  const mb = (Bun.file(OUT).size / 1024 / 1024).toFixed(1);
  console.error(`✔ index.json を生成しました（${indexed.length}件 / ${mb}MB）`);
}

main().catch((e) => {
  console.error("✖ index 生成に失敗:", e?.message ?? e);
  process.exit(1);
});
