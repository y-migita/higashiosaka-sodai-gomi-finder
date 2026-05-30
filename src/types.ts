/** categories.json の1件（分類マスタ） */
export interface ClassItem {
  classId: number;
  className: string;
}

/** items.json の1件（検索で使うフィールドのみ宣言。他フィールドは無視） */
export interface DustItem {
  dustCode: number;
  dustName: string;
  dustNameHira: string;
  dustNameKana: string;
  dustNameKanaHira: string;
  dustType: number;
  tanka: number;
  ticketKind: number[];
  ticketNumber: number[];
  keyword: string;
  keywordHira: string;
  className: string | null;
}

/** index.json に保存する1件（埋め込みベクトル付き） */
export interface IndexedItem {
  dustCode: number;
  dustName: string; // 元の品目名（接頭辞・括弧注記つき）
  name: string; // 表示用のクリーン名
  category: string; // dustType→classId で引いた分類名
  priceYen: number; // tanka（合計額）
  ticketYen: number; // 処理券1枚の額面（ticketKind[0]）
  tickets: number; // 必要枚数（ticketNumber[0]）
  readings: string[]; // 読み仮名・キーワード（正規化前）
  norm: string[]; // 正規化済みトークン（字句一致用）
  embedding: number[];
}

/** index.json 全体 */
export interface IndexFile {
  model: string;
  sourceHash: string;
  builtAt: string;
  items: IndexedItem[];
}
