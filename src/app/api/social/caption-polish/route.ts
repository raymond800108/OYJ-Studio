import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import OpenAI from "openai";

export const maxDuration = 30;

/**
 * POST /api/social/caption-polish
 * Body: { seed: string, name?: string, category?: string, mainStone?: string,
 *         language?: "zh" | "en" }
 *
 * Polishes a raw "相關資訊" cell from the user's jewelry sheet into an
 * Instagram-ready caption: keeps the story intact, tightens tone, adds
 * line breaks + 5–8 relevant Mandarin/English jewelry hashtags.
 *
 * Does NOT re-invent facts — if seed says "丹泉石", caption keeps 丹泉石.
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json()) as {
    seed?: string;
    name?: string;
    category?: string;
    mainStone?: string;
    language?: "zh" | "en";
  };
  const seed = (body.seed || "").trim();
  if (!seed) return NextResponse.json({ error: "seed required" }, { status: 400 });

  const language = body.language === "en" ? "en" : "zh";

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const systemPrompt =
    language === "zh"
      ? `你是 Olivia Yao Jewellery 的 IG 文案編輯。把客戶提供的「相關資訊」原文潤飾成 Instagram 貼文。

規則：
- 保留原文所有事實（寶石、設計重點、客人故事）— 不要編造
- 語氣：高級珠寶品牌，溫暖但不過於甜膩，留有想像空間
- 結構：3-5 行短句，每句獨立一行，留白
- 結尾加 5-8 個中英混合 hashtag，相關珠寶 + 設計 + 客製
- 不要加 emoji 在正文（hashtag 前可加 ✨ 一個）
- 不要用「親愛的」、「親故」等網購用語
- 字數 80-150 字（不含 hashtag）

輸出 JSON：{"caption": "正文 + hashtag 字串"}`
      : `You are the Instagram editor for Olivia Yao Jewellery. Polish the customer's raw description into an Instagram-ready caption.

Rules:
- Preserve all facts (gemstone, design highlight, customer story) — do not invent
- Tone: high-end fine jewellery, warm but understated
- Structure: 3-5 short lines, each on its own line, generous whitespace
- End with 5-8 relevant hashtags mixing English + Chinese
- No emoji in body (one ✨ before hashtags is fine)
- 80-150 words excluding hashtags

Output JSON: {"caption": "body + hashtags string"}`;

  const userPrompt = `Category: ${body.category || "-"}
Name: ${body.name || "-"}
Main stone: ${body.mainStone || "-"}

Raw 相關資訊:
${seed}`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.7,
      max_tokens: 600,
      response_format: { type: "json_object" },
    });
    const content = completion.choices[0]?.message?.content || "{}";
    const parsed = JSON.parse(content) as { caption?: string };
    if (!parsed.caption) {
      return NextResponse.json({ error: "Empty caption" }, { status: 502 });
    }
    return NextResponse.json({ caption: parsed.caption });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Caption polish failed";
    console.error("[caption-polish]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
