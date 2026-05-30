# CLAUDE.md

東大阪市の粗大ごみ品目データから「何ごみか・料金・処理券枚数」を引く、**ローカル検索CLI**。
Bun + Vercel AI SDK + AI Gateway による埋め込み意味検索と日本語字句一致の**ハイブリッド検索**。

## コマンド

```bash
bun install                 # 依存導入（ai のみ）
cp .env.example .env        # .env に AI_GATEWAY_API_KEY を記入
bun run index               # 全248件を埋め込み data/index.json を生成（初回 & データ更新時のみ）
bun run search "<検索語>"    # 検索。既定はJSON出力（LLM利用前提）
```

- 検索オプション: `--k <件数>`（既定5） / `--pretty`（人間向け整形表示）。
- 型チェック: `bunx tsc --noEmit`。
- ビルド不要（Bunが直接TS実行）。テストフレームワークは未導入。

## データ（`data/categories.json` / `data/items.json`）

出典: **東大阪市大型ごみインターネット受付**（東大阪市公式。https://www.ogomi-higashiosaka.jp/eco/view/higashiosaka/top.html ）の品目情報。同サイトは大型ごみの収集申込み・品目検索を提供する公式サービスで、本CLIはその品目データをローカル検索用に取り込んだもの。

- `data/categories.json`（10件）= 分類マスタ。`classId`(1–10) → `className`。
- `data/items.json`（248件）= 品目。1件28フィールドだが**意味があるのは下記のみ**。

| フィールド | 用途 |
|---|---|
| `dustCode` | 主キー |
| `dustName` | 品目名。先頭に `可燃／不燃／特定］`、末尾に `(3m以下)` 等のノイズ |
| `dustNameHira` / `dustNameKana` / `dustNameKanaHira` | 読み仮名（日本語検索の要） |
| `keyword` / `keywordHira` | 追加検索語（28件のみ非空） |
| `dustType` | **分類キー = `categories.classId`**（結合に使う） |
| `tanka` | 単価（400 or 800円） |
| `ticketKind` / `ticketNumber` | 処理券の額面・枚数 |

**無視するフィールド**: `dustMemo` `html_memo` `mclassName` `point`(常に1) `count` `uncollct_flg` `can_recycle` `recycle_view` 等は全件0/空。

### 結合ルール（重要）

`items.dustType === categories.classId` で分類名を引く（`src/data.ts` の `resolveCategory`）。
実データの対応:
- `dustType=4` → 可燃］特定品目（91件）
- `dustType=5` → 不燃］電気製品・ガス機器（153件、実データで一致確認済）
- `dustType=6` → 不燃］家具（4件）

⚠️ `dustType=6` の4件は品目名が「特定］スプリング入りマットレス…」だが、結合先分類は「不燃］家具」。
元データの持ち方によるもの。分類を変えたい場合は結合ロジックではなくデータ側の意図を確認すること。

## アーキテクチャ

```
data/                categories.json / items.json / index.json（生成物）
src/
├── types.ts        型: DustItem / ClassItem / IndexedItem / IndexFile
├── normalize.ts    normalize()=NFKC・カナ→ひら・記号除去 / cleanName()=接頭辞・末尾括弧除去
├── data.ts         JSON読込 + 結合 + buildSearchableFields()（埋め込み文＋字句トークン生成）
├── embeddings.ts   AI SDK ラッパー。EMBED_MODEL / embedAll / embedOne / requireApiKey
├── build-index.ts  bun run index のエントリ
└── search.ts       bun run search のエントリ（ハイブリッド検索）
```

設計判断:
- **ベクトルDBは使わない。** 248件と小規模なので埋め込みを `data/index.json` にキャッシュし、メモリ上で cosine 総当たり。件数が数千超に増えたら SQLite/専用DBを検討。
- **埋め込みは索引時のみ。** 検索はクエリ1件を embed するだけ（`text-embedding-3-small`、コストほぼゼロ）。
- **ハイブリッドスコア**（`search.ts`）= `0.6 * cosine類似度 + 0.4 * 字句スコア`、完全一致は `+0.5` で最上位へ。`match` は `exact/prefix/partial/semantic`。

## AI SDK + AI Gateway の使い方（このリポジトリの規約）

- `import { embed, embedMany, cosineSimilarity } from "ai"` を使う。別プロバイダパッケージは入れない。
- モデルは文字列指定 `"openai/text-embedding-3-small"`。この `"provider/model"` 形式が **AI Gateway 経由**でルーティングされる。
- 認証は環境変数 `AI_GATEWAY_API_KEY` のみ（Bunが `.env` を自動読込）。コードにキーを書かない。
- 埋め込みモデルを変えたら **`bun run index` を再実行**して `data/index.json` を作り直すこと（次元・ベクトルが変わるため）。

## 生成物・git

- `data/index.json` は生成物（`bun run index` で再生成可能）。`.env` とともに `.gitignore` 済み。
- 既存の `data/categories.json` / `data/items.json` は**入力データなので編集しない**。
