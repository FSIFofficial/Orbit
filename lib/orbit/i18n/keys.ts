// フラットな翻訳キー辞書の型。ja.ts が唯一のキー集合の源泉（Record<Key, string>
// を満たす他言語ファイルは、キーを1つでも書き漏らすとコンパイルエラーになる）。
export type TranslationDict = Record<string, string>
