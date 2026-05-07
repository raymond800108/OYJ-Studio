import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/withAuth";

export async function POST(req: NextRequest) {
  const authResult = await requireAuth("image-generate");
  if (authResult.error) return authResult.error;

  try {
    const { jewelry_url, packaging_url, packaging_description } = await req.json();

    if (!jewelry_url || !packaging_url) {
      return NextResponse.json({ error: "jewelry_url and packaging_url are required" }, { status: 400 });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "OPENAI_API_KEY is not set" }, { status: 500 });
    }

    // Fetch both images as buffers
    const [pkgRes, jewRes] = await Promise.all([
      fetch(packaging_url),
      fetch(jewelry_url),
    ]);

    if (!pkgRes.ok || !jewRes.ok) {
      return NextResponse.json({ error: "Failed to fetch reference images" }, { status: 500 });
    }

    const [pkgBuf, jewBuf] = await Promise.all([
      pkgRes.arrayBuffer(),
      jewRes.arrayBuffer(),
    ]);

    // Build multipart form — gpt-image-1 edits endpoint
    const form = new FormData();
    form.append("model", "gpt-image-1");
    form.append("n", "1");
    form.append("size", "1024x1024");
    form.append("quality", "high");
    form.append(
      "prompt",
      "You are a luxury product photographer. " +
      "Create a hyper-real studio photograph of the exact jewelry piece placed inside the open packaging. " +
      "PACKAGING (first image): " + (packaging_description || "the exact packaging shown") + ". " +
      "Reproduce the packaging EXACTLY — same exterior color, finish, shape, size, branding, logo, and interior cushion or tray. " +
      "Do NOT substitute or invent a different box. " +
      "JEWELRY (second image): place this exact piece inside the open packaging, resting naturally on the interior cushion or tray. " +
      "Reproduce every detail of the jewelry — same design, gemstones, metal color, finish, and proportions. " +
      "The lid should be open or slightly raised to reveal the jewelry inside. " +
      "Studio lighting with soft highlights and gentle shadows. Minimal clean background. " +
      "One unified luxury brand photograph — not a composite."
    );

    // Packaging image first — becomes image[0], the primary scene reference
    form.append(
      "image[]",
      new Blob([pkgBuf], { type: "image/jpeg" }),
      "packaging.jpg"
    );
    // Jewelry image second — becomes image[1]
    form.append(
      "image[]",
      new Blob([jewBuf], { type: "image/jpeg" }),
      "jewelry.jpg"
    );

    const res = await fetch("https://api.openai.com/v1/images/edits", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });

    const data = await res.json();

    if (data.error) {
      console.error("[generate-gpt-packaging] OpenAI error:", data.error);
      return NextResponse.json({ error: data.error.message || "OpenAI image generation failed" }, { status: 500 });
    }

    // gpt-image-1 returns b64_json by default
    const b64 = data.data?.[0]?.b64_json;
    const url = data.data?.[0]?.url;

    if (!b64 && !url) {
      return NextResponse.json({ error: "No image returned from OpenAI" }, { status: 500 });
    }

    return NextResponse.json({
      imageUrl: url ?? `data:image/png;base64,${b64}`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[generate-gpt-packaging] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
