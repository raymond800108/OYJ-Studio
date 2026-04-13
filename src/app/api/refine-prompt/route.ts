import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/withAuth";

/**
 * Refines a high-level user description into a detailed video generation
 * prompt optimised for Kling 2.6.
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

    const messages: Array<{ role: string; content: unknown }> = [
      {
        role: "system",
        content:
          "You are a professional AI video prompt engineer specialising in luxury jewelry video campaigns. " +
          "The user will give you a short, high-level description of what they want in a product video. " +
          "Your job is to expand it into a detailed, cinematic video generation prompt optimised for Kling 2.6 AI video model. " +
          "Rules:\n" +
          "- Keep the prompt under 200 words.\n" +
          "- Focus on: camera movement, lighting, mood, pacing, and composition.\n" +
          "- Always emphasise preserving the EXACT jewelry product identity — every detail, gemstone, metal colour must match.\n" +
          "- Include cinematic terminology (dolly, rack focus, slow motion, etc.).\n" +
          "- Do NOT add markdown, bullet points, or formatting — return ONLY the prompt text.\n" +
          "- If the user mentions a model/person, describe elegant, minimal motion (slow turn, gentle gesture).\n" +
          "- Default to luxury editorial aesthetic unless the user specifies otherwise.",
      },
      {
        role: "user",
        content: image_url
          ? [
              { type: "text", text: `Refine this into a detailed Kling 2.6 video prompt:\n\n"${text}"` },
              { type: "image_url", image_url: { url: image_url, detail: "low" } },
            ]
          : `Refine this into a detailed Kling 2.6 video prompt:\n\n"${text}"`,
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
      return NextResponse.json({ error: data.error.message || "OpenAI error" }, { status: 500 });
    }

    const refined = data.choices?.[0]?.message?.content?.trim();
    if (!refined) {
      return NextResponse.json({ error: "No response from OpenAI" }, { status: 500 });
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
