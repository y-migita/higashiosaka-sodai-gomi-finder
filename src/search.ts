/**
 * `bun run search "<検索語>" [--k 5] [--pretty]`
 * ハイブリッド検索:
 *   - 意味スコア: クエリの埋め込み × 各品目の埋め込み（cosine類似度）
 *   - 字句スコア: 正規化・読み仮名による一致/包含
 * 既定では標準出力にJSONを返す（LLMからの利用を想定）。--pretty で人間向け表示。
 */
import { cosineSimilarity, embedOne, requireApiKey } from "./embeddings.ts";
import { normalize } from "./normalize.ts";
import { DATA } from "./data.ts";
import type { IndexedItem, IndexFile } from "./types.ts";

const INDEX = `${DATA}/index.json`;

interface Args {
  query: string;
  k: number;
  pretty: boolean;
}

function parseArgs(argv: string[]): Args {
  const rest = argv.slice(2);
  let k = 5;
  let pretty = false;
  const terms: string[] = [];
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i]!;
    if (a === "--pretty" || a === "-p") pretty = true;
    else if (a === "--k" || a === "-k") k = Number(rest[++i]) || 5;
    else if (a.startsWith("--k=")) k = Number(a.slice(4)) || 5;
    else terms.push(a);
  }
  return { query: terms.join(" ").trim(), k, pretty };
}

type LexKind = "exact" | "prefix" | "partial" | "none";

/** 字句スコア(0..1)とマッチ種別を返す */
function lexicalScore(
  qNorm: string,
  item: IndexedItem,
): { score: number; kind: LexKind } {
  if (!qNorm) return { score: 0, kind: "none" };
  let best = 0;
  let kind: LexKind = "none";
  for (const t of item.norm) {
    if (!t) continue;
    if (t === qNorm) return { score: 1, kind: "exact" };
    if (t.startsWith(qNorm) || qNorm.startsWith(t)) {
      if (best < 0.8) (best = 0.8), (kind = "prefix");
    } else if (t.includes(qNorm) || qNorm.includes(t)) {
      if (best < 0.6) (best = 0.6), (kind = "partial");
    }
  }
  return { score: best, kind };
}

async function main() {
  const { query, k, pretty } = parseArgs(Bun.argv);

  if (!query) {
    console.error('使い方: bun run search "<検索語>" [--k 5] [--pretty]');
    process.exit(1);
  }

  const file = Bun.file(INDEX);
  if (!(await file.exists())) {
    console.error(
      "✖ index.json がありません。先に `bun run index` を実行してください。",
    );
    process.exit(1);
  }
  requireApiKey();

  const index = (await file.json()) as IndexFile;
  const qNorm = normalize(query);
  const qVec = await embedOne(query);

  const scored = index.items.map((item) => {
    const sem = cosineSimilarity(qVec, item.embedding); // 概ね 0..1
    const lex = lexicalScore(qNorm, item);
    let score = 0.6 * sem + 0.4 * lex.score;
    if (lex.kind === "exact") score += 0.5; // 完全一致は最上位へ
    return { item, sem, lex, score };
  });

  scored.sort((a, b) => b.score - a.score);

  const results = scored.slice(0, k).map((r) => ({
    dustCode: r.item.dustCode,
    name: r.item.name,
    fullName: r.item.dustName,
    category: r.item.category,
    priceYen: r.item.priceYen,
    ticket: `${r.item.ticketYen}円 × ${r.item.tickets}枚`,
    tickets: r.item.tickets,
    score: Number(r.score.toFixed(3)),
    semantic: Number(r.sem.toFixed(3)),
    match: r.lex.kind === "none" ? "semantic" : r.lex.kind,
  }));

  if (pretty) {
    console.log(`\n🔎 「${query}」の検索結果（上位${results.length}件）\n`);
    results.forEach((r, i) => {
      console.log(`${i + 1}. ${r.name}  ［${r.category}］`);
      console.log(
        `   ${r.priceYen}円（処理券 ${r.ticket}） / dustCode=${r.dustCode} / score=${r.score}（${r.match}）`,
      );
    });
    console.log("");
  } else {
    console.log(JSON.stringify({ query, count: results.length, results }, null, 2));
  }
}

main().catch((e) => {
  console.error("✖ 検索に失敗:", e?.message ?? e);
  process.exit(1);
});
