import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/withAuth";

export async function POST(req: NextRequest) {
  const authResult = await requireAuth("analyze-packaging");
  if (authResult.error) return authResult.error;

  try {
    const { image_url } = await req.json();
    if (!image_url) return NextResponse.json({ error: "image_url is required" }, { status: 400 });

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "OPENAI_API_KEY is not set" }, { status: 500 });

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content:
              "You are a luxury packaging expert and product photographer. Analyze the jewelry packaging in the image and respond with a JSON object containing exactly these fields:\n" +
              '- "box_type": the type of packaging (e.g., "rigid hinged gift box", "magnetic closure box", "velvet drawstring pouch", "slide drawer box", "pillow box", "window display box")\n' +
              '- "shape": shape of the packaging (e.g., "square", "rectangular", "cylindrical", "hexagonal")\n' +
              '- "size_impression": implied size relative to jewelry (e.g., "small ring box", "bracelet-width rectangular box", "large necklace box")\n' +
              '- "exterior_color": exact color and finish of the outside surface (e.g., "matte black", "glossy ivory white", "deep navy blue with gold foil edges")\n' +
              '- "exterior_material": material of the outside (e.g., "matte rigid cardboard", "leatherette", "velvet-wrapped", "lacquered wood", "soft microfiber")\n' +
              '- "branding": any visible logo, brand name, embossing, debossing, foil stamping, or printed text — describe exact placement and style\n' +
              '- "interior": description of the inside (e.g., "white silk cushion with ring slot", "black velvet tray", "cream satin lining", "foam insert with cutout")\n' +
              '- "opening_mechanism": how it opens (e.g., "hinged lid", "magnetic snap closure", "lift-off lid", "drawstring", "slide drawer")\n' +
              '- "prose": a single flowing paragraph (3-5 sentences) combining all above details, written so an AI image generator could recreate this EXACT packaging without seeing the photo\n' +
              "Respond ONLY with the JSON object, no other text.",
          },
          {
            role: "user",
            content: [
              { type: "text", text: "Analyze this jewelry packaging in detail so it can be exactly reproduced in an AI-generated image." },
              { type: "image_url", image_url: { url: image_url, detail: "high" } },
            ],
          },
        ],
        max_tokens: 600,
        temperature: 0.2,
      }),
    });

    const data = await res.json();
    if (data.error) {
      return NextResponse.json({ error: data.error.message || "OpenAI error" }, { status: 500 });
    }

    const content = data.choices?.[0]?.message?.content;
    if (!content) return NextResponse.json({ error: "No analysis returned" }, { status: 500 });

    try {
      const cleaned = content.replace(/```json\s*|\s*```/g, "").trim();
      return NextResponse.json(JSON.parse(cleaned));
    } catch {
      return NextResponse.json({ prose: content });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[analyze-packaging] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
