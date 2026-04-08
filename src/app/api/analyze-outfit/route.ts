import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/withAuth";

export async function POST(req: NextRequest) {
  const authResult = await requireAuth("analyze-outfit");
  if (authResult.error) return authResult.error;

  try {
    const { image_urls } = await req.json();

    if (!image_urls || !Array.isArray(image_urls) || image_urls.length === 0) {
      return NextResponse.json(
        { error: "image_urls (array) is required" },
        { status: 400 }
      );
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY is not set" },
        { status: 500 }
      );
    }

    const imageContent = image_urls.slice(0, 4).map((url: string) => ({
      type: "image_url" as const,
      image_url: { url, detail: "high" as const },
    }));

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content:
              "You are an expert fashion stylist and wardrobe designer. " +
              "Analyze the outfit/clothing in these reference photos and produce an EXTREMELY detailed description " +
              "that would allow an AI image/video generator to recreate this EXACT outfit without seeing the photos. " +
              "Respond with a JSON object containing these fields:\n" +
              '- "top": detailed description of the top/upper body garment (e.g., "oversized cream-colored structured wool blazer with peak lapels, double-breasted with gold buttons")\n' +
              '- "bottom": detailed description of the bottom/lower body garment if visible (e.g., "high-waisted wide-leg black silk trousers with a pressed center crease")\n' +
              '- "dress": if wearing a dress instead of separate top/bottom, describe it here\n' +
              '- "outerwear": any jacket, coat, or layering piece\n' +
              '- "shoes": footwear if visible\n' +
              '- "accessories": bags, belts, scarves, hats, sunglasses — NOT jewelry (jewelry will be added separately)\n' +
              '- "colors": the dominant color palette (e.g., "monochrome cream and gold", "black and white with red accents")\n' +
              '- "fabric_textures": notable fabric textures (e.g., "matte silk, structured wool, soft leather")\n' +
              '- "style_category": the fashion style (e.g., "minimalist luxury", "streetwear-meets-high-fashion", "classic elegant")\n' +
              '- "overall_look": a one-sentence summary of the complete outfit look\n' +
              "Be extremely specific about colors, fabrics, cuts, fits, and details. " +
              "Respond ONLY with the JSON object, no other text.",
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Analyze this outfit in extreme detail. I need to recreate this EXACT outfit in AI-generated content.",
              },
              ...imageContent,
            ],
          },
        ],
        max_tokens: 800,
        temperature: 0.2,
      }),
    });

    const data = await res.json();

    if (data.error) {
      console.error("[analyze-outfit] OpenAI error:", data.error);
      return NextResponse.json(
        { error: data.error.message || "OpenAI analysis failed" },
        { status: 500 }
      );
    }

    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      return NextResponse.json(
        { error: "No analysis returned" },
        { status: 500 }
      );
    }

    try {
      const cleaned = content.replace(/```json\s*|\s*```/g, "").trim();
      const analysis = JSON.parse(cleaned);

      // Build prose description
      const parts: string[] = [];
      if (analysis.dress) parts.push(analysis.dress);
      else {
        if (analysis.top) parts.push(analysis.top);
        if (analysis.bottom) parts.push(`paired with ${analysis.bottom}`);
      }
      if (analysis.outerwear) parts.push(`layered with ${analysis.outerwear}`);
      if (analysis.shoes) parts.push(`wearing ${analysis.shoes}`);
      if (analysis.accessories) parts.push(`accessorized with ${analysis.accessories}`);

      const prose =
        parts.join(". ") +
        `. Color palette: ${analysis.colors || "neutral tones"}. ` +
        `Fabrics: ${analysis.fabric_textures || "premium materials"}. ` +
        `Style: ${analysis.style_category || "luxury fashion"}. ` +
        `Overall: ${analysis.overall_look || "sophisticated elegant look"}.`;

      return NextResponse.json({ ...analysis, prose });
    } catch {
      console.error("[analyze-outfit] Failed to parse:", content);
      return NextResponse.json({
        prose: content,
        style_category: "luxury fashion",
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[analyze-outfit] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
