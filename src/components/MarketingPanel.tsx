"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import {
  Image,
  Video,
  Sparkles,
  RefreshCw,
  Loader2,
  Download,
  Play,
  X,
  Upload,
  Clock,
  Maximize2,
  Plus,
  Wand2,
} from "lucide-react";
import type { HistoryItem } from "./HistoryPanel";
import TemplatePreview from "./TemplatePreview";
import { useI18n } from "@/lib/i18n";
import type { TKey } from "@/lib/i18n";
import type { ApiAction } from "@/lib/usage";

// ── Studio prompt templates (extracted from Prompterio Bracelets PDF) ────────

interface Template {
  id: string;
  label: string;
  icon: string;
  description: string;
  prompt: string;
  dynamic?: boolean;
  popular?: boolean;
}

// Prefix prepended to every template prompt to enforce product consistency
const CONSISTENCY_PREFIX =
  "CRITICAL: The generated image MUST feature the EXACT same jewelry piece shown in the reference image. Preserve every detail of the original product — its exact shape, design, gemstones, metal color, proportions, and craftsmanship. Do NOT substitute, alter, or replace the jewelry with a different piece. The product identity must be perfectly maintained. ";

const TEMPLATES = [
  {
    id: "natural-surface",
    label: "Natural Surface",
    icon: "🪨",
    description: "Light pale stone, marble or sand surface with soft organic texture contrast",
    prompt:
      "Create a hyper-real, ultra high-resolution studio photograph of the exact jewelry piece from the reference image placed directly on a light-toned pale stone surface — think soft white limestone, cream travertine, or light grey marble with subtle natural veining. The pale, matte finish of the stone creates an elegant and airy contrast with the refined polish and intricate craftsmanship of the jewelry. Capture extreme close-up details showcasing fine engravings, precise metalwork, gemstone clarity, and flawless finish. Use professional studio lighting with soft directional highlights and controlled shadows to enhance depth, texture, and brilliance. The background should remain minimal and unobtrusive, allowing the jewelry to dominate the frame. Shot on a high-end professional camera with perfect exposure, sharp focus, and cinematic depth of field, delivering a refined luxury editorial aesthetic.",
  },
  {
    id: "floating-abstract",
    label: "Creative Floating",
    icon: "✧",
    description: "Levitating mid-air with soft shadow beneath, weightless artistic composition",
    prompt:
      "A high quality studio photo of the exact jewelry piece from the reference image appearing to hover just millimeters between two jagged slabs of raw, white Carrera marble. The entire piece is visible in an extreme closeup, with the camera at a very low angle, looking up through the \"canyon\" of the rock. The background is a hazy, soft-focus gold. Lighting is a mix of warm and cool tones, with a blue-gelled rim light on the marble and a warm key light on the product. Inspired by the nature-meets-architecture campaigns of Bvlgari. Camera: Sony A1, 90mm Macro, f/16, ISO 100. The contrast between the unrefined stone and the floating, pristine jewelry creates a sophisticated, earth-grounded luxury.",
  },
  {
    id: "clean-neutral",
    label: "Clean & Neutral",
    icon: "◻",
    description: "Pure white or soft neutral seamless background with balanced studio lighting",
    popular: true,
    prompt:
      "A high quality studio photo of the exact jewelry piece from the reference image positioned in the center on a monochrome pedestal. The background is a solid, warm sand-colored studio wall. The lighting is diffused through the scene, creating a soft, ethereal glow on the product's surface. Shot using a Fujifilm GFX 100S, 110mm lens, f/5.6 to create a gentle fall-off in focus. Inspired by the delicate, tactile campaigns of Hermès, this uses shadows to create depth and interest, ensuring the composition is unique and premium while maintaining a grounded, realistic atmosphere.",
  },
  {
    id: "elemental-artistic",
    label: "Elemental & Artistic",
    icon: "💧",
    description: "Water droplets, smoke wisps or prism light refractions around the piece",
    popular: true,
    prompt:
      "A high quality studio photo of the exact jewelry piece from the reference image positioned on heap of thin fine white silica sand, creating a small \"mountains\" of sand around the product. The background is a warm, out-of-focus beige. Photographed with a Sony A1, 90mm Macro, f/11, 1/2000s. Lighting is a hard side-light to emphasize the individual grains of sand and the sparkle of the product. This elemental shot is inspired by the \"passage of time\" concepts in high-end watchmaking, creating a tactile, detailed, and unique scene that feels both artistic and grounded in reality. Isometric top view.",
  },
  {
    id: "detail-closeup",
    label: "Detail Close-Up",
    icon: "🔍",
    description: "Extreme macro focus on engravings, metal joins and gemstone settings — distortion-free",
    prompt:
      "Create a hyper-real, ultra high-resolution studio photograph of the exact jewelry piece from the reference image captured in extreme macro close-up. Focus tightly on the intricate craftsmanship, revealing fine engravings, precise metal joins, gemstone settings, and surface polish. Use controlled studio lighting to create crisp highlights and soft shadows that enhance texture and depth without glare. The background should be minimal and unobtrusive, allowing every micro-detail to stand out. CRITICAL ANTI-DISTORTION RULES: Do NOT warp, stretch, bend, or distort any part of the jewelry. All geometric shapes (circles, ovals, rectangles, symmetrical patterns) must remain perfectly true to the original. Metal lines must be straight, curves must be smooth and natural. Do NOT hallucinate or add extra stones, prongs, or design elements that are not in the original. Reproduce the exact geometry and proportion of every component faithfully. Shot on a professional high-end camera with a macro lens, perfect focus stacking, and flawless exposure for a refined luxury editorial look.",
  },
  {
    id: "packaging-box",
    label: "Packaging Box",
    icon: "🎁",
    description: "Place jewelry in your custom packaging — upload a packaging image or use the default luxury box",
    prompt: "__PACKAGING_BOX__",
    dynamic: true,
  },
  {
    id: "natural-branches",
    label: "Natural Branches",
    icon: "🌿",
    description: "5 branch styles — draped, stand, twig frame, wood grain, or floating branch",
    prompt: "__BRANCH_STYLE__",
    dynamic: true,
  },
  {
    id: "vintage-inspired",
    label: "Vintage Heritage",
    icon: "📜",
    description: "Classic heritage setting — customize fabric, neutral table, and velvet cloth",
    prompt: "__VINTAGE__",
    dynamic: true,
  },
  {
    id: "moss-rock",
    label: "Moss & Rock",
    icon: "🌿",
    description: "Nestled on moss-covered rock with soft cream background, editorial top view",
    popular: true,
    prompt:
      "A high quality studio photo of the exact jewelry piece from the reference image nestled on top of a rock that is covered in thick dense moss. The moss must have a muted, low-saturation grayish-green tone — desaturated and earthy, NOT vivid or bright green. Think aged, weathered, olive-toned moss rather than fresh lush green. The background is a soft, neutral cream. Captured with a Canon EOS R5, 100mm Macro, f/5.6 for a beautiful, shallow depth of field. Lighting is a large silk scrim for a soft, fashion-editorial glow. Inspired by the minimalist floral work of Robert Mapplethorpe, this prompt uses the moss growth to frame the product, creating a sophisticated, high-end, and incredibly elegant composition that feels unique and timeless. Top view isometric angle.",
  },
  {
    id: "seashell",
    label: "Seashell",
    icon: "🐚",
    description: "A single perfect shell cradles or holds the jewelry — poetic, minimal, high-end coastal editorial",
    prompt:
      "A high quality luxury editorial photograph of the exact jewelry piece from the reference image. A single, perfect natural shell — either a smooth ivory cowrie, a lustrous mother-of-pearl abalone fragment, or an elegant spiral nautilus — is used as the sole supporting element: the jewelry rests inside the shell's curved interior, is draped over its lip, or is held gently within it. The shell and jewelry are the only two subjects. No sand, no collections of shells, no sea debris. The surface beneath is a bare, minimal pale stone or soft linen — clean and uncluttered. The background is a soft, luminous off-white with subtle depth. Lighting is a single large diffused source, creating a gentle gradient of light across both the shell and the jewelry — highlighting the iridescent inner surface of the shell alongside the metal and gemstone of the piece. The composition feels intimate and poetic, as if the ocean offered the shell as a vessel for the jewelry. Captured with a Hasselblad X2D, 90mm, f/5.6. Inspired by the spare, contemplative still-life work of Irving Penn. Close macro angle, slightly elevated.",
  },
  {
    id: "consistent-wearing",
    label: "Consistent Wearing",
    icon: "💎",
    description: "Source image shows jewelry already worn correctly — reproduce the EXACT wearing style with your model's face and clothes",
    prompt: "__CONSISTENT_WEARING__",
    dynamic: true,
    popular: true,
  },
  {
    id: "solid-color",
    label: "Solid Color Studio",
    icon: "🎨",
    description: "Custom solid color or gradient background — choose from presets or enter your own color",
    prompt: "__SOLID_COLOR__",
    dynamic: true,
  },
] as Template[];

// ── Solid color / gradient background options ─────────────────────────────────

interface BgColorOption {
  id: string;
  label: string;
  hex: string; // for swatch display
  desc: string; // injected into prompt
}

// ── Studio background style sub-options (replaces old gradient pills) ────────

interface StudioBgStyle {
  id: string;
  label: string;
  icon: string;
  description: string;
  gradient: string; // CSS fallback when preview image is missing
  prompt: string;
}

const STUDIO_BG_STYLES: StudioBgStyle[] = [
  {
    id: "studio-editorial",
    label: "Powder Blue",
    icon: "🔵",
    description: "Soft powder-blue background, high-key overhead diffusion, Acne Studios editorial — bright and airy",
    gradient: "linear-gradient(135deg, #c8dff0 0%, #e0eff8 50%, #f5f9ff 100%)",
    prompt:
      "A high quality studio photo of the exact jewelry piece from the reference image. Centered against a soft powder-blue background flooded with bright, even light, the composition feels inspired by high-end editorial still life photography from Acne Studios. The lighting is high-key and airy, achieved through a large overhead diffusion panel, white bounce cards on both sides, and a bright fill from below, creating a luminous glow across the scene with virtually no shadows. The piece appears weightless and radiant, isolated from any visual noise against the bright backdrop. Shot using a Canon EOS R5 with a 100mm macro lens at f/10, ISO 100, the focus is pin-sharp across all planes. The environment is bright, serene, and minimal — evoking quiet luxury and museum-level presentation in a sunlit atelier.",
  },
  {
    id: "studio-celine",
    label: "Ivory Cream",
    icon: "🤍",
    description: "Warm bright ivory-cream, dual strip lights, Celine editorial — Hasselblad precision",
    gradient: "linear-gradient(135deg, #f5ede0 0%, #faf4ec 50%, #fdfaf5 100%)",
    prompt:
      "A high quality studio photo of the exact jewelry piece from the reference image. The piece sits perfectly centered within a bright warm ivory-cream background inspired by contemporary Celine jewelry campaigns. The backdrop is luminous and light, featuring a barely-perceptible warm tone that adds softness without distraction. Lighting uses dual bright soft strip lights positioned symmetrically, supplemented by large white reflectors that flood the scene with even, high-key illumination to sculpt edges with gentle gradients across polished surfaces. A soft diffused shadow pools barely beneath the piece. Captured with a Hasselblad H6D, 100mm macro lens, f/13, ISO 64. The mood is bright, modern, restrained, and timeless, allowing the piece's geometry and finish to dominate the airy composition.",
  },
  {
    id: "studio-lemaire",
    label: "Pearl Grey",
    icon: "◻",
    description: "Light pearl grey, bright Scandinavian northern light, levitating pedestal — Lemaire editorial",
    gradient: "linear-gradient(135deg, #d8d8d8 0%, #e8e8e8 50%, #f5f5f5 100%)",
    prompt:
      "A high quality studio photo of the exact jewelry piece from the reference image laid out flat centered against a bright light pearl-grey backdrop with soft diffused shadows. Captured using a Canon EOS R5 with 100mm f/2.8L macro lens at f/5.6, ISO 100, creating a shallow depth of field that renders the background as a luminous bright atmosphere. A massive scrim diffuses brilliant natural window light from camera left, while a large white card floods bright fill light from the right, achieving Scandinavia's coveted bright 'northern light' quality — airy and high-key. The piece sits on an invisible acrylic pedestal, creating the illusion of levitation in the bright space. Inspired by Lemaire's understated campaigns, the bright composition breathes with intentional emptiness. The camera angle is precisely perpendicular to the piece's primary plane, shot from a three-quarter height perspective.",
  },
  {
    id: "studio-complementary",
    label: "Complementary",
    icon: "✦",
    description: "Bright pastel complementary color backdrop at 45°, high-key Aesop & Loewe editorial",
    gradient: "linear-gradient(135deg, #f0c8e0 0%, #f8e0f0 50%, #fdf0f8 100%)",
    prompt:
      "A high quality studio photo of the exact jewelry piece from the reference image. The piece is framed centrally against a bright, light pastel monochromatic backdrop, using a bright and luminous complementary color of the piece for the backdrop — light, airy, and high-key — positioned at a 45 degree angle. Reminiscent of the bright, sunlit luxury product visuals by Aesop and Loewe. The lighting is bright and soft, using a large key light from above supplemented by two fill lights and white bounce cards that flood the scene with even, radiant illumination, creating delicate highlights and minimal shadow contours. Captured on a medium-format camera with a 110mm lens at f/12, ISO 50. The mood is bright, calm, modern, and editorial, celebrating craftsmanship in a luminous airy space.",
  },
  {
    id: "studio-bottega",
    label: "Luminous Taupe",
    icon: "🪶",
    description: "Bright luminous taupe void, ghost reflection, Bottega Veneta quiet luxury — Sony A1 overhead",
    gradient: "linear-gradient(135deg, #ede5d8 0%, #f5efe4 50%, #fdfaf5 100%)",
    prompt:
      "A high quality studio photo of the exact jewelry piece from the reference image positioned flat on a floor in a seamless bright luminous warm-taupe studio flooded with soft white light, channeling Bottega Veneta's quiet luxury ethos. Captured with a Sony A1 using a 90mm macro lens at f/7.1, ISO 100. A large overhead beauty dish and two bright fill panels create a high-key, airy pool of radiant light that bathes the entire scene in warm luminosity, with minimal shadows and brilliant surface detail. Foam core reflectors positioned at strategic angles bounce additional fill light to brighten every zone. The piece rests on a transparent surface creating a soft ghost reflection barely visible below. The camera shoots from a gentle overhead angle, approximately 20 degrees from vertical. The overall atmosphere is bright, ethereal, and weightless.",
  },
];

const SOLID_BG_COLORS: BgColorOption[] = [
  { id: "white", label: "Pure White", hex: "#FFFFFF", desc: "pure white seamless studio background, hex #FFFFFF, RGB(255,255,255)" },
  { id: "cream", label: "Soft Cream", hex: "#FFF8EE", desc: "soft cream seamless studio background, hex #FFF8EE, RGB(255,248,238)" },
  { id: "beige", label: "Warm Beige", hex: "#F5EFE6", desc: "warm beige seamless studio background, hex #F5EFE6, RGB(245,239,230)" },
  { id: "sand", label: "Sand", hex: "#E5DDD0", desc: "warm sand seamless studio background, hex #E5DDD0, RGB(229,221,208)" },
  { id: "pale-gold", label: "Pale Gold", hex: "#F5EDD5", desc: "pale gold seamless studio background, hex #F5EDD5, RGB(245,237,213)" },
  { id: "blush", label: "Blush Pink", hex: "#F5E6E8", desc: "soft blush pink seamless studio background, hex #F5E6E8, RGB(245,230,232)" },
  { id: "sage", label: "Sage Green", hex: "#E8EDE5", desc: "pale sage green seamless studio background, hex #E8EDE5, RGB(232,237,229)" },
  { id: "dusty-blue", label: "Dusty Blue", hex: "#E5ECF0", desc: "dusty blue seamless studio background, hex #E5ECF0, RGB(229,236,240)" },
  { id: "light-grey", label: "Light Grey", hex: "#F0F0F0", desc: "light grey seamless studio background, hex #F0F0F0, RGB(240,240,240)" },
  { id: "warm-grey", label: "Warm Grey", hex: "#E8E4E0", desc: "warm grey seamless studio background, hex #E8E4E0, RGB(232,228,224)" },
  { id: "charcoal", label: "Charcoal", hex: "#3C3C3C", desc: "dark charcoal seamless studio background, hex #3C3C3C, RGB(60,60,60)" },
  { id: "black", label: "Deep Black", hex: "#1A1A1A", desc: "deep black seamless studio background, hex #1A1A1A, RGB(26,26,26)" },
];

// ── Branch style sub-options ──────────────────────────────────────────────────

interface BranchStyle {
  id: string;
  label: string;
  icon: string;
  description: string;
  gradient: string;
  prompt: string;
}

const BRANCH_STYLES: BranchStyle[] = [
  {
    id: "branch-draped",
    label: "Draped",
    icon: "🌿",
    description: "Gently draped over a sculptural tree branch with organic curves and bark texture",
    gradient: "linear-gradient(135deg, #2d4a2d 0%, #4a6b3a 50%, #8fbc8f 100%)",
    prompt:
      "Create a hyper-real, ultra high-resolution studio photograph of the exact jewelry piece from the reference image gently draped over a sculptural natural tree branch with organic curves and subtle texture. The contrast between the raw, matte bark and the polished metal and stones enhances the piece's craftsmanship and shine. Use controlled studio lighting to highlight intricate details, reflective surfaces, and gemstone brilliance while preserving natural shadows. The background should remain soft and neutral yet creative, keeping full focus on the jewellery. Shot on a professional high-end camera with perfect exposure, sharp focus, and cinematic depth of field, delivering a refined natural luxury aesthetic.",
  },
  {
    id: "branch-stand",
    label: "Branch Stand",
    icon: "🌱",
    description: "Displayed on a clean minimal branch acting as a natural stand, modern editorial",
    gradient: "linear-gradient(135deg, #3a5a2a 0%, #5a7a4a 50%, #a0c080 100%)",
    prompt:
      "Create a hyper-realistic, studio-quality photograph of the exact jewelry piece from the reference image displayed on a clean, minimal branch positioned against a soft neutral yet creative and elegant background. The branch acts as a natural stand, elevating the piece without overpowering it. Focus on macro-level clarity to capture engravings, metal polish, and stone settings. Use diffused studio lighting to maintain elegance and balance between natural texture and refined jewellery. Captured with a professional flagship camera, precise lighting control, and shallow depth of field for a modern luxury editorial look.",
  },
  {
    id: "branch-twigs",
    label: "Twig Frame",
    icon: "🍃",
    description: "Artfully placed among fine natural twigs arranged to frame the piece without hiding it",
    gradient: "linear-gradient(135deg, #4a5a2a 0%, #6a7a3a 50%, #9aaa6a 100%)",
    prompt:
      "Create an ultra-real, premium studio photograph of the exact jewelry piece from the reference image artfully placed among fine natural twigs, arranged to frame the jewellery without hiding it. Soft, directional lighting filters across the scene, creating gentle highlights on the jewelry and subtle shadows across the organic elements. Emphasize craftsmanship, gemstone clarity, and surface reflections through close-up composition while maintaining the background creative and luxurious. Shot on a high-end professional camera with perfect focus, balanced contrast, and refined styling, resulting in an elegant nature-inspired luxury visual.",
  },
  {
    id: "branch-wood",
    label: "Wood Grain",
    icon: "🪵",
    description: "Showcased on a smooth natural wood branch with visible grain patterns and warm contrast",
    gradient: "linear-gradient(135deg, #6b4a2a 0%, #8b6a4a 50%, #c0956a 100%)",
    prompt:
      "Create a hyper-real, studio-grade photograph of the exact jewelry piece from the reference image showcased on a smooth natural wood branch with visible grain patterns. Use sculpted studio lighting to create a dynamic interplay of light and shadow across both the branch and the jewellery. The organic warmth of the wood contrasts with the cool precision of polished metal and stones. Keep the background aesthetic and premium. Capture intricate detail and texture with a professional camera using macro precision, shallow depth of field, and flawless exposure for a high-end editorial aesthetic.",
  },
  {
    id: "branch-floating",
    label: "Floating Branch",
    icon: "✦",
    description: "Balanced on a suspended floating branch, creating a sense of lightness and harmony",
    gradient: "linear-gradient(135deg, #2a4a3a 0%, #4a6a5a 50%, #7a9a8a 100%)",
    prompt:
      "Create an ultra-high-definition, hyper-realistic studio photograph of the exact jewelry piece from the reference image balanced on a floating natural branch in a controlled studio environment. The branch appears suspended, creating a sense of lightness and harmony with the jewellery. Use precise studio lighting to highlight craftsmanship, metal shine, and gemstone sparkle while maintaining soft, natural shadows while keeping the background creative yet subtle. Shot on a professional high-end camera with cinematic clarity, perfect color balance, and refined composition, producing a sophisticated nature-meets-luxury visual.",
  },
];

function buildSolidColorPrompt(bgDesc: string): string {
  return (
    `A high quality studio photo of the exact jewelry piece from the reference image, perfectly centered against a ${bgDesc}. ` +
    "The lighting is broad and soft, achieved through a large overhead diffusion panel and bounce cards, creating luminous highlights and soft shadow transitions. " +
    "A subtle shadow pools directly beneath the piece, grounding it naturally within the frame. " +
    "The piece appears weightless yet precise — isolated from any visual noise on the clean studio backdrop. " +
    "Shot using a Phase One IQ4 with a 120mm macro lens at f/11, ISO 50, focus-stacked for edge-to-edge sharpness. " +
    "Razor-sharp focus across every detail — metal finish, gemstone clarity, engravings, surface reflections. " +
    "Replace ALL original background clutter and environmental elements with the specified studio backdrop. " +
    "The environment is serene and minimal, evoking quiet luxury and museum-level presentation."
  );
}

// ── Vintage Heritage dynamic prompt builder ───────────────────────────────────

interface VintageConfig {
  showFabric: boolean;
  fabricColor: string;
  fabricMaterial: string;
  showTable: boolean;
  tableMaterial: string;
  showVelvet: boolean;
  velvetColor: string;
}

const VINTAGE_FABRIC_COLORS = [
  { id: "ivory",      hex: "#F5EED8", zh: "象牙白",   en: "ivory" },
  { id: "warm-sand",  hex: "#C9A87A", zh: "暖沙色",   en: "warm sand" },
  { id: "dusty-blue", hex: "#7A9BB0", zh: "霧藍",     en: "dusty blue" },
  { id: "sage-green", hex: "#9BAE96", zh: "鼠尾草綠", en: "sage green" },
  { id: "tea-rose",   hex: "#C08080", zh: "茶玫瑰",   en: "tea rose" },
] as const;

const VINTAGE_FABRIC_MATERIALS = [
  { id: "linen",  zh: "亞麻", en: "linen" },
  { id: "silk",   zh: "絲緞", en: "silk satin" },
  { id: "cotton", zh: "棉布", en: "soft cotton" },
] as const;

const VINTAGE_TABLE_MATERIALS = [
  { id: "marble",     zh: "大理石",   en: "ivory white marble" },
  { id: "light-oak",  zh: "淺橡木",   en: "light oak wood" },
  { id: "terrazzo",   zh: "磨石子",   en: "light terrazzo" },
  { id: "limestone",  zh: "石灰岩",   en: "smooth limestone" },
  { id: "brass",      zh: "拉絲黃銅", en: "brushed brass" },
] as const;

const VINTAGE_VELVET_COLORS = [
  { id: "dusty-rose",    hex: "#C4908A", zh: "淡玫瑰", en: "dusty rose" },
  { id: "forest-green",  hex: "#5A7A55", zh: "森林綠", en: "forest green" },
  { id: "midnight-navy", hex: "#3B4D6B", zh: "午夜藍", en: "midnight navy" },
  { id: "charcoal",      hex: "#545454", zh: "炭灰",   en: "charcoal" },
  { id: "warm-cream",    hex: "#E0D0B8", zh: "暖奶白", en: "warm cream" },
] as const;

function buildVintagePrompt(config: VintageConfig): string {
  const elements: string[] = [];
  if (config.showFabric) {
    elements.push(
      `a piece of ${config.fabricColor} ${config.fabricMaterial} fabric softly draped in the scene background`
    );
  }
  if (config.showTable) {
    elements.push(
      `a minimalist neutral ${config.tableMaterial} surface or low pedestal supporting the jewelry`
    );
  }
  if (config.showVelvet) {
    elements.push(
      `a ${config.velvetColor} velvet cloth cushion beneath the jewelry`
    );
  }

  const sceneDesc =
    elements.length > 0
      ? `The scene features: ${elements.join("; ")}.`
      : "A clean, minimal vintage-inspired setting with warm neutral tones.";

  return (
    "Create a hyper-real, high-resolution studio photograph of the exact jewelry piece from the reference image styled in a classic vintage heritage-inspired setting. " +
    sceneDesc +
    " Use warm, directional studio lighting to create gentle highlights and natural shadows that emphasize craftsmanship, engraved details, and metal finish. " +
    "Color tones should feel slightly warm and muted, with refined contrast — evoking old-world elegance and timeless luxury. " +
    "Shot on a professional high-end camera (Hasselblad X2D, 90mm, f/5.6) with precise exposure and sharp focus, delivering a timeless luxury jewellery editorial image."
  );
}

// ── Types ────────────────────────────────────────────────────────────────────

type ContentType = "image" | "video";

interface SourceImage {
  id: string;
  url: string;
  file: File | null;
}

interface GeneratedImage {
  url: string;
  sourceId?: string; // which source image produced this
}

interface GeneratedVideo {
  url: string;
  duration?: string;
}

// Track individual task per source image
interface TaskInfo {
  sourceId: string;
  sourceUrl: string;
  taskId: string;
  status: string;
  taskType: "image" | "video"; // actual API type used when creating this task
}

// ── Aspect ratios ────────────────────────────────────────────────────────────

const IMAGE_RATIOS = [
  { value: "1:1", label: "1:1 Square" },
  { value: "4:3", label: "4:3 Landscape" },
  { value: "3:4", label: "3:4 Portrait" },
  { value: "16:9", label: "16:9 Wide" },
  { value: "9:16", label: "9:16 Story" },
  { value: "2:3", label: "2:3 Tall" },
  { value: "3:2", label: "3:2 Wide" },
];

const VIDEO_RATIOS = [
  { value: "16:9", label: "16:9 Landscape" },
  { value: "9:16", label: "9:16 Story/Reel" },
  { value: "1:1", label: "1:1 Square" },
];

// ── Branch style card (used inside branch picker sub-panel) ──────────────────

function BranchStyleCard({
  style,
  selected,
  onClick,
}: {
  style: BranchStyle;
  selected: boolean;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [imgError, setImgError] = useState(false);
  const previewSrc = `/templates/${style.id}.jpg`;

  return (
    <div
      className="relative"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        onClick={onClick}
        className={`w-full text-left rounded-xl border overflow-hidden transition-all ${
          selected
            ? "border-foreground shadow-sm ring-1 ring-foreground"
            : "border-border hover:border-foreground/30"
        }`}
      >
        <div className="aspect-square relative overflow-hidden">
          {!imgError ? (
            <img
              src={previewSrc}
              alt={style.label}
              className="w-full h-full object-cover"
              onError={() => setImgError(true)}
            />
          ) : (
            <div
              className="w-full h-full flex items-center justify-center text-2xl"
              style={{ background: style.gradient }}
            >
              {style.icon}
            </div>
          )}
          {selected && (
            <div className="absolute inset-0 bg-foreground/10 pointer-events-none" />
          )}
        </div>
        <div className={`px-2 py-1.5 text-center ${selected ? "bg-foreground text-background" : "bg-card"}`}>
          <p className="text-[10px] font-semibold leading-tight truncate">{style.label}</p>
        </div>
      </button>

      {hovered && (
        <div className="absolute z-50 w-56 rounded-2xl overflow-hidden border border-border shadow-2xl bottom-full mb-2 left-1/2 -translate-x-1/2 pointer-events-none">
          {!imgError ? (
            <div className="h-36 overflow-hidden">
              <img
                src={previewSrc}
                alt={style.label}
                className="w-full h-full object-cover"
              />
            </div>
          ) : (
            <div
              className="h-32 flex items-center justify-center text-4xl"
              style={{ background: style.gradient }}
            >
              {style.icon}
            </div>
          )}
          <div className="bg-card p-3">
            <h4 className="font-semibold text-xs mb-1">{style.label}</h4>
            <p className="text-[11px] text-muted leading-relaxed">{style.description}</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Studio background style card ─────────────────────────────────────────────

function StudioStyleCard({
  style,
  selected,
  onClick,
}: {
  style: StudioBgStyle;
  selected: boolean;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [imgError, setImgError] = useState(false);
  const previewSrc = `/templates/${style.id}.jpg`;

  return (
    <div
      className="relative"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        onClick={onClick}
        className={`w-full text-left rounded-xl border overflow-hidden transition-all ${
          selected
            ? "border-foreground shadow-sm ring-1 ring-foreground"
            : "border-border hover:border-foreground/30"
        }`}
      >
        <div className="aspect-square relative overflow-hidden">
          {!imgError ? (
            <img
              src={previewSrc}
              alt={style.label}
              className="w-full h-full object-cover"
              onError={() => setImgError(true)}
            />
          ) : (
            <div
              className="w-full h-full flex items-center justify-center text-2xl"
              style={{ background: style.gradient }}
            >
              {style.icon}
            </div>
          )}
          {selected && (
            <div className="absolute inset-0 bg-foreground/10 pointer-events-none" />
          )}
        </div>
        <div className={`px-2 py-1.5 text-center ${selected ? "bg-foreground text-background" : "bg-card"}`}>
          <p className="text-[10px] font-semibold leading-tight truncate">{style.label}</p>
        </div>
      </button>

      {hovered && (
        <div className="absolute z-50 w-56 rounded-2xl overflow-hidden border border-border shadow-2xl bottom-full mb-2 left-1/2 -translate-x-1/2 pointer-events-none">
          {!imgError ? (
            <div className="h-36 overflow-hidden">
              <img
                src={previewSrc}
                alt={style.label}
                className="w-full h-full object-cover"
              />
            </div>
          ) : (
            <div
              className="h-32 flex items-center justify-center text-4xl"
              style={{ background: style.gradient }}
            >
              {style.icon}
            </div>
          )}
          <div className="bg-card p-3">
            <h4 className="font-semibold text-xs mb-1">{style.label}</h4>
            <p className="text-[11px] text-muted leading-relaxed">{style.description}</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Component ────────────────────────────────────────────────────────────────

interface MarketingPanelProps {
  history: HistoryItem[];
  onAddHistory: (item: HistoryItem) => void;
  sharedResults: string[];
  onSharedResults: (urls: string[]) => void;
  onLoadingChange: (loading: boolean) => void;
  onProgressChange: (progress: string) => void;
  otherPageLoading: boolean;
  otherPageMode: string;
  onSwitchMode: (mode: "camera" | "inpaint" | "3d" | "marketing" | "lighting" | "usage") => void;
  logUsage?: (action: ApiAction, opts?: { status?: "success" | "error"; tokensIn?: number; tokensOut?: number; costOverride?: number; detail?: string }) => void;
}

export default function MarketingPanel({
  history,
  onAddHistory,
  sharedResults,
  onSharedResults,
  onLoadingChange,
  onProgressChange,
  otherPageLoading,
  otherPageMode,
  onSwitchMode,
  logUsage,
}: MarketingPanelProps) {
  const { t } = useI18n();

  // Content type
  const [contentType, setContentType] = useState<ContentType>("image");

  // Multiple source images
  const [sourceImages, setSourceImages] = useState<SourceImage[]>([]);

  // Character model reference images (for consistent model feature)
  const [characterImages, setCharacterImages] = useState<SourceImage[]>([]);
  const [characterDropOver, setCharacterDropOver] = useState(false);
  const characterInputRef = useRef<HTMLInputElement>(null);

  // Outfit reference images + description
  const [outfitImages, setOutfitImages] = useState<SourceImage[]>([]);
  const [outfitDropOver, setOutfitDropOver] = useState(false);
  const outfitInputRef = useRef<HTMLInputElement>(null);
  const [outfitDescription, setOutfitDescription] = useState("");

  // Template selection
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  // Solid-color template: selected background color/gradient id
  const [solidBgColor, setSolidBgColor] = useState<string>("white");
  // Natural-branches template: selected branch style id
  const [branchStyle, setBranchStyle] = useState<string>("branch-draped");
  // Packaging-box template: user-uploaded packaging reference images
  const [packagingImages, setPackagingImages] = useState<SourceImage[]>([]);
  const [packagingDropOver, setPackagingDropOver] = useState(false);
  const packagingInputRef = useRef<HTMLInputElement>(null);

  // Vintage-Heritage template: configurable scene elements
  const [vintageConfig, setVintageConfig] = useState<VintageConfig>({
    showFabric: true,
    fabricColor: "ivory",
    fabricMaterial: "linen",
    showTable: true,
    tableMaterial: "ivory white marble",
    showVelvet: true,
    velvetColor: "dusty rose",
  });

  // Settings
  const [aspectRatio, setAspectRatio] = useState("4:3");
  const [videoModel, setVideoModel] = useState<string>("kling-2.6");
  const [jewelryDimension, setJewelryDimension] = useState("");
  const [gemDimension, setGemDimension] = useState("");
  const [chainDimension, setChainDimension] = useState("");

  // Generation state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTasks, setActiveTasks] = useState<TaskInfo[]>([]);
  const [generatedImages, setGeneratedImages] = useState<GeneratedImage[]>([]);
  const [generatedVideo, setGeneratedVideo] = useState<GeneratedVideo | null>(null);
  const [maximizedImage, setMaximizedImage] = useState<string | null>(null);
  // For consistent-wearing video: user picks a generated image as video base
  const [videoBaseImage, setVideoBaseImage] = useState<string | null>(null);
  const [videoFromImageLoading, setVideoFromImageLoading] = useState(false);
  // Video prompt (user high-level text + AI-refined)
  const [videoPrompt, setVideoPrompt] = useState("");
  const [refiningPrompt, setRefiningPrompt] = useState(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [sourceDropOver, setSourceDropOver] = useState(false);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, []);

  // Sync loading & progress to parent so other pages can show indicator
  const prevLoadingRef = useRef(false);
  useEffect(() => {
    onLoadingChange(loading);
    // When loading finishes, share results to other pages
    if (prevLoadingRef.current && !loading && generatedImages.length > 0) {
      const urls = generatedImages.map((i) => i.url);
      onSharedResults(urls);
      prevSharedRef.current = urls;
    }
    prevLoadingRef.current = loading;
  }, [loading]);

  useEffect(() => {
    const pending = activeTasks.length;
    const done = generatedImages.length;
    if (loading && pending > 0) {
      onProgressChange(`Generating... (${done} done, ${pending} remaining)`);
    } else if (loading) {
      onProgressChange("Starting generation...");
    }
  }, [loading, activeTasks.length, generatedImages.length]);

  // Sync generated images from other pages via sharedResults
  const prevSharedRef = useRef<string[]>([]);
  useEffect(() => {
    if (
      sharedResults.length > 0 &&
      JSON.stringify(sharedResults) !== JSON.stringify(prevSharedRef.current)
    ) {
      prevSharedRef.current = sharedResults;
      setGeneratedImages(sharedResults.map((url) => ({ url })));
    }
  }, [sharedResults]);

  // Poll all active tasks
  useEffect(() => {
    if (activeTasks.length === 0) {
      if (pollingRef.current) clearInterval(pollingRef.current);
      return;
    }

    const poll = async () => {
      const stillActive: TaskInfo[] = [];

      for (const task of activeTasks) {
        try {
          const res = await fetch(`/api/kie?taskId=${task.taskId}&type=${task.taskType}`);
          const data = await res.json();

          // Treat transient network errors as retryable — keep polling
          if (data.error && (data.error === "fetch failed" || data.error.includes("fetch") || res.status >= 500)) {
            stillActive.push(task);
            continue;
          }

          if (data.error && data.status !== "generating" && data.status !== "waiting" && data.status !== "queuing") {
            setError((prev) => prev ? `${prev}\n${data.error}` : data.error);
            continue; // Drop this task — genuine API error
          }

          if (data.status === "success") {
            if (data.images && data.images.length > 0) {
              const newImages = data.images.map((img: { url: string }) => ({
                url: img.url,
                sourceId: task.sourceId,
              }));
              setGeneratedImages((prev) => [...prev, ...newImages]);
              // Add to history
              data.images.forEach((img: { url: string }) => {
                onAddHistory({
                  id: crypto.randomUUID(),
                  sourceUrl: task.sourceUrl,
                  resultUrl: img.url,
                  mode: "camera",
                  settings: { rotate: 0, forward: 0, vertical: 0, wide: false, prompt: "" },
                  timestamp: Date.now(),
                });
              });
            }
            if (data.videos && data.videos.length > 0) {
              setGeneratedVideo(data.videos[0]);
            }
            continue; // Task done, don't keep it active
          } else if (data.status === "fail") {
            setError((prev) => prev ? `${prev}\nFailed for one image` : "Generation failed for one image");
            continue;
          }

          // Still in progress
          stillActive.push({ ...task, status: data.status });
        } catch {
          stillActive.push(task); // Keep polling on network error
        }
      }

      setActiveTasks(stillActive);
      if (stillActive.length === 0) {
        setLoading(false);
      }
    };

    poll();
    pollingRef.current = setInterval(poll, 5000);

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [activeTasks.length > 0 ? JSON.stringify(activeTasks.map(t => t.taskId)) : "none"]);

  // Add a source image from URL
  const addSourceFromUrl = useCallback((url: string, file: File | null) => {
    setSourceImages((prev) => {
      // Don't add duplicates
      if (prev.some((s) => s.url === url)) return prev;
      return [...prev, { id: crypto.randomUUID(), url, file }];
    });
  }, []);

  // Remove a source image
  const removeSource = useCallback((id: string) => {
    setSourceImages((prev) => prev.filter((s) => s.id !== id));
  }, []);

  // Handle file input (browse)
  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!file.type.startsWith("image/")) continue;
      const localUrl = URL.createObjectURL(file);
      addSourceFromUrl(localUrl, file);
    }
    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [addSourceFromUrl]);

  // Handle drop on source area
  const handleSourceDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setSourceDropOver(false);

    // Check for history item drop
    const historyData = e.dataTransfer.getData("application/x-history-item");
    const droppedUrl = e.dataTransfer.getData("text/plain");

    if (historyData || (droppedUrl && droppedUrl.startsWith("http"))) {
      const url = historyData ? JSON.parse(historyData).resultUrl : droppedUrl;
      // Remote URL — store directly, uploadForReference will pass it through
      addSourceFromUrl(url, null);
      return;
    }

    // Normal file drop (can be multiple)
    const files = e.dataTransfer.files;
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!file.type.startsWith("image/")) continue;
      const localUrl = URL.createObjectURL(file);
      addSourceFromUrl(localUrl, file);
    }
  }, [addSourceFromUrl]);

  // ── Character model management ──
  const addCharacterFromUrl = useCallback((url: string, file: File | null) => {
    setCharacterImages((prev) => {
      if (prev.some((s) => s.url === url)) return prev;
      return [...prev, { id: crypto.randomUUID(), url, file }];
    });
  }, []);

  const removeCharacter = useCallback((id: string) => {
    setCharacterImages((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const handleCharacterFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!file.type.startsWith("image/")) continue;
      const localUrl = URL.createObjectURL(file);
      addCharacterFromUrl(localUrl, file);
    }
    if (characterInputRef.current) characterInputRef.current.value = "";
  }, [addCharacterFromUrl]);

  const handleCharacterDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setCharacterDropOver(false);
    const historyData = e.dataTransfer.getData("application/x-history-item");
    const droppedUrl = e.dataTransfer.getData("text/plain");
    if (historyData || (droppedUrl && droppedUrl.startsWith("http"))) {
      const url = historyData ? JSON.parse(historyData).resultUrl : droppedUrl;
      // Remote URL — store directly, no need to download (uploadForReference will pass it through)
      addCharacterFromUrl(url, null);
      return;
    }
    const files = e.dataTransfer.files;
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!file.type.startsWith("image/")) continue;
      addCharacterFromUrl(URL.createObjectURL(file), file);
    }
  }, [addCharacterFromUrl]);

  // ── Outfit management ──
  const addOutfitFromUrl = useCallback((url: string, file: File | null) => {
    setOutfitImages((prev) => {
      if (prev.some((s) => s.url === url)) return prev;
      return [...prev, { id: crypto.randomUUID(), url, file }];
    });
  }, []);

  const removeOutfit = useCallback((id: string) => {
    setOutfitImages((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const handleOutfitFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!file.type.startsWith("image/")) continue;
      addOutfitFromUrl(URL.createObjectURL(file), file);
    }
    if (outfitInputRef.current) outfitInputRef.current.value = "";
  }, [addOutfitFromUrl]);

  const handleOutfitDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setOutfitDropOver(false);
    const historyData = e.dataTransfer.getData("application/x-history-item");
    const droppedUrl = e.dataTransfer.getData("text/plain");
    if (historyData || (droppedUrl && droppedUrl.startsWith("http"))) {
      const url = historyData ? JSON.parse(historyData).resultUrl : droppedUrl;
      addOutfitFromUrl(url, null);
      return;
    }
    const files = e.dataTransfer.files;
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!file.type.startsWith("image/")) continue;
      addOutfitFromUrl(URL.createObjectURL(file), file);
    }
  }, [addOutfitFromUrl]);

  // ── Packaging image management ──
  const addPackagingFromUrl = useCallback((url: string, file: File | null) => {
    setPackagingImages((prev) => {
      if (prev.some((s) => s.url === url)) return prev;
      return [...prev, { id: crypto.randomUUID(), url, file }];
    });
  }, []);

  const removePackaging = useCallback((id: string) => {
    setPackagingImages((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const handlePackagingFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!file.type.startsWith("image/")) continue;
      addPackagingFromUrl(URL.createObjectURL(file), file);
    }
    if (packagingInputRef.current) packagingInputRef.current.value = "";
  }, [addPackagingFromUrl]);

  const handlePackagingDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setPackagingDropOver(false);
    const historyData = e.dataTransfer.getData("application/x-history-item");
    const droppedUrl = e.dataTransfer.getData("text/plain");
    if (historyData || (droppedUrl && droppedUrl.startsWith("http"))) {
      const url = historyData ? JSON.parse(historyData).resultUrl : droppedUrl;
      addPackagingFromUrl(url, null);
      return;
    }
    const files = e.dataTransfer.files;
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!file.type.startsWith("image/")) continue;
      addPackagingFromUrl(URL.createObjectURL(file), file);
    }
  }, [addPackagingFromUrl]);

  // Convert any image source to a PNG File using canvas (handles HEIC, WebP, etc.)
  const convertToPng = async (src: string): Promise<File> => {
    return new Promise((resolve, reject) => {
      const img = new window.Image() as HTMLImageElement;
      img.crossOrigin = "anonymous";
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("Canvas not supported"));
        ctx.drawImage(img, 0, 0);
        canvas.toBlob(
          (blob) => {
            if (!blob) return reject(new Error("Failed to convert image"));
            resolve(new File([blob], "image.png", { type: "image/png" }));
          },
          "image/png"
        );
      };
      img.onerror = () => reject(new Error("Failed to load image"));
      img.src = src;
    });
  };

  // Upload a source file to get a hosted URL
  const uploadForReference = async (src: SourceImage): Promise<string | null> => {
    const isRemote = src.url.startsWith("http://") || src.url.startsWith("https://");

    // For remote URLs, still convert to PNG to ensure Kie.ai compatibility
    // (remote URLs may point to HEIC, WebP, or other unsupported formats)
    let fileToUpload: File | null = null;

    if (isRemote) {
      // Check if URL already points to a supported image type
      const lowerUrl = src.url.toLowerCase().split("?")[0];
      if (lowerUrl.endsWith(".png") || lowerUrl.endsWith(".jpg") || lowerUrl.endsWith(".jpeg")) {
        return src.url;
      }
      // Try to convert unsupported formats (WebP, HEIC, etc.) to PNG
      try {
        fileToUpload = await convertToPng(src.url);
      } catch {
        // If conversion fails (CORS etc.), pass the URL through directly
        return src.url;
      }
    } else {
      // Handle blob URLs or local files
      fileToUpload = src.file ?? null;

      // If file is empty/dummy (e.g. from history drag), fetch the blob URL to get real data
      if (!fileToUpload || fileToUpload.size === 0) {
        if (src.url.startsWith("blob:")) {
          try {
            fileToUpload = await convertToPng(src.url);
          } catch {
            return null;
          }
        } else {
          return null;
        }
      } else {
        // Convert local file to PNG if it's not already PNG/JPG
        const type = fileToUpload.type;
        if (type !== "image/png" && type !== "image/jpeg") {
          try {
            const blobUrl = URL.createObjectURL(fileToUpload);
            fileToUpload = await convertToPng(blobUrl);
            URL.revokeObjectURL(blobUrl);
          } catch {
            // Keep original file if conversion fails
          }
        }
      }
    }

    if (!fileToUpload) return null;

    const formData = new FormData();
    formData.append("file", fileToUpload);
    try {
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const data = await res.json();
      return data.url || null;
    } catch {
      return null;
    }
  };

  // Analyze jewelry via OpenAI vision to get detailed description for video prompts
  const analyzeJewelryForVideo = async (imageUrl: string): Promise<string> => {
    try {
      const res = await fetch("/api/analyze-jewelry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image_url: imageUrl }),
      });
      const analysis = await res.json();
      if (analysis.error) {
        logUsage?.("analyze-jewelry", { status: "error", detail: analysis.error });
        return "";
      }
      logUsage?.("analyze-jewelry", { status: "success" });
      const { type, description } = analysis;
      return `The jewelry is a ${type || "piece"}: ${description || "luxury jewelry piece"}. `;
    } catch {
      return "";
    }
  };

  const VIDEO_CONSISTENCY_PREFIX =
    "ABSOLUTE STRICT RULE FOR VIDEO: The jewelry product shown in the video MUST be an EXACT, IDENTICAL match to the original product. " +
    "Every detail must be preserved — the exact shape, design, number and placement of gemstones, metal color and finish, proportions, engravings, settings, and overall craftsmanship. " +
    "Do NOT substitute, redesign, simplify, or alter the jewelry in ANY way. The product must look like the SAME physical object filmed in real life. " +
    "The jewelry is the undisputed hero and centerpiece of every frame. ";

  // Convert cm dimension + jewelry type into body-relative scale language
  const getSizePrompt = (type: string, bodyPlacement: string): string => {
    if (!jewelryDimension.trim()) return "";
    const raw = jewelryDimension.trim().toLowerCase();
    // Parse the largest number from input like "2×3", "1.5", "2x3cm"
    const nums = raw.match(/[\d.]+/g)?.map(Number).filter(n => !isNaN(n));
    if (!nums || nums.length === 0) return "";
    const maxCm = Math.max(...nums);
    const minCm = Math.min(...nums);

    // Body-relative comparisons keyed by jewelry type
    const tLower = type.toLowerCase();
    let sizeDesc = "";

    if (tLower.includes("ring")) {
      if (maxCm <= 1) sizeDesc = "a thin, delicate band — barely wider than the finger it sits on";
      else if (maxCm <= 2) sizeDesc = "a normal-sized ring — proportional to the finger, not oversized";
      else sizeDesc = "a statement ring — slightly larger than typical but still proportional to the hand";
    } else if (tLower.includes("earring")) {
      if (maxCm <= 1.5) sizeDesc = "tiny stud earrings — smaller than the earlobe, sitting flush against the ear";
      else if (maxCm <= 3) sizeDesc = "small drop earrings — roughly the length of the earlobe";
      else if (maxCm <= 5) sizeDesc = "medium earrings — extending slightly below the earlobe";
      else sizeDesc = "long dangling earrings — reaching toward the jawline but NOT touching the shoulder";
    } else if (tLower.includes("necklace") || tLower.includes("pendant")) {
      if (maxCm <= 1.5) sizeDesc = "a tiny, delicate pendant — about the size of a fingernail";
      else if (maxCm <= 3) sizeDesc = "a small pendant — roughly thumbnail-sized, sitting against the collarbone area";
      else if (maxCm <= 5) sizeDesc = "a medium pendant — about the width of two fingers side by side";
      else sizeDesc = "a larger pendant — but still much smaller than the palm of a hand";
    } else if (tLower.includes("bracelet") || tLower.includes("bangle")) {
      if (minCm <= 0.5) sizeDesc = "a thin, delicate chain bracelet — a fine line around the wrist";
      else if (minCm <= 1) sizeDesc = "a slim bracelet — about the width of a pencil, fitting snugly on the wrist";
      else sizeDesc = "a medium-width bracelet — but NOT a cuff, still proportional to the wrist";
    } else if (tLower.includes("brooch") || tLower.includes("pin")) {
      if (maxCm <= 2) sizeDesc = "a small brooch — about the size of a coin, pinned on fabric";
      else if (maxCm <= 4) sizeDesc = "a medium brooch — roughly the size of two coins side by side";
      else sizeDesc = "a larger brooch — but still fits within the palm of a hand";
    } else {
      // Generic fallback
      if (maxCm <= 1) sizeDesc = "a very tiny, delicate piece — smaller than a fingertip";
      else if (maxCm <= 3) sizeDesc = "a small piece — roughly thumbnail-sized";
      else if (maxCm <= 5) sizeDesc = "a medium-sized piece — about the width of two fingers";
      else sizeDesc = "a moderately sized piece — but still proportional to the body, NOT oversized";
    }

    const gemPart = gemDimension.trim()
      ? ` Gemstone diameter: ${gemDimension.trim()} — render each stone at this exact size, no enlargement.`
      : "";
    const chainPart = chainDimension.trim()
      ? ` Chain thickness: ${chainDimension.trim()} — the chain must appear fine and delicate at this exact width.`
      : "";

    return (
      `CRITICAL SIZE RULE: The jewelry is ${sizeDesc} (${raw} cm).${gemPart}${chainPart} ` +
      "Do NOT enlarge or exaggerate the jewelry. It must appear at REALISTIC proportions relative to the model's body. " +
      "If anything, err on the side of making it slightly SMALLER rather than bigger. " +
      "The jewelry should look like a real photograph — real jewelry is always small relative to the human body. "
    );
  };

  // For still-life templates: append size accuracy note when any dimension is filled.
  const getStillLifeSizeNote = (): string => {
    const parts: string[] = [];
    if (jewelryDimension.trim()) parts.push(`overall piece: ${jewelryDimension.trim()}`);
    if (gemDimension.trim()) parts.push(`gemstone: ${gemDimension.trim()}`);
    if (chainDimension.trim()) parts.push(`chain: ${chainDimension.trim()}`);
    if (parts.length === 0) return "";
    return ` IMPORTANT: Render the jewelry at physically accurate real-world proportions — ${parts.join(", ")}. Do NOT enlarge or exaggerate any component.`;
  };

  // Minimal shot prompts that ONLY change camera angle.
  // Every other element (pose, jewelry, outfit, body position) is locked to the source image.
  const buildWearingShotPrompts = () => {
    const lockRule =
      "CRITICAL: Preserve the EXACT pose, body position, jewelry, jewelry placement, wearing orientation, outfit, and skin from the reference images. " +
      "Only the camera position changes — do NOT change anything the model is wearing or doing.";
    return [
      {
        id: "closeup-front",
        label: "Close-Up Front",
        scenePrompt:
          "CAMERA: Tight close-up framing from the FRONT of the model, centered on the jewelry piece and the body area where it is worn. " +
          "Macro sharpness on the jewelry, soft shallow-DOF background. Refined studio-style key light that makes the gemstones sparkle. " +
          "Hasselblad H6D-100c, 120mm macro, f/2.8, ISO 64. " +
          lockRule,
      },
      {
        id: "closeup-side",
        label: "Close-Up Side",
        scenePrompt:
          "CAMERA: Tight close-up framing from a 45-degree SIDE angle (three-quarter view) of the same model. " +
          "Dramatic directional side light sculpts the jewelry form. Shallow depth of field. " +
          "Hasselblad H6D-100c, 100mm macro, f/3.2, ISO 64. " +
          lockRule,
      },
      {
        id: "closeup-above",
        label: "Close-Up Above",
        scenePrompt:
          "CAMERA: Tight close-up framing from a slightly ELEVATED angle (~30 degrees above), looking down onto the jewelry. " +
          "Overhead key light with soft fill. Extremely shallow depth of field. " +
          "Hasselblad H6D-100c, 90mm macro, f/2.8, ISO 64. " +
          lockRule,
      },
      {
        id: "lifestyle",
        label: "Daily Life",
        scenePrompt:
          "CAMERA: Waist-up or bust-up framing of the same model — close enough that the jewelry and the model's face are both clearly visible in a single frame. " +
          "Shoot in a tasteful real-world setting (sunlit café, art gallery, elegant street, rooftop). " +
          "The jewelry must be large and prominent in the frame — do NOT pull the camera back to show full-body or legs. " +
          "Natural ambient lighting, warm editorial color grading. Sony A1, 85mm, f/1.4, ISO 200. " +
          lockRule,
      },
    ];
  };

  // Cache jewelry analysis to avoid repeated API calls for 4 shots of same piece
  const jewelryAnalysisCache = useRef<Record<string, { type: string; description: string; body_placement: string; outfit_description: string | null }>>({});

  const analyzeJewelryCached = async (jewelryUrl: string) => {
    if (jewelryAnalysisCache.current[jewelryUrl]) return jewelryAnalysisCache.current[jewelryUrl];
    const res = await fetch("/api/analyze-jewelry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image_url: jewelryUrl }),
    });
    const analysis = await res.json();
    const result = analysis.error
      ? { type: "jewelry piece", description: "luxury jewelry", body_placement: "elegantly", outfit_description: null }
      : {
          type: analysis.type || "jewelry piece",
          description: analysis.description || "luxury jewelry",
          body_placement: analysis.body_placement || "elegantly",
          outfit_description: analysis.outfit_description || null,
        };
    logUsage?.("analyze-jewelry", { status: analysis.error ? "error" : "success" });
    jewelryAnalysisCache.current[jewelryUrl] = result;
    return result;
  };

  // Cache packaging analysis — keyed on packaging image URL
  const packagingAnalysisCache = useRef<Record<string, string>>({});

  const analyzePackagingCached = async (pkgUrl: string): Promise<string> => {
    if (packagingAnalysisCache.current[pkgUrl]) return packagingAnalysisCache.current[pkgUrl];
    try {
      const res = await fetch("/api/analyze-packaging", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image_url: pkgUrl }),
      });
      const analysis = await res.json();
      const prose: string = analysis.prose || "a luxury jewelry packaging box";
      logUsage?.("analyze-packaging", { status: analysis.error ? "error" : "success" });
      packagingAnalysisCache.current[pkgUrl] = prose;
      return prose;
    } catch {
      return "a luxury jewelry packaging box";
    }
  };

  // Cache character analysis — keyed on sorted URL list so same set of refs always hits cache
  const characterAnalysisCache = useRef<Record<string, string>>({});

  const analyzeCharacterCached = async (charUrls: string[]): Promise<string> => {
    const cacheKey = [...charUrls].sort().join("|");
    if (characterAnalysisCache.current[cacheKey]) return characterAnalysisCache.current[cacheKey];
    const res = await fetch("/api/analyze-character", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image_urls: charUrls.slice(0, 4) }),
    });
    const analysis = await res.json();
    const prose: string = analysis.prose || "an elegant model";
    logUsage?.("analyze-character", { status: analysis.error ? "error" : "success" });
    characterAnalysisCache.current[cacheKey] = prose;
    return prose;
  };

  // Build consistent wearing prompt.
  // Strategy: source image appears ONCE in refs (so the model doesn't try to
  // copy/paste it). Jewelry identity + wearing style are conveyed via DETAILED
  // TEXT from the analyze-jewelry API. This generates a fresh photo guided by
  // text + single visual ref instead of compositing from multiple copies.
  const buildConsistentWearingPrompt = (
    charProse: string,
    shotPrompt: string,
    numCharRefs: number,
    hasOutfitRefs: boolean,
    jewelryAnalysis: { type: string; description: string; body_placement: string; outfit_description: string | null }
  ): string => {
    const hasFaceRefs = numCharRefs > 0;
    const { type, description, body_placement, outfit_description } = jewelryAnalysis;

    const outfitRule = hasOutfitRefs
      ? "OUTFIT: The model must wear the outfit shown in the OUTFIT REFERENCE IMAGES. " +
        "Reproduce that outfit exactly — same garment type, fabric, color, cut, fit, neckline, sleeves, and accessories across all shots."
      : outfit_description
        ? `OUTFIT: The model must wear exactly this: ${outfit_description}. ` +
          "Reproduce the same garment type, fabric, color, neckline, and fit across all four shots."
        : "OUTFIT: The model should wear elegant, minimal clothing that does not compete with the jewelry.";

    return (
      "Generate a NEW, high-quality professional luxury jewelry campaign photograph. " +
      "This must look like a freshly shot photo — no compositing, no blending, no inpainting artifacts, no pasted regions.\n\n" +

      "CHARACTER / FACE:\n" +
      (hasFaceRefs
        ? `The last ${numCharRefs} reference image${numCharRefs > 1 ? "s" : ""} in image_input show the SPECIFIC person who must appear. ` +
          "Reproduce her exact facial features — bone structure, eye shape, nose, lips, jawline, skin tone, hair color, hair style, and hair texture. "
        : "") +
      (charProse ? charProse + " " : "") +
      "She must be recognizable as the SAME individual across all generated images.\n\n" +

      "JEWELRY — THE HERO OF THE SHOT:\n" +
      `The model is wearing a ${type}: ${description}. ` +
      `It is worn ${body_placement}. ` +
      getSizePrompt(type, body_placement) +
      "The FIRST reference image in image_input shows this EXACT piece already worn on a model — use it as the visual reference for the jewelry's exact appearance, design details, gemstones, metal finish, and proportions. " +
      "Your output must feature the SAME jewelry piece with the SAME design — do not invent a different piece, do not modify the design. " +
      "The piece must be worn on the SAME body part, at the SAME position. " +
      "Do not flip, mirror, or reposition it. The jewelry must be prominently visible and in sharp focus.\n\n" +

      outfitRule + "\n\n" +

      "CAMERA FOR THIS SHOT:\n" +
      shotPrompt + "\n\n" +

      "QUALITY: Professional, artifact-free, seamlessly generated photograph. " +
      "The entire image must be coherent — one unified shot, not a composite."
    );
  };

  const handleGenerate = async () => {
    if (sourceImages.length === 0) return;

    // Video mode: direct generation without template
    if (contentType === "video") {
      setLoading(true);
      setError(null);
      setGeneratedVideo(null);
      try {
        const newTasks: TaskInfo[] = [];
        for (const src of sourceImages) {
          const hostedUrl = await uploadForReference(src);
          if (!hostedUrl) continue;

          // For image-to-video: the input image IS the visual reference.
          // The text prompt should ONLY describe motion, camera, and behavior —
          // NOT describe the product appearance (that comes from the image).
          const userPrompt = videoPrompt.trim();
          const prompt = userPrompt
            ? `Animate this image into a video. ${userPrompt}. Keep the product and scene exactly as shown in the image.`
            : "Animate this image into a cinematic product video. Slow elegant camera movement, gentle rotation to showcase from multiple angles. Studio lighting, shallow depth of field, luxurious mood. Keep everything exactly as shown in the image.";

          const res = await fetch("/api/kie", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              type: "video",
              prompt,
              aspect_ratio: aspectRatio,
              video_model: videoModel,
              reference_image: hostedUrl,
            }),
          });
          const data = await res.json();
          if (data.error) {
            logUsage?.("video-generate", { status: "error", detail: data.error });
            setError((prev) => prev ? `${prev}\n${data.error}` : data.error);
            continue;
          }
          logUsage?.("video-generate", { status: "success", detail: "direct-video" });
          newTasks.push({
            sourceId: src.id,
            sourceUrl: src.url,
            taskId: data.taskId,
            status: "waiting",
            taskType: "video",
          });
        }
        if (newTasks.length === 0) throw new Error(t("mkt.failedToStart"));
        setActiveTasks(newTasks);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to start generation");
        setLoading(false);
      }
      return;
    }

    // Image mode: requires template
    if (!selectedTemplate) return;
    const template = TEMPLATES.find((t) => t.id === selectedTemplate);
    if (!template) return;

    const isConsistentFlow = template.id === "consistent-wearing";

    // Validate consistent templates require character references
    if (isConsistentFlow && characterImages.length === 0) {
      setError(t("char.needRefs"));
      return;
    }

    setLoading(true);
    setError(null);
    setGeneratedImages([]);
    setGeneratedVideo(null);

    try {
      // Upload all source images and get hosted URLs
      const uploadedSources: { id: string; url: string }[] = [];
      for (const src of sourceImages) {
        const hostedUrl = await uploadForReference(src);
        if (hostedUrl) {
          uploadedSources.push({ id: src.id, url: hostedUrl });
        }
      }

      if (uploadedSources.length === 0) {
        throw new Error(t("mkt.noValidSources"));
      }

      // Upload character images if needed for consistent templates
      let characterUrls: string[] = [];
      if (isConsistentFlow) {
        for (const ch of characterImages) {
          const hostedUrl = await uploadForReference(ch);
          if (hostedUrl) characterUrls.push(hostedUrl);
        }
      }

      // Fire API calls for each source image
      const newTasks: TaskInfo[] = [];

      for (const src of uploadedSources) {
        // Build prompt per image
        let prompt: string;
        let imageRefs: string[];

        if (isConsistentFlow) {
          // Upload outfit images if any
          let outfitUrls: string[] = [];
          for (const ot of outfitImages) {
            const hostedUrl = await uploadForReference(ot);
            if (hostedUrl) outfitUrls.push(hostedUrl);
          }

          // ── Image mode: fire 4 shots per jewelry piece ──
          // Kie nano-banana-pro cap: 8 reference images total.
          // Source appears ONCE (text description carries jewelry identity to avoid
          // the model trying to copy-paste / composite from repeated source images).
          // Budget: source ×1 (jewelry visual ref), outfit ×0-2, char fills remainder
          // Layout: [src, outfit?, outfit?, char, char, char, char, char?]
          const MAX_REFS = 8;
          const outfitSlots = Math.min(outfitUrls.length, 2);
          const charSlots = MAX_REFS - 1 - outfitSlots; // 1 for source
          let charRefs = [...characterUrls];
          while (charRefs.length < charSlots && charRefs.length < characterUrls.length * 4) {
            charRefs = [...charRefs, ...characterUrls];
          }
          charRefs = charRefs.slice(0, charSlots);
          const numCharRefs = charRefs.length;
          const refs = [
            src.url,
            ...outfitUrls.slice(0, outfitSlots),
            ...charRefs,
          ].slice(0, MAX_REFS);

          // Build 4 shot prompts
          const shots = buildWearingShotPrompts();

          // Get text-based face description + detailed jewelry analysis
          const charProse = characterUrls.length > 0
            ? await analyzeCharacterCached(characterUrls)
            : "";
          const wearingAnalysis = await analyzeJewelryCached(src.url);

          for (const shot of shots) {
            const shotPrompt = buildConsistentWearingPrompt(charProse, shot.scenePrompt, numCharRefs, outfitUrls.length > 0, wearingAnalysis);

            const shotRes = await fetch("/api/kie", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                type: "image",
                prompt: shotPrompt,
                aspect_ratio: shot.id.startsWith("closeup") ? "1:1" : aspectRatio,
                resolution: "2K",
                image_input: refs,
              }),
            });
            const shotData = await shotRes.json();

            if (shotData.error) {
              logUsage?.("image-generate", { status: "error", detail: shotData.error });
              setError((prev) => prev ? `${prev}\n${shot.label}: ${shotData.error}` : `${shot.label}: ${shotData.error}`);
              continue;
            }

            logUsage?.("image-generate", { status: "success", detail: shot.label });
            newTasks.push({
              sourceId: src.id,
              sourceUrl: src.url,
              taskId: shotData.taskId,
              status: "waiting",
              taskType: "image",
            });
          }
          continue; // Skip the single-task creation below
        } else if (template.id === "solid-color") {
          const studioStyle = STUDIO_BG_STYLES.find((s) => s.id === solidBgColor);
          if (studioStyle) {
            prompt = CONSISTENCY_PREFIX + studioStyle.prompt;
          } else {
            const colorOpt = SOLID_BG_COLORS.find((c) => c.id === solidBgColor);
            const bgDesc = colorOpt?.desc ?? "pure white seamless studio background, hex #FFFFFF";
            prompt = CONSISTENCY_PREFIX + buildSolidColorPrompt(bgDesc);
          }
          imageRefs = [src.url];
        } else if (template.id === "packaging-box") {
          if (packagingImages.length > 0) {
            // Upload the first packaging image and get its hosted URL
            const pkgHosted = await uploadForReference(packagingImages[0]);
            if (pkgHosted) {
              // Analyze packaging with GPT-4o to get a text description
              const pkgProse = await analyzePackagingCached(pkgHosted);

              // GPT-Image-2: packaging ×6 first (dominant scene anchor),
              // jewelry ×2 last (item to place inside). 8 total, well within 16 limit.
              const gptInputUrls = [
                pkgHosted, pkgHosted, pkgHosted, pkgHosted, pkgHosted, pkgHosted, // pkg ×6
                src.url, src.url, // jewelry ×2
              ];

              prompt =
                "You are a luxury product photographer. " +
                "The first 6 images all show the SAME packaging. " +
                (pkgProse ? `Packaging description: ${pkgProse} ` : "") +
                "Reproduce this EXACT packaging — same box type, shape, exterior color, finish, material, branding, logo, and interior cushion or tray. Open the lid naturally. Do NOT invent or substitute a different box. " +
                "The last 2 images show the jewelry piece to place inside. " +
                "Reproduce the jewelry exactly — same design, gemstones, metal color, finish, and proportions. " +
                "Place the jewelry naturally inside the open packaging, resting on the interior cushion or tray. " +
                "Hyper-real studio photography, soft highlights, gentle shadows, minimal clean background. " +
                "One unified freshly shot luxury photograph.";

              // Fire directly via Kie with GPT-Image-2 model — uses same polling system
              const gptRes = await fetch("/api/kie", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  type: "image",
                  model: "gpt-image-2-image-to-image",
                  prompt,
                  input_urls: gptInputUrls,
                }),
              });
              const gptData = await gptRes.json();

              if (gptData.error) {
                logUsage?.("image-generate", { status: "error", detail: gptData.error });
                setError((prev) => prev ? `${prev}\n${gptData.error}` : gptData.error);
              } else {
                logUsage?.("image-generate", { status: "success", detail: "packaging-box GPT-Image-2" });
                newTasks.push({
                  sourceId: src.id,
                  sourceUrl: src.url,
                  taskId: gptData.taskId,
                  status: "waiting",
                  taskType: "image",
                });
              }
              continue; // skip the regular nano-banana-2 call below
            } else {
              // Upload failed — fall back to default
              imageRefs = [src.url];
              prompt = CONSISTENCY_PREFIX +
                "Create a hyper-real studio photograph of the exact jewelry piece from the reference image elegantly placed inside an open rigid jewellery box with a soft plush cushion interior. Studio lighting, minimal background, luxury aesthetic.";
            }
          } else {
            // No custom packaging uploaded: fall back to default luxury box prompt
            prompt =
              CONSISTENCY_PREFIX +
              "Create a hyper-real, ultra high-resolution studio photograph of the exact jewelry piece from the reference image elegantly placed inside an open rigid jewellery box with a soft, plush cushion interior. The jewelry rests naturally, following the contours of the cushion, highlighting its craftsmanship, polished metal, and gemstone brilliance. Use controlled studio lighting to create refined highlights and gentle shadows that enhance depth and texture. The exterior of the box should feel minimal and luxurious, with a clean background that keeps attention on the jewellery. Shot on a professional high-end camera with perfect exposure, sharp focus, and cinematic depth of field for a refined luxury brand aesthetic.";
            imageRefs = [src.url];
          }
        } else if (template.id === "natural-branches") {
          const style = BRANCH_STYLES.find((s) => s.id === branchStyle);
          prompt = CONSISTENCY_PREFIX + (style?.prompt ?? BRANCH_STYLES[0].prompt) + getStillLifeSizeNote();
          imageRefs = [src.url];
        } else if (template.id === "vintage-inspired") {
          prompt = CONSISTENCY_PREFIX + buildVintagePrompt(vintageConfig) + getStillLifeSizeNote();
          imageRefs = [src.url];
        } else {
          prompt = CONSISTENCY_PREFIX + template.prompt + getStillLifeSizeNote();
          imageRefs = [src.url];
        }

        const res = await fetch("/api/kie", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "image",
            prompt,
            aspect_ratio: aspectRatio,
            resolution: "2K",
            image_input: imageRefs.length > 0 ? imageRefs : undefined,
          }),
        });
        const data = await res.json();

        if (data.error) {
          logUsage?.("image-generate", { status: "error", detail: data.error });
          setError((prev) => prev ? `${prev}\n${data.error}` : data.error);
          continue;
        }

        logUsage?.("image-generate", { status: "success", detail: template.label });
        newTasks.push({
          sourceId: src.id,
          sourceUrl: src.url,
          taskId: data.taskId,
          status: "waiting",
          taskType: "image",
        });
      }

      if (newTasks.length === 0) {
        throw new Error(t("mkt.failedToStart"));
      }

      setActiveTasks(newTasks);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start generation");
      setLoading(false);
    }
  };

  // ── Generate video from a selected generated image (consistent-wearing workflow) ──
  const handleGenerateVideoFromImage = async (baseImageUrl: string) => {
    if (!selectedTemplate || selectedTemplate !== "consistent-wearing") return;
    if (sourceImages.length === 0) return;

    setVideoFromImageLoading(true);
    setVideoBaseImage(baseImageUrl);
    setError(null);
    setGeneratedVideo(null);

    try {
      // Use the first source image (jewelry) for analysis
      const jewelrySrc = sourceImages[0];
      const hostedJewelryUrl = await uploadForReference(jewelrySrc);
      if (!hostedJewelryUrl) throw new Error("Failed to upload jewelry image");

      // Analyze jewelry type for a brief prompt mention
      const { type: jType, body_placement: jPlace } =
        await analyzeJewelryCached(hostedJewelryUrl);

      // Keep prompt concise — Kling has a text length limit.
      // The reference image already shows the person, outfit, and jewelry.
      const videoPrompt =
        "Animate this reference image into a cinematic luxury jewelry campaign video. " +
        "The model slowly turns to showcase the jewelry from multiple angles. " +
        `She is wearing a ${jType} ${jPlace}. ` +
        (jewelryDimension ? `The jewelry is small — ${jewelryDimension} cm, keep realistic scale. ` : "") +
        "Preserve her exact face, outfit, and jewelry throughout. " +
        "Smooth elegant motion, studio lighting, shallow depth of field, luxurious mood.";

      const videoRes = await fetch("/api/kie", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "video",
          prompt: videoPrompt,
          aspect_ratio: aspectRatio,
          video_model: videoModel,
          reference_image: baseImageUrl,
        }),
      });
      const videoData = await videoRes.json();

      if (videoData.error) {
        logUsage?.("video-generate", { status: "error", detail: videoData.error });
        setError(videoData.error);
        setVideoFromImageLoading(false);
        return;
      }

      logUsage?.("video-generate", { status: "success", detail: "Video from image" });

      // Poll for video result
      const taskId = videoData.taskId;
      const pollVideo = setInterval(async () => {
        try {
          const pollRes = await fetch(
            `/api/kie?taskId=${taskId}&type=video`
          );
          const pollData = await pollRes.json();

          if (pollData.status === "success") {
            clearInterval(pollVideo);
            const videoUrl =
              pollData.videos?.[0]?.url || pollData.videos?.[0];
            if (videoUrl) {
              setGeneratedVideo({ url: videoUrl });
              onAddHistory({
                id: `vid-${Date.now()}`,
                sourceUrl: baseImageUrl,
                resultUrl: videoUrl,
                mode: "video",
                settings: { rotate: 0, forward: 0, vertical: 0, wide: false, prompt: "Consistent model video" },
                timestamp: Date.now(),
              });
            }
            setVideoFromImageLoading(false);
            setVideoBaseImage(null);
          } else if (pollData.status === "fail") {
            clearInterval(pollVideo);
            setError(pollData.error || "Video generation failed");
            setVideoFromImageLoading(false);
            setVideoBaseImage(null);
          }
        } catch {
          clearInterval(pollVideo);
          setError("Failed to poll video status");
          setVideoFromImageLoading(false);
          setVideoBaseImage(null);
        }
      }, 5000);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to start video generation"
      );
      setVideoFromImageLoading(false);
      setVideoBaseImage(null);
    }
  };

  // ── AI Refine prompt ──
  const handleRefinePrompt = async () => {
    if (!videoPrompt.trim() || refiningPrompt) return;
    setRefiningPrompt(true);
    try {
      // Optionally send first source image for context
      let imageUrl: string | undefined;
      if (sourceImages.length > 0) {
        const hosted = await uploadForReference(sourceImages[0]);
        if (hosted) imageUrl = hosted;
      }
      const res = await fetch("/api/refine-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: videoPrompt, image_url: imageUrl }),
      });
      const data = await res.json();
      if (data.prompt) {
        setVideoPrompt(data.prompt);
      } else if (data.error) {
        setError(data.error);
      }
    } catch {
      setError("Failed to refine prompt");
    } finally {
      setRefiningPrompt(false);
    }
  };

  const canGenerate = contentType === "video"
    ? sourceImages.length > 0 && !loading
    : !!selectedTemplate && sourceImages.length > 0 && !loading;
  const isConsistentModel = selectedTemplate === "consistent-wearing";
  const isConsistentModelVideo = isConsistentModel && contentType === "video";
  const ratios = contentType === "video" ? VIDEO_RATIOS : IMAGE_RATIOS;
  const completedCount = generatedImages.length;
  const totalCount = generatedImages.length + activeTasks.length;

  return (
    <div className="space-y-5">
      {/* Content Type Toggle */}
      <div className="flex items-center gap-2">
        {(
          [
            { key: "image" as const, icon: Image, labelKey: "mkt.staticImage" as const },
            { key: "video" as const, icon: Video, labelKey: "mkt.video" as const },
          ]
        ).map(({ key, icon: Icon, labelKey }) => (
          <button
            key={key}
            onClick={() => {
              setContentType(key);
              setAspectRatio(key === "video" ? "16:9" : "4:3");
              setGeneratedImages([]);
              setGeneratedVideo(null);
              setError(null);
            }}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-medium transition-all border ${
              contentType === key
                ? "bg-foreground text-background border-foreground shadow-sm"
                : "bg-card text-muted border-border hover:border-foreground/20 hover:text-foreground"
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {t(labelKey)}
          </button>
        ))}
      </div>

      {/* Other page generation banner */}
      {otherPageLoading && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-card border border-border shadow-sm animate-pulse">
          <Loader2 className="w-4 h-4 animate-spin text-foreground shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground">
              {otherPageMode === "3d" ? "3D" : otherPageMode === "inpaint" ? t("mode.edit") : t("mode.camera")} {t("mkt.contentGenerating")}
            </p>
            <p className="text-xs text-muted">{t("mkt.inProgress")}</p>
          </div>
          <button
            onClick={() => onSwitchMode(otherPageMode as "camera" | "inpaint" | "3d")}
            className="shrink-0 px-3 py-1.5 rounded-full bg-foreground text-background text-xs font-medium hover:bg-primary-hover transition-all"
          >
            {t("mkt.view")}
          </button>
        </div>
      )}

      {/* ── Source Images + Generated Result side by side ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-stretch">
        {/* Left: Source Images (multi) */}
        <div className="flex flex-col gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">
            {t("mkt.sourceImages")}
          </h2>
          <p className="text-[10px] text-muted/60">
            {t("mkt.sourceHint")}
          </p>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleFileSelect}
            className="hidden"
          />

          <div
            className={`flex-1 min-h-[320px] rounded-2xl border-2 transition-all ${
              sourceDropOver
                ? "border-primary border-dashed bg-primary/5"
                : sourceImages.length === 0
                  ? "border-dashed border-border"
                  : "border-border border-solid"
            }`}
            onDragOver={(e) => {
              e.preventDefault();
              setSourceDropOver(true);
            }}
            onDragLeave={() => setSourceDropOver(false)}
            onDrop={handleSourceDrop}
          >
            {sourceImages.length === 0 ? (
              /* Empty state */
              <div
                className="flex flex-col items-center justify-center h-full p-8 cursor-pointer"
                onClick={() => fileInputRef.current?.click()}
              >
                <div className="p-5 rounded-full bg-card border border-border shadow-sm">
                  <Upload className="w-6 h-6 text-muted" />
                </div>
                <p className="text-sm font-medium text-foreground mt-5">
                  {t("mkt.dropHere")}
                </p>
                <p className="text-xs text-muted mt-1.5">
                  {t("mkt.multiFormat")}
                </p>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    fileInputRef.current?.click();
                  }}
                  className="mt-4 px-5 py-2 rounded-full bg-foreground text-background text-sm font-medium hover:bg-primary-hover transition-all shadow-sm"
                >
                  {t("upload.browse")}
                </button>
              </div>
            ) : (
              /* Grid of source images */
              <div className="p-3">
                <div className={`grid gap-2 ${
                  sourceImages.length === 1 ? "grid-cols-1" : "grid-cols-2 sm:grid-cols-3"
                }`}>
                  {sourceImages.map((src) => (
                    <div
                      key={src.id}
                      className="group relative rounded-xl overflow-hidden border border-border bg-card aspect-square"
                    >
                      <img
                        src={src.url}
                        alt="Source"
                        className="w-full h-full object-cover"
                        crossOrigin="anonymous"
                      />
                      {!loading && (
                        <button
                          onClick={() => removeSource(src.id)}
                          className="absolute top-1.5 right-1.5 p-1 rounded-full bg-white/90 hover:bg-danger hover:text-white transition-all opacity-0 group-hover:opacity-100 shadow-sm"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  ))}
                  {/* Add more button */}
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border hover:border-foreground/20 hover:bg-card/50 transition-all aspect-square"
                  >
                    <Plus className="w-5 h-5 text-muted" />
                    <span className="text-[10px] text-muted mt-1">{t("mkt.addMore")}</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right: Generated Result */}
        <div className="flex flex-col gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">
            {isConsistentModelVideo
              ? t("mkt.pickForVideo")
              : contentType === "video"
                ? t("mkt.generatedVideo")
                : t("mkt.generatedImages")}
          </h2>
          {isConsistentModelVideo && !loading && generatedImages.length > 0 && !videoFromImageLoading ? (
            <p className="text-[10px] text-primary font-medium">
              {t("mkt.clickVideo")}
            </p>
          ) : (
            <div className="h-[18px]" />
          )}

          {error && (
            <div className="p-3 rounded-2xl bg-red-50 border border-red-200 text-sm text-red-700 whitespace-pre-line">
              {error}
            </div>
          )}

          {/* Loading state with progress */}
          {loading && (
            <div className="flex-1 flex flex-col rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
              {/* Already-completed images show at top */}
              {generatedImages.length > 0 && (
                <div className={`grid gap-2 p-3 ${
                  generatedImages.length === 1 ? "grid-cols-1" : "grid-cols-2"
                }`}>
                  {generatedImages.map((img, i) => (
                    <div
                      key={i}
                      className="group relative rounded-xl overflow-hidden border border-border bg-card cursor-pointer"
                      onClick={() => setMaximizedImage(img.url)}
                    >
                      <img
                        src={img.url}
                        alt={`Generated ${i + 1}`}
                        className="w-full h-auto object-contain"
                        crossOrigin="anonymous"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                        <div className="absolute bottom-2 right-2">
                          <Maximize2 className="w-4 h-4 text-white" />
                        </div>
                      </div>
                    </div>
                  ))}
                  {/* Placeholder slots for remaining tasks */}
                  {activeTasks.map((task) => (
                    <div
                      key={task.taskId}
                      className="flex flex-col items-center justify-center rounded-xl border border-border bg-card/50 aspect-square"
                    >
                      <Loader2 className="w-5 h-5 animate-spin text-muted" />
                      <p className="text-[10px] text-muted mt-2">
                        {task.status === "generating" ? t("mkt.generatingDots") : t("mkt.queued")}
                      </p>
                    </div>
                  ))}
                </div>
              )}
              {/* Progress bar when no images yet */}
              {generatedImages.length === 0 && (
                <div className="flex-1 flex flex-col items-center justify-center p-8">
                  <Loader2 className="w-8 h-8 animate-spin text-foreground" />
                  <p className="text-sm font-medium mt-5">
                    {t("mkt.generatingCount")} {totalCount} {totalCount !== 1 ? t("mkt.images") : t("mkt.image")}...
                  </p>
                  <p className="text-xs text-muted mt-1">
                    {completedCount} {t("mkt.of")} {totalCount} {t("mkt.completed")}
                  </p>
                  <div className="w-48 h-1.5 rounded-full bg-border mt-4 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-foreground/70 transition-all duration-500"
                      style={{ width: totalCount > 0 ? `${Math.max(5, (completedCount / totalCount) * 100)}%` : "5%" }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Generated images (done) */}
          {!loading && generatedImages.length > 0 && (
            <div className="flex-1 flex flex-col gap-3">
              <div className={`grid gap-3 ${
                generatedImages.length === 1 ? "grid-cols-1" : "grid-cols-2"
              }`}>
                {generatedImages.map((img, i) => (
                  <div
                    key={i}
                    className={`group relative rounded-2xl overflow-hidden border bg-card shadow-sm ${
                      videoBaseImage === img.url
                        ? "border-primary ring-2 ring-primary/30"
                        : "border-border"
                    } ${isConsistentModel ? "" : "cursor-pointer"}`}
                    onClick={() => {
                      if (!isConsistentModel) setMaximizedImage(img.url);
                    }}
                  >
                    <img
                      src={img.url}
                      alt={`Generated ${i + 1}`}
                      className={`w-full h-auto object-contain transition-opacity ${
                        videoFromImageLoading && videoBaseImage === img.url ? "opacity-50" : ""
                      }`}
                      crossOrigin="anonymous"
                    />
                    {/* Loading overlay when this image is being used for video */}
                    {videoFromImageLoading && videoBaseImage === img.url && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/30">
                        <Loader2 className="w-8 h-8 animate-spin text-white" />
                        <p className="text-xs text-white font-medium mt-2">
                          {t("mkt.generatingVideo")}
                        </p>
                      </div>
                    )}
                    {/* Always-visible "Generate Video" button for consistent-wearing + video */}
                    {isConsistentModel && !videoFromImageLoading && (
                      <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/70 to-transparent z-20">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            handleGenerateVideoFromImage(img.url);
                          }}
                          className="w-full px-3 py-2 rounded-xl bg-white text-foreground text-xs font-semibold hover:bg-primary hover:text-white transition-all shadow-md flex items-center justify-center gap-1.5"
                          title="Generate video from this image"
                        >
                          <Play className="w-3.5 h-3.5" />
                          {t("mkt.generateVideoFromThis")}
                        </button>
                      </div>
                    )}
                    {/* Hover overlay with maximize/download */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity z-10 pointer-events-none">
                      <div className="absolute top-3 right-3 flex gap-2 pointer-events-auto">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setMaximizedImage(img.url);
                          }}
                          className="p-2 rounded-full bg-white/90 hover:bg-white transition-all shadow-sm"
                          title="Maximize"
                        >
                          <Maximize2 className="w-3.5 h-3.5 text-foreground" />
                        </button>
                        <a
                          href={img.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="p-2 rounded-full bg-white/90 hover:bg-white transition-all shadow-sm"
                          title="Download"
                        >
                          <Download className="w-3.5 h-3.5 text-foreground" />
                        </a>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <button
                onClick={handleGenerate}
                disabled={!canGenerate || videoFromImageLoading}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-full bg-card border border-border text-sm font-medium hover:bg-card-hover transition-all disabled:opacity-30"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                {t("mkt.regenerateImages")}
              </button>
            </div>
          )}

          {/* Generated video */}
          {!loading && generatedVideo && (
            <div className="flex-1 flex flex-col gap-3">
              <div className="rounded-2xl overflow-hidden border border-border bg-card shadow-sm">
                <video
                  src={generatedVideo.url}
                  controls
                  autoPlay
                  loop
                  muted
                  playsInline
                  className="w-full"
                  crossOrigin="anonymous"
                />
                <div className="flex items-center justify-between px-4 py-3 border-t border-border">
                  <div className="flex items-center gap-1.5 text-xs text-muted">
                    <Play className="w-3 h-3" />
                    {aspectRatio} · Kling
                  </div>
                  <a
                    href={generatedVideo.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-xs text-foreground hover:text-primary-hover transition-colors"
                  >
                    <Download className="w-3 h-3" />
                    {t("result.download")}
                  </a>
                </div>
              </div>
              <button
                onClick={handleGenerate}
                disabled={!canGenerate}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-full bg-card border border-border text-sm font-medium hover:bg-card-hover transition-all disabled:opacity-30"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                {t("mkt.regenerate")}
              </button>
            </div>
          )}

          {/* Empty state */}
          {!loading && generatedImages.length === 0 && !generatedVideo && !error && (
            <div className="flex-1 flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card/50 p-8">
              <div className="p-4 rounded-full bg-card border border-border">
                {contentType === "video" ? (
                  <Video className="w-6 h-6 text-muted/30" />
                ) : (
                  <Image className="w-6 h-6 text-muted/30" />
                )}
              </div>
              <p className="text-sm text-muted mt-4">
                {isConsistentModelVideo
                  ? t("mkt.emptyPickFirst")
                  : contentType === "video"
                    ? t("mkt.emptyGenVideo")
                    : t("mkt.emptyGenImages")}
              </p>
              <p className="text-xs text-muted/60 mt-1">
                {isConsistentModelVideo
                  ? t("mkt.emptyStep")
                  : t("mkt.emptyTheme")}
              </p>
            </div>
          )}

          {/* Aspect ratio + Generate inline */}
          <div className="flex items-end gap-3 mt-auto pt-2">
            <div className="shrink-0">
              <label className="text-[11px] font-medium text-foreground/70 mb-1 block">
                {t("mkt.aspectRatio")}
              </label>
              <select
                value={aspectRatio}
                onChange={(e) => setAspectRatio(e.target.value)}
                className="px-3 py-2 rounded-xl bg-card border border-border text-sm focus:outline-none focus:border-foreground/30 focus:ring-1 focus:ring-foreground/10 transition-all appearance-none"
              >
                {ratios.map((ar) => (
                  <option key={ar.value} value={ar.value}>
                    {ar.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="shrink-0">
              <label className="text-[11px] font-medium text-foreground/70 mb-1 block">
                {t("mkt.pieceSize")}
              </label>
              <input
                type="text"
                value={jewelryDimension}
                onChange={(e) => setJewelryDimension(e.target.value)}
                placeholder="e.g. 2×3cm"
                className="w-24 px-3 py-2 rounded-xl bg-card border border-border text-sm focus:outline-none focus:border-foreground/30 focus:ring-1 focus:ring-foreground/10 transition-all placeholder:text-muted/40"
              />
            </div>
            <div className="shrink-0">
              <label className="text-[11px] font-medium text-foreground/70 mb-1 block">
                {t("mkt.gemSize")}
              </label>
              <input
                type="text"
                value={gemDimension}
                onChange={(e) => setGemDimension(e.target.value)}
                placeholder="e.g. 5mm"
                className="w-20 px-3 py-2 rounded-xl bg-card border border-border text-sm focus:outline-none focus:border-foreground/30 focus:ring-1 focus:ring-foreground/10 transition-all placeholder:text-muted/40"
              />
            </div>
            <div className="shrink-0">
              <label className="text-[11px] font-medium text-foreground/70 mb-1 block">
                {t("mkt.chainSize")}
              </label>
              <input
                type="text"
                value={chainDimension}
                onChange={(e) => setChainDimension(e.target.value)}
                placeholder="e.g. 1mm"
                className="w-20 px-3 py-2 rounded-xl bg-card border border-border text-sm focus:outline-none focus:border-foreground/30 focus:ring-1 focus:ring-foreground/10 transition-all placeholder:text-muted/40"
              />
            </div>
            {contentType === "video" && (
              <div className="shrink-0">
                <label className="text-[11px] font-medium text-foreground/70 mb-1 block">
                  {t("mkt.videoModel")}
                </label>
                <select
                  value={videoModel}
                  onChange={(e) => setVideoModel(e.target.value)}
                  className="px-3 py-2 rounded-xl bg-card border border-border text-sm focus:outline-none focus:border-foreground/30 focus:ring-1 focus:ring-foreground/10 transition-all appearance-none"
                >
                  <option value="kling-2.6">{t("videoModel.best")}</option>
                  <option value="kling-3.0">{t("videoModel.latest")}</option>
                  <option value="kling-2.5-turbo">{t("videoModel.fast")}</option>
                </select>
              </div>
            )}
            <button
              onClick={handleGenerate}
              disabled={!canGenerate}
              className="flex-1 flex items-center justify-center gap-2 px-6 py-2.5 rounded-full bg-foreground text-background font-medium text-sm hover:bg-primary-hover transition-all disabled:opacity-30 disabled:cursor-not-allowed shadow-sm"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {t("mkt.generatingCount")} {completedCount}/{totalCount}...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  {isConsistentModelVideo
                    ? `${t("mkt.generateImagesFirst")}${sourceImages.length > 1 ? ` (${sourceImages.length})` : ""}`
                    : `${contentType === "video" ? t("mkt.generateVideo") : t("mkt.generateImages")}${sourceImages.length > 1 ? ` (${sourceImages.length})` : ""}`}
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* ── Character Model Reference (image mode only) ── */}
      {contentType !== "video" && (selectedTemplate === "consistent-wearing" || characterImages.length > 0) && (
        <div className="rounded-2xl border border-border bg-card/50 p-4">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">
                {t("char.title")}
              </h2>
              <p className="text-[10px] text-muted/60 mt-0.5">
                {t("char.hint")}
              </p>
            </div>
            <button
              onClick={() => characterInputRef.current?.click()}
              disabled={loading}
              className="px-3 py-1.5 rounded-full bg-foreground text-background text-xs font-medium hover:bg-primary-hover transition-all disabled:opacity-30"
            >
              <Upload className="w-3 h-3 inline mr-1 -mt-0.5" />
              {t("char.uploadPhotos")}
            </button>
          </div>

          <input
            ref={characterInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleCharacterFileSelect}
            className="hidden"
          />

          <div
            className={`rounded-xl border-2 transition-all min-h-[80px] ${
              characterDropOver
                ? "border-primary border-dashed bg-primary/5"
                : characterImages.length === 0
                  ? "border-dashed border-border"
                  : "border-border border-solid"
            }`}
            onDragOver={(e) => {
              e.preventDefault();
              setCharacterDropOver(true);
            }}
            onDragLeave={() => setCharacterDropOver(false)}
            onDrop={handleCharacterDrop}
          >
            {characterImages.length === 0 ? (
              <div className="flex items-center justify-center p-4 gap-2 text-xs text-muted">
                <Plus className="w-3.5 h-3.5" />
                {t("char.dropHere")}
              </div>
            ) : (
              <div className="p-2">
                <div className="flex gap-2 flex-wrap">
                  {characterImages.map((ch) => (
                    <div
                      key={ch.id}
                      className="group relative w-20 h-20 rounded-lg overflow-hidden border border-border bg-card"
                    >
                      <img
                        src={ch.url}
                        alt="Character"
                        className="w-full h-full object-cover"
                        crossOrigin="anonymous"
                      />
                      <button
                        onClick={() => removeCharacter(ch.id)}
                        className="absolute top-0.5 right-0.5 p-0.5 rounded-full bg-white/90 hover:bg-danger hover:text-white transition-all opacity-0 group-hover:opacity-100 shadow-sm"
                      >
                        <X className="w-2.5 h-2.5" />
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={() => characterInputRef.current?.click()}
                    className="w-20 h-20 flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-border hover:border-foreground/20 transition-all"
                  >
                    <Plus className="w-4 h-4 text-muted" />
                    <span className="text-[9px] text-muted mt-0.5">{t("char.add")}</span>
                  </button>
                </div>
                <p className="text-[10px] text-muted/50 mt-2">
                  {characterImages.length} {characterImages.length !== 1 ? t("char.refCount") : t("char.refCountSingle")}
                </p>
              </div>
            )}
          </div>

          {/* Outfit Reference */}
          <div className="mt-3 pt-3 border-t border-border/50">
            <div className="flex items-center justify-between mb-2">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">
                  {t("outfit.title")}
                </h3>
                <p className="text-[10px] text-muted/60 mt-0.5">
                  {t("outfit.hint")}
                </p>
              </div>
              <button
                onClick={() => outfitInputRef.current?.click()}
                disabled={loading}
                className="px-3 py-1.5 rounded-full bg-card border border-border text-xs font-medium hover:bg-card-hover transition-all disabled:opacity-30"
              >
                <Upload className="w-3 h-3 inline mr-1 -mt-0.5" />
                {t("outfit.upload")}
              </button>
            </div>

            <input
              ref={outfitInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleOutfitFileSelect}
              className="hidden"
            />

            {/* Outfit images */}
            {outfitImages.length > 0 && (
              <div
                className={`rounded-xl border-2 transition-all mb-2 ${
                  outfitDropOver ? "border-primary border-dashed bg-primary/5" : "border-border border-solid"
                }`}
                onDragOver={(e) => { e.preventDefault(); setOutfitDropOver(true); }}
                onDragLeave={() => setOutfitDropOver(false)}
                onDrop={handleOutfitDrop}
              >
                <div className="p-2">
                  <div className="flex gap-2 flex-wrap">
                    {outfitImages.map((ot) => (
                      <div
                        key={ot.id}
                        className="group relative w-20 h-20 rounded-lg overflow-hidden border border-border bg-card"
                      >
                        <img src={ot.url} alt="Outfit" className="w-full h-full object-cover" crossOrigin="anonymous" />
                        <button
                          onClick={() => removeOutfit(ot.id)}
                          className="absolute top-0.5 right-0.5 p-0.5 rounded-full bg-white/90 hover:bg-danger hover:text-white transition-all opacity-0 group-hover:opacity-100 shadow-sm"
                        >
                          <X className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    ))}
                    <button
                      onClick={() => outfitInputRef.current?.click()}
                      className="w-20 h-20 flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-border hover:border-foreground/20 transition-all"
                    >
                      <Plus className="w-4 h-4 text-muted" />
                    </button>
                  </div>
                </div>
              </div>
            )}

            {outfitImages.length === 0 && (
              <div
                className={`rounded-xl border-2 transition-all min-h-[48px] flex items-center justify-center mb-2 ${
                  outfitDropOver ? "border-primary border-dashed bg-primary/5" : "border-dashed border-border"
                }`}
                onDragOver={(e) => { e.preventDefault(); setOutfitDropOver(true); }}
                onDragLeave={() => setOutfitDropOver(false)}
                onDrop={handleOutfitDrop}
              >
                <div className="flex items-center gap-2 p-3 text-xs text-muted">
                  <Plus className="w-3.5 h-3.5" />
                  {t("outfit.dropHere")}
                </div>
              </div>
            )}

            {/* Outfit text description */}
            <input
              type="text"
              value={outfitDescription}
              onChange={(e) => setOutfitDescription(e.target.value)}
              placeholder={t("outfit.placeholder")}
              className="w-full px-3 py-2 rounded-xl bg-card border border-border text-xs focus:outline-none focus:border-foreground/30 focus:ring-1 focus:ring-foreground/10 transition-all placeholder:text-muted/40"
            />
            {!outfitDescription.trim() && outfitImages.length === 0 && (
              <p className="text-[9px] text-muted/40 mt-1 italic">
                {t("outfit.default")}
              </p>
            )}
          </div>
        </div>
      )}

      {/* ── Video Prompt (only in video mode) ── */}
      {contentType === "video" && (
        <div className="rounded-2xl border border-border bg-card/50 p-4 space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">
            {t("mkt.videoPromptTitle")}
          </h2>
          <textarea
            value={videoPrompt}
            onChange={(e) => setVideoPrompt(e.target.value)}
            placeholder={t("mkt.videoPromptPlaceholder")}
            rows={3}
            className="w-full rounded-xl border border-border bg-card px-4 py-2.5 text-sm text-foreground placeholder:text-muted/40 focus:outline-none focus:ring-2 focus:ring-foreground/20 resize-none"
          />
          <button
            onClick={handleRefinePrompt}
            disabled={!videoPrompt.trim() || refiningPrompt}
            className="flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-medium transition-all border bg-card text-foreground border-border hover:border-foreground/20 hover:bg-card-hover disabled:opacity-30"
          >
            {refiningPrompt ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                {t("mkt.refining")}
              </>
            ) : (
              <>
                <Wand2 className="w-3.5 h-3.5" />
                {t("mkt.aiRefine")}
              </>
            )}
          </button>
        </div>
      )}

      {/* ── Studio Themes (hidden in video mode) ── */}
      {contentType !== "video" && (
      <div>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted mb-3">
          {t("mkt.studioTheme")}
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
          {TEMPLATES.map((tmpl) => (
            <TemplatePreview key={tmpl.id} template={tmpl}>
              <button
                onClick={() => setSelectedTemplate(tmpl.id)}
                className={`w-full text-left px-3 py-2.5 rounded-xl transition-all border relative ${
                  selectedTemplate === tmpl.id
                    ? "bg-foreground text-background border-foreground shadow-sm"
                    : "bg-card text-foreground/80 border-border hover:border-foreground/20 hover:bg-card-hover"
                }`}
              >
                {tmpl.popular && (
                  <span className={`absolute top-1.5 right-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full leading-none ${
                    selectedTemplate === tmpl.id
                      ? "bg-background/20 text-background"
                      : "bg-accent/15 text-accent"
                  }`}>
                    {t("mkt.popular" as TKey)}
                  </span>
                )}
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-sm">{tmpl.icon}</span>
                  <span className="text-[12px] font-semibold leading-tight">{t(`tmpl.${tmpl.id}` as TKey)}</span>
                </div>
                <p className={`text-[10px] leading-snug ${
                  selectedTemplate === tmpl.id ? "text-background/70" : "text-muted/60"
                }`}>
                  {t(`desc.${tmpl.id}` as TKey)}
                </p>
              </button>
            </TemplatePreview>
          ))}
        </div>

        {/* ── Packaging Image Upload (shown when packaging-box template is selected) ── */}
        {selectedTemplate === "packaging-box" && (
          <div className="mt-3 p-4 rounded-2xl bg-card border border-border space-y-3">
            <div>
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted mb-0.5">
                {t("mkt.packagingUploadTitle" as TKey)}
              </h3>
              <p className="text-[10px] text-muted/60">
                {t("mkt.packagingUploadHint" as TKey)}
              </p>
            </div>

            {/* Drop area */}
            <div
              onDrop={handlePackagingDrop}
              onDragOver={(e) => { e.preventDefault(); setPackagingDropOver(true); }}
              onDragLeave={() => setPackagingDropOver(false)}
              onClick={() => packagingInputRef.current?.click()}
              className={`relative border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-colors ${
                packagingDropOver
                  ? "border-foreground/60 bg-foreground/5"
                  : "border-border hover:border-foreground/30 hover:bg-card-hover"
              }`}
            >
              <input
                ref={packagingInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={handlePackagingFileSelect}
              />
              <Upload className="w-4 h-4 text-muted/50 mx-auto mb-1" />
              <p className="text-[10px] text-muted/60">{t("mkt.packagingDropHere" as TKey)}</p>
            </div>

            {/* Packaging thumbnails */}
            {packagingImages.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {packagingImages.map((pk) => (
                  <div key={pk.id} className="relative w-14 h-14 rounded-lg overflow-hidden border border-border group">
                    <img src={pk.url} alt="packaging" className="w-full h-full object-cover" />
                    <button
                      onClick={(e) => { e.stopPropagation(); removePackaging(pk.id); }}
                      className="absolute top-0.5 right-0.5 bg-black/60 rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="w-2.5 h-2.5 text-white" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Branch Style Picker (shown when natural-branches template is selected) ── */}
        {selectedTemplate === "natural-branches" && (
          <div className="mt-3 p-4 rounded-2xl bg-card border border-border space-y-3">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted">
              Branch Style
            </h3>
            <div className="grid grid-cols-5 gap-2">
              {BRANCH_STYLES.map((style) => (
                <BranchStyleCard
                  key={style.id}
                  style={style}
                  selected={branchStyle === style.id}
                  onClick={() => setBranchStyle(style.id)}
                />
              ))}
            </div>
            <p className="text-[10px] text-muted/50">
              Selected:{" "}
              <span className="font-medium text-foreground/70">
                {BRANCH_STYLES.find((s) => s.id === branchStyle)?.label ?? "Draped"}
              </span>
            </p>
          </div>
        )}

        {/* ── Solid Color Picker (shown when solid-color template is selected) ── */}
        {selectedTemplate === "solid-color" && (
          <div className="mt-3 p-4 rounded-2xl bg-card border border-border space-y-3">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted">
              {t("mkt.bgColorPicker" as TKey)}
            </h3>

            {/* Solid colors */}
            <div>
              <p className="text-[10px] text-muted/60 mb-1.5">{t("mkt.solidColors" as TKey)}</p>
              <div className="flex flex-wrap gap-2">
                {SOLID_BG_COLORS.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setSolidBgColor(c.id)}
                    title={c.label}
                    className={`w-8 h-8 rounded-full border-2 transition-all ${
                      solidBgColor === c.id
                        ? "border-foreground scale-110 shadow-md"
                        : "border-border hover:border-foreground/40 hover:scale-105"
                    }`}
                    style={{ backgroundColor: c.hex, outline: c.hex === "#FFFFFF" ? "1px solid #e8e6e3" : undefined }}
                  />
                ))}
              </div>
            </div>

            {/* Studio Styles */}
            <div>
              <p className="text-[10px] text-muted/60 mb-2">Studio Style</p>
              <div className="grid grid-cols-5 gap-2">
                {STUDIO_BG_STYLES.map((style) => (
                  <StudioStyleCard
                    key={style.id}
                    style={style}
                    selected={solidBgColor === style.id}
                    onClick={() => setSolidBgColor(style.id)}
                  />
                ))}
              </div>
            </div>

            {/* Selected label */}
            <p className="text-[10px] text-muted/50">
              {t("mkt.selectedBg" as TKey)}{": "}
              <span className="font-medium text-foreground/70">
                {SOLID_BG_COLORS.find(c => c.id === solidBgColor)?.label ??
                 STUDIO_BG_STYLES.find(s => s.id === solidBgColor)?.label ?? solidBgColor}
              </span>
            </p>
          </div>
        )}

        {/* ── Vintage Heritage Config (shown when vintage-inspired template is selected) ── */}
        {selectedTemplate === "vintage-inspired" && (
          <div className="mt-3 p-4 rounded-2xl bg-card border border-border space-y-4">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted">
              {t("mkt.vintageConfig" as TKey)}
            </h3>

            {/* Fabric row */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="vintage-fabric"
                  checked={vintageConfig.showFabric}
                  onChange={(e) => setVintageConfig((c) => ({ ...c, showFabric: e.target.checked }))}
                  className="w-3.5 h-3.5 rounded"
                />
                <label htmlFor="vintage-fabric" className="text-[11px] font-medium text-foreground/80">
                  {t("mkt.vintageFabric" as TKey)}
                </label>
              </div>
              {vintageConfig.showFabric && (
                <div className="pl-5 space-y-2.5">
                  {/* Fabric color swatches */}
                  <p className="text-[10px] text-muted/60">{t("mkt.vintageFabricColor" as TKey)}</p>
                  <div className="flex gap-2 items-center">
                    {VINTAGE_FABRIC_COLORS.map((c) => (
                      <button
                        key={c.id}
                        title={c.zh}
                        type="button"
                        onClick={() => setVintageConfig((cfg) => ({ ...cfg, fabricColor: c.en }))}
                        className={`w-7 h-7 rounded-full border-2 transition-all hover:scale-105 ${
                          vintageConfig.fabricColor === c.en
                            ? "border-foreground scale-110 shadow-md"
                            : "border-transparent hover:border-foreground/30"
                        }`}
                        style={{ backgroundColor: c.hex }}
                      />
                    ))}
                    <span className="text-[10px] text-muted/60 ml-1">
                      {VINTAGE_FABRIC_COLORS.find((c) => c.en === vintageConfig.fabricColor)?.zh ?? vintageConfig.fabricColor}
                    </span>
                  </div>
                  {/* Fabric material pills */}
                  <p className="text-[10px] text-muted/60">{t("mkt.vintageFabricMaterial" as TKey)}</p>
                  <div className="flex gap-1.5 flex-wrap">
                    {VINTAGE_FABRIC_MATERIALS.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setVintageConfig((cfg) => ({ ...cfg, fabricMaterial: m.en }))}
                        className={`px-2.5 py-1 rounded-full text-[10px] border transition-all ${
                          vintageConfig.fabricMaterial === m.en
                            ? "border-foreground bg-foreground text-background"
                            : "border-border text-foreground/70 hover:border-foreground/40"
                        }`}
                      >
                        {m.zh}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Table/Stand row */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="vintage-table"
                  checked={vintageConfig.showTable}
                  onChange={(e) => setVintageConfig((c) => ({ ...c, showTable: e.target.checked }))}
                  className="w-3.5 h-3.5 rounded"
                />
                <label htmlFor="vintage-table" className="text-[11px] font-medium text-foreground/80">
                  {t("mkt.vintageTable" as TKey)}
                </label>
              </div>
              {vintageConfig.showTable && (
                <div className="pl-5 space-y-2.5">
                  <p className="text-[10px] text-muted/60">{t("mkt.vintageTableMaterial" as TKey)}</p>
                  <div className="flex gap-1.5 flex-wrap">
                    {VINTAGE_TABLE_MATERIALS.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setVintageConfig((cfg) => ({ ...cfg, tableMaterial: m.en }))}
                        className={`px-2.5 py-1 rounded-full text-[10px] border transition-all ${
                          vintageConfig.tableMaterial === m.en
                            ? "border-foreground bg-foreground text-background"
                            : "border-border text-foreground/70 hover:border-foreground/40"
                        }`}
                      >
                        {m.zh}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Velvet row */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="vintage-velvet"
                  checked={vintageConfig.showVelvet}
                  onChange={(e) => setVintageConfig((c) => ({ ...c, showVelvet: e.target.checked }))}
                  className="w-3.5 h-3.5 rounded"
                />
                <label htmlFor="vintage-velvet" className="text-[11px] font-medium text-foreground/80">
                  {t("mkt.vintageVelvet" as TKey)}
                </label>
              </div>
              {vintageConfig.showVelvet && (
                <div className="pl-5 space-y-2.5">
                  <p className="text-[10px] text-muted/60">{t("mkt.vintageVelvetColor" as TKey)}</p>
                  <div className="flex gap-2 items-center">
                    {VINTAGE_VELVET_COLORS.map((c) => (
                      <button
                        key={c.id}
                        title={c.zh}
                        type="button"
                        onClick={() => setVintageConfig((cfg) => ({ ...cfg, velvetColor: c.en }))}
                        className={`w-7 h-7 rounded-full border-2 transition-all hover:scale-105 ${
                          vintageConfig.velvetColor === c.en
                            ? "border-foreground scale-110 shadow-md"
                            : "border-transparent hover:border-foreground/30"
                        }`}
                        style={{ backgroundColor: c.hex }}
                      />
                    ))}
                    <span className="text-[10px] text-muted/60 ml-1">
                      {VINTAGE_VELVET_COLORS.find((c) => c.en === vintageConfig.velvetColor)?.zh ?? vintageConfig.velvetColor}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      )}

      {/* Generation History */}
      {history.length > 0 && (
        <div className="mt-6" id="marketing-history">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Clock className="w-3.5 h-3.5 text-muted" />
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">
                {t("history.title")}
              </h3>
              <span className="text-xs text-muted/60">({history.length})</span>
            </div>
          </div>
          <p className="text-[10px] text-muted/50 mb-2">
            {t("mkt.clickMaximize")}
          </p>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
            {history.map((item) => (
                <div
                  key={item.id}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData(
                      "application/x-history-item",
                      JSON.stringify({ resultUrl: item.resultUrl })
                    );
                    e.dataTransfer.setData("text/plain", item.resultUrl);
                    e.dataTransfer.effectAllowed = "copy";
                  }}
                  onClick={() => {
                    if (item.resultUrl) {
                      setMaximizedImage(item.resultUrl);
                    }
                  }}
                  className="group relative aspect-square rounded-lg overflow-hidden border-2 border-border hover:border-foreground/20 cursor-pointer transition-all"
                >
                  {item.resultUrl ? (
                    <img
                      src={item.resultUrl}
                      alt="History"
                      className="w-full h-full object-cover pointer-events-none"
                      crossOrigin="anonymous"
                      referrerPolicy="no-referrer"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = "none";
                      }}
                    />
                  ) : (
                    <div className="w-full h-full bg-card flex items-center justify-center">
                      <Image className="w-4 h-4 text-muted/30" />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <Maximize2 className="w-4 h-4 text-white" />
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Fullscreen Lightbox */}
      {maximizedImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
          onClick={() => setMaximizedImage(null)}
        >
          <div className="relative max-w-[90vw] max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
            <img
              src={maximizedImage}
              alt="Full size"
              className="max-w-full max-h-[90vh] object-contain rounded-2xl shadow-2xl"
              crossOrigin="anonymous"
            />
            <div className="absolute top-3 right-3 flex gap-2">
              <a
                href={maximizedImage}
                target="_blank"
                rel="noopener noreferrer"
                className="p-2.5 rounded-full bg-white/90 hover:bg-white transition-all shadow-md"
                title="Download"
              >
                <Download className="w-4 h-4 text-foreground" />
              </a>
              <button
                onClick={() => setMaximizedImage(null)}
                className="p-2.5 rounded-full bg-white/90 hover:bg-white transition-all shadow-md"
                title="Close"
              >
                <X className="w-4 h-4 text-foreground" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
