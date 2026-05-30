import { cosineSimilarity, embed, embedMany } from "ai";
import { err as c } from "./term.ts";

/**
 * 埋め込みモデル。"プロバイダ/モデル名" の文字列を渡すと
 * Vercel AI Gateway 経由でルーティングされる（認証は環境変数 AI_GATEWAY_API_KEY）。
 */
export const EMBED_MODEL = "openai/text-embedding-3-small";

/** 複数テキストをまとめて埋め込む（index構築用） */
export async function embedAll(values: string[]): Promise<number[][]> {
  const { embeddings } = await embedMany({ model: EMBED_MODEL, values });
  return embeddings;
}

/** 単一テキストを埋め込む（検索クエリ用） */
export async function embedOne(value: string): Promise<number[]> {
  const { embedding } = await embed({ model: EMBED_MODEL, value });
  return embedding;
}

export { cosineSimilarity };

/** AI_GATEWAY_API_KEY が無ければ案内して終了する */
export function requireApiKey(): void {
  if (!process.env.AI_GATEWAY_API_KEY) {
    console.error(c.red("✖ 環境変数 AI_GATEWAY_API_KEY が未設定です。"));
    console.error(
      c.gray(
        "  .env に AI_GATEWAY_API_KEY=... を記入してください（Vercel AI Gateway の APIキー）。",
      ),
    );
    process.exit(1);
  }
}
