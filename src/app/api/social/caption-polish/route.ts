import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getValidDropboxToken } from "@/lib/dropbox";
import OpenAI from "openai";

export const maxDuration = 60;

const CONTENT_API = "https://content.dropboxapi.com/2";

/**
 * POST /api/social/caption-polish
 *
 * Two modes:
 *
 *   1) Polish text — body: { seed, name?, category?, mainStone?, language? }
 *      AI rewrites the user's raw "相關資訊" into IG voice. Preserves facts,
 *      tightens tone, adds line breaks + 5–8 hashtags.
 *
 *   2) Vision-generate — body: { imageDropbox?: { sharedUrl, path },
 *                                imageUrl?: string,    // any public URL
 *                                name?, category?, mainStone?, language? }
 *      Used when there's no seed text. We fetch the image bytes via Dropbox
 *      (if imageDropbox is provided) and ship them to GPT-4o vision, asking
 *      it to describe the jewelry and write a same-style IG caption.
 *
 * Mode 1 wins if both `seed` and an image are present.
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
    imageDropbox?: { sharedUrl: string; path: string };
    imageUrl?: string;
  };

  const seed = (body.seed || "").trim();
  const language = body.language === "en" ? "en" : "zh";
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  /* ─── Mode 1: text polish ───────────────────────────────────────── */
  if (seed) {
    const systemPrompt = buildPolishSystem(language);
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
      return NextResponse.json({ caption: parsed.caption, mode: "polish" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Caption polish failed";
      console.error("[caption-polish] polish error:", msg);
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  }

  /* ─── Mode 2: vision generate ──────────────────────────────────── */
  let imageData: { dataUrl: string } | null = null;
  if (body.imageDropbox?.sharedUrl && body.imageDropbox?.path) {
    const token = await getValidDropboxToken(session.userId);
    if (!token) {
      return NextResponse.json({ error: "DROPBOX_NOT_CONNECTED" }, { status: 401 });
    }
    try {
      const dbRes = await fetch(`${CONTENT_API}/sharing/get_shared_link_file`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Dropbox-API-Arg": JSON.stringify({
            url: body.imageDropbox.sharedUrl,
            path: body.imageDropbox.path,
          }),
        },
      });
      if (!dbRes.ok) {
        const text = await dbRes.text();
        console.error("[caption-polish] dropbox fetch failed:", dbRes.status, text);
        return NextResponse.json(
          { error: `Failed to fetch Dropbox image (${dbRes.status})` },
          { status: 502 }
        );
      }
      const bytes = Buffer.from(await dbRes.arrayBuffer());
      const ext = body.imageDropbox.path.split(".").pop()?.toLowerCase() || "jpg";
      const mime =
        ext === "png" ? "image/png"
        : ext === "webp" ? "image/webp"
        : ext === "gif" ? "image/gif"
        : "image/jpeg";
      imageData = { dataUrl: `data:${mime};base64,${bytes.toString("base64")}` };
    } catch (e) {
      console.error("[caption-polish] dropbox error:", e);
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "Dropbox fetch failed" },
        { status: 502 }
      );
    }
  } else if (body.imageUrl) {
    // Pass-through: OpenAI fetches directly. URL must be public.
    imageData = { dataUrl: body.imageUrl };
  } else {
    return NextResponse.json(
      { error: "Provide either seed text or imageDropbox/imageUrl." },
      { status: 400 }
    );
  }

  const systemPrompt = buildVisionSystem(language);
  const userText = `這件作品的脈絡：
Category: ${body.category || "-"}
Name: ${body.name || "-"}
Main stone: ${body.mainStone || "-"}

請看附圖描述這件珠寶並寫出 IG 文案。`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: [
            { type: "text", text: userText },
            { type: "image_url", image_url: { url: imageData.dataUrl, detail: "high" } },
          ],
        },
      ],
      temperature: 0.8,
      max_tokens: 700,
      response_format: { type: "json_object" },
    });
    const content = completion.choices[0]?.message?.content || "{}";
    const parsed = JSON.parse(content) as { caption?: string };
    if (!parsed.caption) {
      return NextResponse.json({ error: "Empty caption" }, { status: 502 });
    }
    return NextResponse.json({ caption: parsed.caption, mode: "vision" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Vision caption failed";
    console.error("[caption-polish] vision error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/* ─── Prompt builders ────────────────────────────────────────────── */

function buildPolishSystem(language: "zh" | "en"): string {
  if (language === "zh") {
    return `你是 Olivia Yao Jewellery 的 IG 文案編輯。把客戶提供的「相關資訊」原文潤飾成 Instagram 貼文。

規則：
- 保留原文所有事實（寶石、設計重點、客人故事）— 不要編造
- 語氣：高級珠寶品牌，溫暖但不過於甜膩，留有想像空間
- 結構：3-5 行短句，每句獨立一行，留白
- 結尾加 5-8 個中英混合 hashtag，相關珠寶 + 設計 + 客製
- 不要加 emoji 在正文（hashtag 前可加 ✨ 一個）
- 字數 80-150 字（不含 hashtag）

輸出 JSON：{"caption": "正文 + hashtag 字串"}`;
  }
  return `You are the Instagram editor for Olivia Yao Jewellery. Polish the customer's raw description into an Instagram-ready caption.

Rules:
- Preserve all facts (gemstone, design highlight, customer story) — do not invent
- Tone: high-end fine jewellery, warm but understated
- Structure: 3-5 short lines, each on its own line, generous whitespace
- End with 5-8 relevant hashtags mixing English + Chinese
- No emoji in body (one ✨ before hashtags is fine)
- 80-150 words excluding hashtags

Output JSON: {"caption": "body + hashtags string"}`;
}

function buildVisionSystem(language: "zh" | "en"): string {
  if (language === "zh") {
    return `你是 Olivia Yao Jewellery 的 IG 商業文案編輯。

任務：使用者**沒有**提供「相關資訊」文字，但會附上一張珠寶作品的成品照。
請仔細觀察照片中的珠寶（寶石顏色與切割、金屬色澤、設計線條、整體氛圍），
然後寫一則商業社群貼文，**風格要跟手寫過的「相關資訊」版本相同**：
有故事感、有設計觀點、不是規格說明。

規則：
- 描述你**真的看到**的東西（顏色、寶石形狀、金屬、線條、光澤、整體感覺）
- 不要編造客人故事、不要虛構名字 — 沒看到就不要寫
- 語氣：高級珠寶品牌，溫暖但不甜膩，留想像空間
- 結構：3-5 行短句，每句獨立一行，段落留白
- 結尾加 5-8 個中英混合 hashtag，珠寶 + 設計 + 客製類
- 不要在正文加 emoji（hashtag 前可加 ✨ 一個）
- 字數 80-150 字（不含 hashtag）

輸出 JSON：{"caption": "正文 + hashtag 字串"}`;
  }
  return `You are the commercial IG copy editor for Olivia Yao Jewellery.

The user has NOT supplied a written description but has attached a finished
product photo. Observe the piece carefully (gemstone colour + cut, metal tone,
design lines, overall mood), then write a commercial social caption that
matches the same style as our text-polished captions: storytelling, a design
point of view — not a spec sheet.

Rules:
- Describe what you actually see (colour, stone shape, metal, lines, light, mood)
- Don't invent customer stories or names — only what's visible
- Tone: high-end fine jewellery, warm, understated
- 3-5 short lines, each on its own line
- 5-8 hashtags mixing English + Chinese at the end
- No emoji in body (one ✨ before hashtags is fine)
- 80-150 words excluding hashtags

Output JSON: {"caption": "body + hashtags string"}`;
}
