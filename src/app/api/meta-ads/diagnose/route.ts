import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { getSession } from "@/lib/auth";
import { getRedis } from "@/lib/redis";
import type { MetaAdsConnection } from "@/app/api/auth/meta-ads/callback/route";

const FB_GRAPH = "https://graph.facebook.com/v19.0";

/* ─── Output schema (consumed by the Ads page UI) ─────────────── */

export interface MetaAdsDiagnosis {
  account_summary: string;
  whats_working: { insight: string; evidence: string }[];
  whats_not_working: { insight: string; evidence: string }[];
  best_campaign: { name: string; spend: string; roas: string; why: string } | null;
  best_ad: { name: string; ctr: string; roas: string; why: string } | null;
  budget_recommendation: { action: string; rationale: string };
  next_campaign: {
    objective: string;
    audience: string;
    format: "Reel" | "Carousel" | "Single Image" | "Story";
    hook: string;
    budget: string;
    rationale: string;
  };
  generation_prompt: string;
}

/* ─── Facebook insights shape ─────────────────────────────────── */

interface FBAction {
  action_type: string;
  value: string;
}

interface FBInsight {
  spend?: string;
  impressions?: string;
  reach?: string;
  clicks?: string;
  ctr?: string;
  cpc?: string;
  actions?: FBAction[];
  action_values?: FBAction[];
  date_start?: string;
  date_stop?: string;
}

interface FBCampaign {
  id: string;
  name: string;
  status: string;
  objective?: string;
  insights?: { data?: FBInsight[] };
}

interface FBAd {
  id: string;
  name: string;
  status: string;
  campaign_id?: string;
  insights?: { data?: FBInsight[] };
}

/* ─── Helpers ─────────────────────────────────────────────────── */

function parseNum(s: string | undefined): number {
  if (!s) return 0;
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

function extractAction(actions: FBAction[] | undefined, type: string): number {
  if (!actions) return 0;
  const m = actions.find((a) => a.action_type === type);
  return m ? parseNum(m.value) : 0;
}

function calcRoas(insight: FBInsight | undefined): number {
  if (!insight) return 0;
  const spend = parseNum(insight.spend);
  const revenue =
    extractAction(insight.action_values, "purchase") +
    extractAction(insight.action_values, "omni_purchase") +
    extractAction(insight.action_values, "offsite_conversion.fb_pixel_purchase");
  if (spend === 0) return 0;
  return Math.round((revenue / spend) * 100) / 100;
}

const SYSTEM_PROMPT = `You are an expert Meta Ads strategist. You analyse a 30-day window of campaign + ad performance for a luxury jewelry brand and return STRICTLY a single JSON object that matches the MetaAdsDiagnosis schema. No markdown fences, no commentary outside the JSON. Cite specific numbers in every insight. Format spend/budget as USD with currency symbol. Format ROAS as "Xx" (e.g. "3.2x"), CTR as a percentage string. The generation_prompt must be a ready-to-paste prompt for the brand's image generator that mirrors next_campaign.format and visual direction. Do not invent metrics — if data is sparse, say so in account_summary.`;

/* ─── Route ───────────────────────────────────────────────────── */

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const redis = getRedis();
  if (!redis) return NextResponse.json({ error: "Redis not configured" }, { status: 500 });

  const { userId } = session;
  const body = (await req.json().catch(() => ({}))) as {
    account_id?: string;
    force?: boolean;
  };
  const accountId = body.account_id;
  if (!accountId) {
    return NextResponse.json({ error: "account_id required" }, { status: 400 });
  }

  // 6-hour cache per (user, account)
  const cacheKey = `meta_ads:diagnosis:${userId}:${accountId}`;
  if (!body.force) {
    const cached = await redis.get(cacheKey);
    if (cached) {
      const parsed = typeof cached === "string" ? JSON.parse(cached) : cached;
      return NextResponse.json(parsed);
    }
  }

  const rawConn = await redis.get(`meta_ads:${userId}`);
  if (!rawConn) return NextResponse.json({ error: "meta_ads_not_connected" }, { status: 401 });
  const conn: MetaAdsConnection =
    typeof rawConn === "string" ? JSON.parse(rawConn) : (rawConn as MetaAdsConnection);

  const insightFields =
    "spend,impressions,reach,clicks,ctr,cpc,actions,action_values,date_start,date_stop";

  /* Step 1: account-level 30-day insights */
  const acctInsightsRes = await fetch(
    `${FB_GRAPH}/${accountId}/insights?fields=${insightFields}&date_preset=last_30d&access_token=${conn.access_token}`
  );
  const acctInsightsData = (await acctInsightsRes.json()) as {
    data?: FBInsight[];
    error?: { code: number; message: string };
  };
  if (acctInsightsData.error) {
    if (acctInsightsData.error.code === 190) {
      await redis.del(`meta_ads:${userId}`);
      return NextResponse.json({ error: "TOKEN_EXPIRED" }, { status: 401 });
    }
    return NextResponse.json({ error: acctInsightsData.error.message }, { status: 502 });
  }
  const accountInsight = acctInsightsData.data?.[0];

  /* Step 2: list campaigns (active first), cap to 10 */
  const campaignsRes = await fetch(
    `${FB_GRAPH}/${accountId}/campaigns?fields=id,name,status,objective&limit=25&access_token=${conn.access_token}`
  );
  const campaignsData = (await campaignsRes.json()) as {
    data?: FBCampaign[];
    error?: { code: number; message: string };
  };
  if (campaignsData.error) {
    return NextResponse.json({ error: campaignsData.error.message }, { status: 502 });
  }
  const activeCampaigns = (campaignsData.data ?? [])
    .filter((c) => c.status === "ACTIVE")
    .slice(0, 10);
  const allCampaigns = (campaignsData.data ?? []).slice(0, 10);
  const campaignsToInspect = activeCampaigns.length > 0 ? activeCampaigns : allCampaigns;

  /* Step 3: parallel campaign-level insights */
  const campaignsWithInsights = await Promise.all(
    campaignsToInspect.map(async (c) => {
      const r = await fetch(
        `${FB_GRAPH}/${c.id}/insights?fields=${insightFields}&date_preset=last_30d&access_token=${conn.access_token}`
      );
      const d = (await r.json()) as { data?: FBInsight[] };
      return { ...c, insights: { data: d.data ?? [] } };
    })
  );

  /* Step 4: top 10 ads by spend */
  const adsRes = await fetch(
    `${FB_GRAPH}/${accountId}/ads?fields=id,name,status,campaign_id&limit=50&access_token=${conn.access_token}`
  );
  const adsData = (await adsRes.json()) as { data?: FBAd[] };
  const adsWithInsights = await Promise.all(
    (adsData.data ?? []).slice(0, 25).map(async (a) => {
      const r = await fetch(
        `${FB_GRAPH}/${a.id}/insights?fields=${insightFields}&date_preset=last_30d&access_token=${conn.access_token}`
      );
      const d = (await r.json()) as { data?: FBInsight[] };
      return { ...a, insights: { data: d.data ?? [] } };
    })
  );
  const topAdsBySpend = adsWithInsights
    .map((a) => ({ ad: a, spend: parseNum(a.insights?.data?.[0]?.spend) }))
    .sort((x, y) => y.spend - x.spend)
    .slice(0, 10)
    .map((x) => x.ad);

  /* Step 5: build compact prompt input */
  const promptInput = {
    account_summary: {
      spend: accountInsight?.spend ?? "0",
      impressions: accountInsight?.impressions ?? "0",
      reach: accountInsight?.reach ?? "0",
      clicks: accountInsight?.clicks ?? "0",
      ctr: accountInsight?.ctr ?? "0",
      cpc: accountInsight?.cpc ?? "0",
      roas: calcRoas(accountInsight),
    },
    campaigns: campaignsWithInsights.map((c) => {
      const ins = c.insights?.data?.[0];
      return {
        name: c.name,
        status: c.status,
        objective: c.objective,
        spend: parseNum(ins?.spend),
        impressions: parseNum(ins?.impressions),
        ctr: parseNum(ins?.ctr),
        roas: calcRoas(ins),
      };
    }),
    top_ads: topAdsBySpend.map((a) => {
      const ins = a.insights?.data?.[0];
      return {
        name: a.name,
        status: a.status,
        spend: parseNum(ins?.spend),
        ctr: parseNum(ins?.ctr),
        roas: calcRoas(ins),
      };
    }),
  };

  /* Step 6: call GPT-4o, with one retry at lower temperature */
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  async function callModel(temperature: number): Promise<MetaAdsDiagnosis | null> {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature,
      max_tokens: 1500,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `Analyze the last 30 days. Return ONLY the JSON object.\n\n${JSON.stringify(promptInput)}`,
        },
      ],
    });
    const text = completion.choices[0]?.message?.content?.trim() ?? "";
    try {
      const cleaned = text.replace(/^```json\s*|\s*```$/g, "");
      return JSON.parse(cleaned) as MetaAdsDiagnosis;
    } catch {
      return null;
    }
  }

  let diagnosis = await callModel(0.3);
  if (!diagnosis) diagnosis = await callModel(0.1);
  if (!diagnosis) {
    return NextResponse.json({ error: "Model returned invalid JSON" }, { status: 502 });
  }

  await redis.set(cacheKey, JSON.stringify(diagnosis), { ex: 21600 });
  return NextResponse.json(diagnosis);
}
