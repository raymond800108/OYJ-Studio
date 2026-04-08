import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/withAuth";

export async function POST(req: NextRequest) {
  const authResult = await requireAuth("analyze-character");
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

    // Send up to 4 reference images for analysis
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
              "You are an expert portrait photographer and casting director. " +
              "Analyze the person in these reference photos and produce an EXTREMELY detailed physical appearance description " +
              "that would allow an AI image/video generator to recreate this EXACT person without seeing the photos. " +
              "Respond with a JSON object containing these fields:\n" +
              '- "gender": gender presentation (e.g., "female", "male")\n' +
              '- "ethnicity": apparent ethnicity/heritage for accurate skin tone and features (e.g., "East Asian", "South Asian", "Caucasian", "Black", "Latina", "Middle Eastern", "mixed heritage")\n' +
              '- "age_range": estimated age range (e.g., "early 20s", "late 30s")\n' +
              '- "face_shape": detailed face shape (e.g., "oval with high cheekbones and a narrow chin")\n' +
              '- "eyes": detailed eye description including shape, size, color, spacing, eyelids (e.g., "almond-shaped monolid dark brown eyes, slightly upturned outer corners")\n' +
              '- "nose": nose shape and size (e.g., "small straight nose with a slightly rounded tip")\n' +
              '- "lips": lip shape and fullness (e.g., "full lips with a pronounced cupids bow, natural rosy tint")\n' +
              '- "eyebrows": brow shape and color (e.g., "straight, thick dark brows with a slight natural arch")\n' +
              '- "skin": skin tone, texture, any notable features (e.g., "warm golden-tan complexion, smooth clear skin with a subtle glow")\n' +
              '- "hair": hair color, length, texture, style (e.g., "jet black, long straight hair reaching mid-back, with side-swept bangs")\n' +
              '- "body_type": build and proportions (e.g., "slim, petite frame, approximately 5\'4\", narrow shoulders")\n' +
              '- "distinctive_features": any unique identifying features like moles, dimples, freckles (e.g., "small beauty mark on left cheekbone, dimples when smiling")\n' +
              '- "overall_vibe": the overall aesthetic/energy (e.g., "elegant and refined with a youthful, approachable warmth")\n' +
              "Be extremely specific and precise. The goal is to produce a text description so detailed that someone could recognize this specific person from it. " +
              "Respond ONLY with the JSON object, no other text.",
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Analyze this person's physical appearance in extreme detail. I need to recreate this EXACT person in AI-generated content.",
              },
              ...imageContent,
            ],
          },
        ],
        max_tokens: 1000,
        temperature: 0.2,
      }),
    });

    const data = await res.json();

    if (data.error) {
      console.error("[analyze-character] OpenAI error:", data.error);
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

      // Build a consolidated prose description for embedding in prompts
      const prose =
        `A ${analysis.gender || "female"} model, ${analysis.ethnicity || ""}, ${analysis.age_range || ""}. ` +
        `Face: ${analysis.face_shape || "oval"}. ` +
        `Eyes: ${analysis.eyes || "dark brown"}. ` +
        `Nose: ${analysis.nose || "straight"}. ` +
        `Lips: ${analysis.lips || "natural"}. ` +
        `Eyebrows: ${analysis.eyebrows || "natural arch"}. ` +
        `Skin: ${analysis.skin || "smooth complexion"}. ` +
        `Hair: ${analysis.hair || "dark hair"}. ` +
        `Body: ${analysis.body_type || "slim"}. ` +
        `Distinctive features: ${analysis.distinctive_features || "none"}. ` +
        `Overall vibe: ${analysis.overall_vibe || "elegant"}.`;

      return NextResponse.json({ ...analysis, prose });
    } catch {
      console.error("[analyze-character] Failed to parse:", content);
      return NextResponse.json({
        prose: content,
        gender: "female",
        overall_vibe: "elegant",
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[analyze-character] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
