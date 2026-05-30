# 東大阪市 粗大ごみ品目 ローカルRAG検索

品目名から「何ごみか・料金・処理券枚数」を引くローカル検索CLI。
**Bun + Vercel AI SDK + AI Gateway** で、埋め込みによる意味検索と日本語の字句一致を組み合わせた**ハイブリッド検索**。

## データ

データファイルは `data/` 配下にまとめています。

| ファイル | 件数 | 内容 |
|---|---|---|
| `data/categories.json` | 10 | 分類マスタ（`classId` → `className`） |
| `data/items.json` | 248 | 品目データ。品目名・読み仮名・`dustType`(=classId)・単価・処理券枚数 |

結合キーは `items.dustType === categories.classId`。

## セットアップ

```bash
bun install
cp .env.example .env        # .env に AI_GATEWAY_API_KEY を記入
```

`AI_GATEWAY_API_KEY` は [Vercel ダッシュボード → AI Gateway](https://vercel.com/dashboard) で発行。

## 使い方

```bash
# 1. 索引づくり（初回 & データ更新時のみ。全248件を埋め込んで data/index.json に保存）
bun run index

# 2. 検索（既定はJSON出力。LLMからの利用を想定）
bun run search "アイロン台"
bun run search "ふとん" --k 3
bun run search "そふぁ" --pretty     # 人間向け整形表示
```

### 出力例（JSON）

```json
{
  "query": "アイロン台",
  "count": 5,
  "results": [
    {
      "dustCode": 631,
      "name": "アイロン台",
      "fullName": "不燃］アイロン台(3m以下)",
      "category": "不燃］電気製品・ガス機器",
      "priceYen": 400,
      "ticket": "400円 × 1枚",
      "tickets": 1,
      "score": 0.93,
      "semantic": 0.71,
      "match": "exact"
    }
  ]
}
```

## 仕組み

- `bun run index` … 各品目を「品目 / よみ / 分類」の自然文にして `embedMany` で一括埋め込み → `data/index.json` にキャッシュ。
- `bun run search` … クエリ1件だけ埋め込み、`data/index.json` の全ベクトルと cosine 類似度を総当たり（248件なのでベクトルDB不要）。
  さらに正規化・読み仮名による字句スコアを加重合成し、完全一致を最上位へ。

## LLM（Claude Code 等）からの利用

標準出力がそのままJSONなので、`bun run search "<語>"` の出力をパースして使えます。

```
bun run search "電子レンジ" --k 3
```

## ファイル構成

```
data/                categories.json / items.json / index.json（生成物）
src/
├── types.ts        型定義
├── normalize.ts    日本語正規化（NFKC・カナ→ひら・記号除去・接頭/接尾除去）
├── data.ts         JSON読込 + categories join + 検索テキスト生成
├── embeddings.ts   AI SDK の embed/embedMany ラッパー（AI Gateway経由）
├── build-index.ts  `bun run index`
└── search.ts       `bun run search`
```
