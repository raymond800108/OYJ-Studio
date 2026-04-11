import type { ApiAction } from "./usage";

/* ─── Credit costs per action ───────────────────────────────────── */

export const ACTION_CREDITS: Record<ApiAction, number> = {
  "camera-generate": 1,
  "inpaint": 1,
  "upload": 0,         // free
  "image-generate": 1,
  "video-generate": 10,
  "3d-generate": 5,
  "analyze-jewelry": 1,
  "analyze-character": 1,
  "analyze-outfit": 1,
  "estimate": 1,
};

/* ─── Plan credit allotments (monthly) ──────────────────────────── */

export const PLAN_CREDITS: Record<string, number> = {
  free: 100,
  starter: 80,
  pro: 200,
  business: 600,
};

export function getCreditsForAction(action: ApiAction): number {
  return ACTION_CREDITS[action] ?? 1;
}
