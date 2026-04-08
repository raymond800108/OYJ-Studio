import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { requireAuth } from "@/lib/withAuth";

export async function POST(req: NextRequest) {
  const authResult = await requireAuth("estimate");
  if (authResult.error) return authResult.error;

  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY environment variable is not set" },
        { status: 500 }
      );
    }

    const openai = new OpenAI({ apiKey });

    const { image_url } = await req.json();
    if (!image_url) {
      return NextResponse.json(
        { error: "image_url is required" },
        { status: 400 }
      );
    }

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You are a manufacturing cost analyst specializing in Taiwan's production ecosystem. You always respond with valid JSON only, no other text.

Analyze the product shown in the image and return this exact JSON structure:
{
  "product_name": "brief product name",
  "materials": ["material 1", "material 2"],
  "material_analysis": "1-2 sentence analysis of materials and manufacturing process",
  "unit_cost_twd": { "low": <number>, "high": <number> },
  "unit_cost_usd": { "low": <number>, "high": <number> },
  "batch_note": "1 sentence about how batch size affects cost",
  "confidence": "low" | "medium" | "high"
}

Rules:
- Estimate PRODUCTION cost only (materials + labor + manufacturing). No marketing, logistics, retail margin, or business overhead.
- Prices in TWD (New Taiwan Dollar) and USD equivalent.
- Base estimate on Taiwan factory pricing (OEM/ODM rates).
- Consider: injection molding, CNC, textile, electronics assembly, packaging as applicable.
- Be realistic — use your knowledge of Taiwan manufacturing rates.
- If you cannot identify the product clearly, still provide your best estimate with "low" confidence.`,
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Analyze this product image. Identify the materials and estimate production cost in Taiwan. Respond with JSON only.",
            },
            {
              type: "image_url",
              image_url: { url: image_url, detail: "low" },
            },
          ],
        },
      ],
      max_tokens: 500,
      temperature: 0.3,
    });

    const content = response.choices[0]?.message?.content ?? "";

    // Parse JSON — response_format: json_object should guarantee valid JSON
    let estimation;
    try {
      estimation = JSON.parse(content);
    } catch {
      // Fallback: try extracting JSON from markdown blocks
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        estimation = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("Could not parse estimation response");
      }
    }

    return NextResponse.json(estimation);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error";
    console.error("[estimate] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
