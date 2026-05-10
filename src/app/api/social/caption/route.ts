import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/withAuth";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req: NextRequest) {
  const authResult = await requireAuth();
  if (authResult.error) return authResult.error;

  const body = await req.json();
  const {
    image_url,
    platform = "instagram",
    locale = "en",
    prompt_context,
    media_type,
  } = body as {
    image_url: string;
    platform?: string;
    locale?: string;
    prompt_context?: string;
    media_type?: string;
  };

  if (!image_url) {
    return NextResponse.json(
      { error: "image_url is required" },
      { status: 400 }
    );
  }

  const platformCaps =
    platform.charAt(0).toUpperCase() + platform.slice(1).toLowerCase();
  const langNote =
    locale === "zh"
      ? " Write the caption in Traditional Chinese (繁體中文)."
      : "";

  const systemPrompt = `You are a luxury jewelry brand social media expert. Write an engaging ${platformCaps} caption for the provided product image. Keep it concise, evocative, and on-brand — premium, sophisticated, aspirational.${langNote}`;

  const userContent: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
    {
      type: "image_url",
      image_url: { url: image_url, detail: "low" },
    },
    {
      type: "text",
      text: `Write a ${platformCaps} caption for this jewelry product${media_type ? ` (${media_type})` : ""}.${prompt_context ? ` Context: ${prompt_context}` : ""} Include 3-5 relevant hashtags at the end. Return only the caption text, nothing else.`,
    },
  ];

  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userContent },
    ],
    max_tokens: 300,
    temperature: 0.8,
  });

  const caption = completion.choices[0]?.message?.content?.trim() || "";

  return NextResponse.json({ caption });
}
