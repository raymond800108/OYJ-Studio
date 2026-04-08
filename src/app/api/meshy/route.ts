import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/withAuth";

const MESHY_BASE = "https://api.meshy.ai/openapi/v1/image-to-3d";

function getHeaders() {
  const key = process.env.MESHY_API_KEY;
  if (!key) throw new Error("MESHY_API_KEY environment variable is not set");
  return {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
}

// POST — create a new image-to-3D task
export async function POST(req: NextRequest) {
  const authResult = await requireAuth("3d-generate");
  if (authResult.error) return authResult.error;

  try {
    const { image_url } = await req.json();
    if (!image_url) {
      return NextResponse.json(
        { error: "image_url is required" },
        { status: 400 }
      );
    }

    const res = await fetch(MESHY_BASE, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({
        image_url,
        ai_model: "meshy-6",
        target_formats: ["glb"],
        should_remesh: false, // meshy-6 default; raw output is already high quality
        enable_pbr: true,
        topology: "triangle",
        // meshy-6-only enhancements
        image_enhancement: true, // optimizes input image for better 3D
        remove_lighting: true, // removes baked-in lighting for cleaner PBR
        symmetry_mode: "auto", // AI detects and enforces symmetry
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      console.error("[meshy] Create error:", JSON.stringify(data));
      return NextResponse.json(
        { error: data.message || "Failed to create 3D task" },
        { status: res.status }
      );
    }

    console.log("[meshy] Task created:", data.result);
    return NextResponse.json({ taskId: data.result });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error";
    console.error("[meshy] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// GET — poll task status
export async function GET(req: NextRequest) {
  try {
    const taskId = req.nextUrl.searchParams.get("taskId");
    if (!taskId) {
      return NextResponse.json(
        { error: "taskId query param is required" },
        { status: 400 }
      );
    }

    const res = await fetch(`${MESHY_BASE}/${taskId}`, {
      headers: getHeaders(),
    });

    const data = await res.json();
    if (!res.ok) {
      console.error("[meshy] Status error:", JSON.stringify(data));
      return NextResponse.json(
        { error: data.message || "Failed to get task status" },
        { status: res.status }
      );
    }

    return NextResponse.json({
      id: data.id,
      status: data.status,
      progress: data.progress,
      model_urls: data.model_urls,
      thumbnail_url: data.thumbnail_url,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error";
    console.error("[meshy] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
