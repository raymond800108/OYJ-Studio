import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/withAuth";

/**
 * Refines a high-level user description into a detailed video generation
 * prompt for AI video models (e.g. Kling).
 */
export async function POST(req: NextRequest) {
  const authResult = await requireAuth("analyze-jewelry");
  if (authResult.error) return authResult.error;

  try {
    const { text, image_url } = await req.json();

    if (!text) {
      return NextResponse.json({ error: "text is required" }, { status: 400 });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "OPENAI_API_KEY is not set" }, { status: 500 });
    }

    // Only include image if it's a valid hosted URL (not blob:)
    const validImageUrl =
      image_url && typeof image_url === "string" && image_url.startsWith("https://")
        ? image_url
        : undefined;

    const messages: Array<{ role: string; content: unknown }> = [
      {
        role: "system",
        content:
          "You are a creative copywriter who writes text-to-video prompts for product advertisement videos. " +
          "The user is creating a short product showcase video for their jewelry e-commerce store. " +
          "Given their brief description, expand it into a rich, detailed prompt describing the video scene. " +
          "Guidelines:\n" +
          "- Output ONLY the expanded prompt text, no markdown or formatting.\n" +
          "- Keep it under 200 words.\n" +
          "- Describe camera movement (slow pan, dolly, orbit), lighting style, mood, and pacing.\n" +
          "- Emphasise that the product must look exactly as shown — preserve every design detail.\n" +
          "- Use elegant, cinematic language suitable for luxury brand advertising.\n" +
          "- If the user mentions a person/model, describe graceful minimal motion.",
      },
      {
        role: "user",
        content: validImageUrl
          ? [
              {
                type: "text" as const,
                text: `Write an expanded video prompt based on this brief description. The video will feature the jewelry product shown in the attached image.\n\nUser's description: "${text}"`,
              },
              {
                type: "image_url" as const,
                image_url: { url: validImageUrl, detail: "low" as const },
              },
            ]
          : `Write an expanded video prompt based on this brief description for a jewelry product showcase video.\n\nUser's description: "${text}"`,
      },
    ];

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages,
        max_tokens: 400,
        temperature: 0.7,
      }),
    });

    const data = await res.json();

    if (data.error) {
      console.error("[refine-prompt] OpenAI error:", data.error);
      return NextResponse.json({ error: data.error.message || "OpenAI error" }, { status: 500 });
    }

    // Check for refusal
    const message = data.choices?.[0]?.message;
    if (message?.refusal) {
      console.error("[refine-prompt] OpenAI refused:", message.refusal);
      return NextResponse.json({ error: "AI could not refine this prompt. Please try rephrasing." }, { status: 400 });
    }

    const refined = message?.content?.trim();
    if (!refined) {
      return NextResponse.json({ error: "No response from OpenAI" }, { status: 500 });
    }

    // Detect soft refusals in the content itself
    const lowerRefined = refined.toLowerCase();
    if (
      lowerRefined.includes("i'm sorry") ||
      lowerRefined.includes("i can't help") ||
      lowerRefined.includes("i cannot help") ||
      lowerRefined.includes("i'm unable to")
    ) {
      console.error("[refine-prompt] Soft refusal detected:", refined);
      return NextResponse.json({ error: "AI could not refine this prompt. Please try rephrasing." }, { status: 400 });
    }

    return NextResponse.json({ prompt: refined });
  } catch (error) {
    console.error("[refine-prompt] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
