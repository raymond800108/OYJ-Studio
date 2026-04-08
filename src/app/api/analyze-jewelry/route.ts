import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/withAuth";

export async function POST(req: NextRequest) {
  const authResult = await requireAuth("analyze-jewelry");
  if (authResult.error) return authResult.error;

  try {
    const { image_url } = await req.json();

    if (!image_url) {
      return NextResponse.json({ error: "image_url is required" }, { status: 400 });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "OPENAI_API_KEY is not set" }, { status: 500 });
    }

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
              "You are a luxury jewelry expert and fashion photographer. Analyze the jewelry piece in the image and respond with a JSON object containing exactly these fields:\n" +
              '- "type": the specific type of jewelry (e.g., "ring", "stud earrings", "drop earrings", "pendant necklace", "chain necklace", "bracelet", "bangle", "brooch", "anklet")\n' +
              '- "description": a brief description of the piece including materials, gemstones, style (e.g., "gold ring with emerald-cut blue topaz flanked by trillion-cut emeralds")\n' +
              '- "body_placement": exactly where and how this piece is worn on the body (e.g., "on the ring finger of the left hand", "dangling from the earlobe", "around the neck resting on the collarbone", "on the wrist")\n' +
              '- "pose_suggestion": a specific pose suggestion for a model wearing this piece that best showcases it in a close-up photo (e.g., "hand gently raised near the chin, fingers slightly spread to display the ring", "head tilted slightly, tucking hair behind the ear to reveal the earring")\n' +
              "Respond ONLY with the JSON object, no other text.",
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Analyze this jewelry piece. What type is it, how should it be worn, and what pose would best showcase it?",
              },
              {
                type: "image_url",
                image_url: { url: image_url, detail: "high" },
              },
            ],
          },
        ],
        max_tokens: 500,
        temperature: 0.3,
      }),
    });

    const data = await res.json();

    if (data.error) {
      console.error("[analyze-jewelry] OpenAI error:", data.error);
      return NextResponse.json(
        { error: data.error.message || "OpenAI analysis failed" },
        { status: 500 }
      );
    }

    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      return NextResponse.json({ error: "No analysis returned" }, { status: 500 });
    }

    // Parse the JSON response
    try {
      // Strip markdown code fences if present
      const cleaned = content.replace(/```json\s*|\s*```/g, "").trim();
      const analysis = JSON.parse(cleaned);
      return NextResponse.json(analysis);
    } catch {
      console.error("[analyze-jewelry] Failed to parse:", content);
      // Return raw content as fallback
      return NextResponse.json({
        type: "jewelry",
        description: content,
        body_placement: "worn elegantly",
        pose_suggestion: "close-up portrait showcasing the piece",
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[analyze-jewelry] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
