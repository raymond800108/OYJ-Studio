"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";

export type Lang = "en" | "zh";

// ── Translation dictionary (zh = Traditional Chinese 繁體中文) ──────────────

const dict = {
  // ── Header / Mode switcher ──
  "mode.camera": { en: "Camera Angle", zh: "相機角度" },
  "mode.edit": { en: "Edit", zh: "編輯" },
  "mode.3d": { en: "3D", zh: "3D" },
  "mode.marketing": { en: "Marketing", zh: "行銷" },

  // ── Source / Result headings ──
  "heading.sourceImage": { en: "Source Image", zh: "原圖" },
  "heading.paintArea": { en: "Paint the area to edit", zh: "塗抹需要編輯的區域" },
  "heading.result": { en: "Result", zh: "生成結果" },
  "heading.3dPreview": { en: "3D Preview", zh: "3D 預覽" },

  // ── Image Uploader ──
  "upload.drop": { en: "Drop your product image here", zh: "將產品圖片拖放到此處" },
  "upload.format": { en: "PNG, JPG, or WebP up to 10MB", zh: "支援 PNG、JPG 或 WebP，最大 10MB" },
  "upload.browse": { en: "Browse Files", zh: "瀏覽檔案" },
  "upload.uploading": { en: "Uploading...", zh: "上傳中..." },
  "upload.replaceSource": { en: "Drop to replace source", zh: "拖放以替換原圖" },
  "upload.source": { en: "Source", zh: "原圖" },

  // ── Result Panel ──
  "result.generating": { en: "Generating your shot...", zh: "正在生成圖片..." },
  "result.aiInference": { en: "AI camera angle inference in progress", zh: "AI 相機角度推理中" },
  "result.failed": { en: "Generation Failed", zh: "生成失敗" },
  "result.download": { en: "Download", zh: "下載" },
  "result.generated": { en: "Generated", zh: "已生成" },
  "result.willAppear": { en: "Result will appear here", zh: "生成結果將在此顯示" },
  "result.uploadAdjust": { en: "Upload an image and adjust camera settings", zh: "上傳圖片並調整相機設定" },

  // ── Camera presets ──
  "preset.presets": { en: "Presets:", zh: "預設:" },
  "preset.front": { en: "Front", zh: "正面" },
  "preset.left45": { en: "Left 45°", zh: "左 45°" },
  "preset.right45": { en: "Right 45°", zh: "右 45°" },
  "preset.leftSide": { en: "Left 90°", zh: "左側" },
  "preset.rightSide": { en: "Right 90°", zh: "右側" },
  "preset.back": { en: "Back", zh: "背面" },
  "preset.topDown": { en: "Top-Down", zh: "俯視" },
  "preset.closeUp": { en: "Close-Up", zh: "特寫" },
  "preset.lowAngle": { en: "Low Angle", zh: "低角度" },
  "preset.wideShot": { en: "Wide Shot", zh: "廣角" },
  "preset.heroShot": { en: "Hero Shot", zh: "主視角" },
  "preset.reset": { en: "Reset", zh: "重置" },

  // ── Generate button ──
  "generate.generate": { en: "Generate", zh: "生成" },
  "generate.generating": { en: "Generating...", zh: "生成中..." },
  "generate.editRegion": { en: "Edit Region", zh: "編輯區域" },
  "generate.editingRegion": { en: "Editing region...", zh: "正在編輯區域..." },
  "generate.generate3d": { en: "Generate 3D Model", zh: "生成 3D 模型" },
  "generate.generating3d": { en: "Generating 3D Model...", zh: "正在生成 3D 模型..." },

  // ── Prompt labels ──
  "prompt.inpaint": { en: "What should appear in the selected area?", zh: "在選取區域應顯示什麼？" },
  "prompt.camera": { en: "Additional instructions (optional)", zh: "附加指令（可選）" },
  "prompt.inpaintPlaceholder": { en: "e.g., a red velvet background", zh: "例如：紅色絲絨背景" },
  "prompt.cameraPlaceholder": { en: "e.g., place on marble surface with soft lighting", zh: "例如：放在大理石表面，柔光" },

  // ── Advanced settings ──
  "advanced.title": { en: "Advanced", zh: "進階設定" },
  "advanced.editStrength": { en: "Edit strength", zh: "編輯強度" },
  "advanced.editStrengthNote": { en: "Lower = subtle changes, Higher = complete replacement", zh: "低 = 細微修改，高 = 完全替換" },
  "advanced.effectStrength": { en: "Effect strength", zh: "效果強度" },
  "advanced.quality": { en: "Quality", zh: "品質" },
  "advanced.steps": { en: "steps", zh: "步" },
  "advanced.qualityNote": { en: "More steps = better quality, slower", zh: "步數越多 = 品質越好，速度越慢" },
  "advanced.infoInpaint": { en: "Using FLUX inpainting via fal.ai", zh: "透過 fal.ai 使用 FLUX 修復" },
  "advanced.infoCamera": { en: "Using Qwen Edit 2509 + Multiple-angles LoRA via fal.ai", zh: "透過 fal.ai 使用 Qwen Edit 2509 + 多角度 LoRA" },

  // ── 3D mode ──
  "3d.generating": { en: "Generating 3D Model...", zh: "正在生成 3D 模型..." },
  "3d.queued": { en: "Queued — waiting to start", zh: "排隊中 — 等待開始" },
  "3d.processing": { en: "Processing", zh: "處理中" },
  "3d.complete": { en: "complete", zh: "已完成" },
  "3d.willAppear": { en: "3D model will appear here", zh: "3D 模型將在此顯示" },
  "3d.uploadToGenerate": { en: "Upload an image to generate a 3D model", zh: "上傳圖片以生成 3D 模型" },
  "3d.failed": { en: "Failed to load 3D model", zh: "3D 模型載入失敗" },
  "3d.cannotRender": { en: "The model file could not be rendered", zh: "無法渲染模型檔案" },
  "3d.preview": { en: "3D Preview", zh: "3D 預覽" },
  "3d.controls": { en: "Drag to rotate · Scroll to zoom", zh: "拖曳旋轉 · 滾輪縮放" },
  "3d.modelFailed": { en: "3D model generation failed", zh: "3D 模型生成失敗" },
  "3d.dimensions": { en: "Dimensions", zh: "尺寸" },
  "3d.measure": { en: "Measure", zh: "量測" },
  "3d.width": { en: "W", zh: "寬" },
  "3d.height": { en: "H", zh: "高" },
  "3d.depth": { en: "D", zh: "深" },
  "3d.distance": { en: "Distance", zh: "距離" },
  "3d.clickToMeasure": { en: "Click two points on the model to measure", zh: "在模型上點擊兩點以量測距離" },
  "3d.clearRuler": { en: "Click again to start new measurement", zh: "再次點擊開始新量測" },
  "3d.calibrate": { en: "Set real size (mm)", zh: "設定實際尺寸 (mm)" },
  "3d.calibrateWidth": { en: "Width", zh: "寬度" },
  "3d.calibrateApply": { en: "Apply", zh: "套用" },
  "3d.calibrated": { en: "Calibrated", zh: "已校準" },
  "3d.uncalibrated": { en: "Not calibrated — sizes are relative", zh: "未校準 — 尺寸為相對值" },

  // ── Usage / Token Tracking ──
  "mode.lighting": { en: "Lighting", zh: "燈光" },
  "mode.social": { en: "Social", zh: "社群" },
  "mode.usage": { en: "Usage", zh: "用量" },
  "usage.title": { en: "API Usage & Cost Tracking", zh: "API 用量與費用追蹤" },
  "usage.totalCost": { en: "Total Cost", zh: "總費用" },
  "usage.totalCalls": { en: "Total Calls", zh: "總呼叫次數" },
  "usage.tokens": { en: "Tokens", zh: "Token 數" },
  "usage.successRate": { en: "Success Rate", zh: "成功率" },
  "usage.estimated": { en: "estimated", zh: "預估" },
  "usage.apiRequests": { en: "API requests", zh: "API 請求" },
  "usage.inOut": { en: "In: {in} / Out: {out}", zh: "輸入: {in} / 輸出: {out}" },
  "usage.errors": { en: "errors", zh: "錯誤" },
  "usage.last7Days": { en: "Cost — Last 7 Days", zh: "費用 — 最近 7 天" },
  "usage.monthChart": { en: "Daily Cost", zh: "每日費用" },
  "usage.byAction": { en: "Cost by Action", zh: "依操作分類費用" },
  "usage.activityLog": { en: "Activity Log", zh: "活動記錄" },
  "usage.records": { en: "records", zh: "筆記錄" },
  "usage.noData": { en: "No usage data yet — start generating!", zh: "尚無用量資料 — 開始生成吧！" },
  "usage.loadMore": { en: "Load more…", zh: "載入更多…" },
  "usage.clear": { en: "Clear All", zh: "清除全部" },
  "usage.disclaimer": { en: "Costs are approximate estimates based on published API pricing. Actual charges may vary.", zh: "費用為根據公開 API 定價的近似估算，實際收費可能有所不同。" },
  "usage.cloudSync": { en: "Cloud synced — shared with team", zh: "雲端同步 — 與團隊共享" },
  "usage.localOnly": { en: "Local storage only — not shared", zh: "僅本地儲存 — 未共享" },
  "usage.connecting": { en: "Connecting...", zh: "連線中..." },
  "usage.refresh": { en: "Refresh", zh: "重新整理" },

  // ── Mask Painter ──
  "mask.paint": { en: "Paint", zh: "畫筆" },
  "mask.erase": { en: "Erase", zh: "橡皮擦" },
  "mask.undo": { en: "Undo", zh: "復原" },
  "mask.clear": { en: "Clear", zh: "清除" },
  "mask.regionSelected": { en: "Region selected", zh: "已選取區域" },
  "mask.paintArea": { en: "Paint area to edit", zh: "塗抹要編輯的區域" },
  "mask.eraseArea": { en: "Erase painted area", zh: "擦除已塗區域" },
  "mask.paintFirst": { en: "Paint an area to edit first", zh: "請先塗抹要編輯的區域" },
  "mask.enterPrompt": { en: "Enter a prompt describing what to generate", zh: "請輸入描述生成內容的提示詞" },

  // ── Camera Controls (slider panel) ──
  "controls.quickPresets": { en: "Quick Presets", zh: "快捷預設" },
  "controls.fineTune": { en: "Fine-Tune", zh: "微調" },
  "controls.horizontalAngle": { en: "Horizontal Angle", zh: "水平角度" },
  "controls.verticalAngle": { en: "Vertical Angle", zh: "垂直角度" },
  "controls.zoom": { en: "Zoom", zh: "縮放" },

  // ── Camera Orbit ──
  "orbit.product": { en: "Product", zh: "產品" },
  "orbit.rotation": { en: "rotation", zh: "旋轉" },
  "orbit.birdsEye": { en: "bird's eye", zh: "鳥瞰" },
  "orbit.lowAngle": { en: "low angle", zh: "低角度" },
  "orbit.eyeLevel": { en: "eye level", zh: "平視" },
  "orbit.zoom": { en: "zoom", zh: "縮放" },
  "orbit.dragCamera": { en: "Drag camera around dome", zh: "拖曳相機繞穹頂移動" },
  "orbit.dragZoom": { en: "Drag to zoom in/out", zh: "拖曳縮放" },
  "orbit.left": { en: "left", zh: "左" },
  "orbit.right": { en: "right", zh: "右" },
  "orbit.center": { en: "center", zh: "中" },

  // ── History Panel ──
  "history.title": { en: "Generation History", zh: "生成歷史" },
  "history.clear": { en: "Clear", zh: "清除" },
  "history.dragHint": { en: "Drag an image to the source panel to reuse it", zh: "拖曳圖片到原圖區域以複用" },
  "history.3dModel": { en: "3D Model", zh: "3D 模型" },
  "history.video": { en: "Video", zh: "影片" },
  "history.generated": { en: "Generated", zh: "已生成" },

  // ── Price Estimate ──
  "price.title": { en: "Production Cost Estimate", zh: "生產成本估算" },
  "price.analyzing": { en: "Analyzing materials & estimating cost...", zh: "分析材料並估算成本..." },
  "price.confidence": { en: "confidence", zh: "信心度" },
  "price.twdPerUnit": { en: "TWD (per unit)", zh: "台幣（單件）" },
  "price.usdPerUnit": { en: "USD (per unit)", zh: "美金（單件）" },
  "price.disclaimer": { en: "Taiwan region production cost only. Excludes marketing, logistics, and business overhead.", zh: "僅限台灣地區生產成本，不含行銷、物流及管理費用。" },

  // ── Marketing Panel ──
  "mkt.staticImage": { en: "Static Image", zh: "靜態圖片" },
  "mkt.video": { en: "Video", zh: "影片" },
  "mkt.sourceImages": { en: "Source Images", zh: "原始圖片" },
  "mkt.sourceHint": { en: "Drop product images here, browse files, or drag from history", zh: "拖放產品圖片、瀏覽檔案或從歷史紀錄拖入" },
  "mkt.dropHere": { en: "Drop your product images here", zh: "將產品圖片拖放到此處" },
  "mkt.multiFormat": { en: "PNG, JPG, or WebP — multiple files supported", zh: "支援 PNG、JPG 或 WebP — 可上傳多個檔案" },
  "mkt.addMore": { en: "Add more", zh: "新增更多" },
  "mkt.generatedImages": { en: "Generated Images", zh: "生成圖片" },
  "mkt.generatedVideo": { en: "Generated Video", zh: "生成影片" },
  "mkt.pickForVideo": { en: "Generated Images \u2192 Pick One for Video", zh: "生成圖片 \u2192 選擇一張生成影片" },
  "mkt.clickVideo": { en: "Click \"\uD83C\uDFAC Video\" on an image to generate a video from it", zh: "點擊圖片上的 \"\uD83C\uDFAC 影片\" 按鈕來生成影片" },
  "mkt.generatingCount": { en: "Generating", zh: "生成中" },
  "mkt.images": { en: "images", zh: "張圖片" },
  "mkt.image": { en: "image", zh: "張圖片" },
  "mkt.completed": { en: "completed", zh: "已完成" },
  "mkt.of": { en: "of", zh: "/" },
  "mkt.queued": { en: "Queued...", zh: "排隊中..." },
  "mkt.generatingDots": { en: "Generating...", zh: "生成中..." },
  "mkt.generateImagesFirst": { en: "Generate Images First", zh: "先生成圖片" },
  "mkt.generateImages": { en: "Generate Images", zh: "生成圖片" },
  "mkt.generateVideo": { en: "Generate Video", zh: "生成影片" },
  "mkt.regenerateImages": { en: "Regenerate Images", zh: "重新生成" },
  "mkt.regenerate": { en: "Regenerate", zh: "重新生成" },
  "mkt.aspectRatio": { en: "Aspect ratio", zh: "寬高比" },
  "mkt.pieceSize": { en: "Piece size (cm)", zh: "整體尺寸 (cm)" },
  "mkt.gemSize": { en: "Gem size (mm)", zh: "寶石尺寸 (mm)" },
  "mkt.chainSize": { en: "Chain size (mm)", zh: "鏈條尺寸 (mm)" },
  "mkt.videoModel": { en: "Video model", zh: "影片模型" },
  "mkt.vintageConfig": { en: "Vintage Scene Elements", zh: "復古場景元素" },
  "mkt.vintageFabric": { en: "Fabric cloth", zh: "布料" },
  "mkt.vintageTable": { en: "Neutral table / pedestal", zh: "簡約中性台子" },
  "mkt.vintageVelvet": { en: "Velvet cloth", zh: "絨布" },
  "mkt.vintageColor": { en: "Color", zh: "顏色" },
  "mkt.vintageMaterial": { en: "Material", zh: "材質" },
  "mkt.vintageFabricColor": { en: "Fabric color", zh: "布料顏色" },
  "mkt.vintageFabricMaterial": { en: "Fabric material", zh: "布料材質" },
  "mkt.vintageTableMaterial": { en: "Stand material", zh: "台子材質" },
  "mkt.vintageVelvetColor": { en: "Velvet color", zh: "絨布顏色" },
  "mkt.studioTheme": { en: "Studio Theme", zh: "攝影主題" },
  "mkt.popular": { en: "Popular", zh: "常用" },
  "mkt.generateVideoFromThis": { en: "Generate Video from This", zh: "使用此圖生成影片" },
  "mkt.generatingVideo": { en: "Generating video...", zh: "影片生成中..." },
  "mkt.noValidSources": { en: "No valid source images to generate from", zh: "沒有有效的原始圖片" },
  "mkt.failedToStart": { en: "Failed to start generation", zh: "生成啟動失敗" },
  "mkt.failedForOne": { en: "Generation failed for one image", zh: "其中一張圖片生成失敗" },
  "mkt.startingGen": { en: "Starting generation...", zh: "正在啟動生成..." },
  "mkt.genProgress": { en: "done, {pending} remaining", zh: "已完成，剩餘 {pending} 張" },
  "mkt.emptyGenImages": { en: "Generated images will appear here", zh: "生成的圖片將在此顯示" },
  "mkt.emptyGenVideo": { en: "Generated video will appear here", zh: "生成的影片將在此顯示" },
  "mkt.emptyPickFirst": { en: "Generate images first, then pick one for video", zh: "先生成圖片，然後選擇一張生成影片" },
  "mkt.emptyTheme": { en: "Pick a studio theme and generate", zh: "選擇一個攝影主題並生成" },
  "mkt.emptyStep": { en: "Step 1: Generate images \u2192 Step 2: Click \uD83C\uDFAC on your favorite", zh: "第一步：生成圖片 \u2192 第二步：點擊最滿意的圖片上的 \uD83C\uDFAC" },
  "mkt.clickMaximize": { en: "Click to maximize \u2014 drag to add as source image", zh: "點擊放大 \u2014 拖曳新增為原圖" },
  "mkt.maximize": { en: "Maximize", zh: "放大" },
  "mkt.close": { en: "Close", zh: "關閉" },
  "mkt.view": { en: "View", zh: "查看" },
  "mkt.inProgress": { en: "In progress on another page", zh: "另一頁面正在處理中" },
  "mkt.contentGenerating": { en: "content generating...", zh: "內容生成中..." },
  "mkt.marketingGenerating": { en: "Marketing content generating...", zh: "行銷內容生成中..." },
  "mkt.inProgressShort": { en: "In progress", zh: "進行中" },
  "mkt.videoPromptTitle": { en: "Video Prompt", zh: "影片提示" },
  "mkt.videoPromptPlaceholder": { en: "Describe the video you want, e.g. \"slow rotation showing all angles, golden hour lighting, luxury feel\"", zh: "描述您想要的影片，例如「緩慢旋轉展示各角度，黃金時刻光線，奢華感」" },
  "mkt.aiRefine": { en: "AI Refine", zh: "AI 優化" },
  "mkt.refining": { en: "Refining...", zh: "優化中..." },

  // ── Character Model Reference ──
  "char.title": { en: "Model Character Reference", zh: "模特角色參考" },
  "char.hint": { en: "Upload multiple photos of the SAME person \u2014 more photos = stronger consistency", zh: "上傳同一個人的多張照片 \u2014 照片越多 = 一致性越強" },
  "char.uploadPhotos": { en: "Upload Photos", zh: "上傳照片" },
  "char.dropHere": { en: "Drop character images here or use buttons above", zh: "拖放角色圖片到此處或使用上方按鈕" },
  "char.add": { en: "Add", zh: "新增" },
  "char.refCount": { en: "references \u2014 more refs = stronger consistency", zh: "張參考 \u2014 參考越多 = 一致性越強" },
  "char.refCountSingle": { en: "reference \u2014 more refs = stronger consistency", zh: "張參考 \u2014 參考越多 = 一致性越強" },
  "char.needRefs": { en: "Please add character reference images first \u2014 upload or generate a model character above", zh: "請先新增角色參考圖片 \u2014 上傳或生成模特角色" },

  // ── Outfit Reference ──
  "outfit.title": { en: "Outfit Reference", zh: "服裝參考" },
  "outfit.hint": { en: "Upload outfit photos or describe it \u2014 leave empty for default Gen-Z style", zh: "上傳服裝照片或描述 \u2014 留空將使用預設 Gen-Z 風格" },
  "outfit.upload": { en: "Upload", zh: "上傳" },
  "outfit.dropHere": { en: "Drop outfit images here (optional)", zh: "拖放服裝圖片到此處（可選）" },
  "outfit.placeholder": { en: "e.g. white silk blouse with black high-waisted pants (or leave empty for default Gen-Z bold style)", zh: "例如：白色絲質襯衫配黑色高腰褲（留空將使用預設 Gen-Z 大膽風格）" },
  "outfit.default": { en: "Default: East Asian Gen-Z inspired, bold & fashion-forward streetwear-meets-luxury style", zh: "預設：東亞 Gen-Z 風格，大膽時尚的街頭潮流與奢華風的結合" },

  // ── Template labels ──
  "tmpl.glass-display": { en: "Glass Display Box", zh: "玻璃展示櫃" },
  "tmpl.natural-surface": { en: "Natural Surface", zh: "天然表面" },
  "tmpl.dark-dramatic": { en: "Dark & Dramatic", zh: "暗黑戲劇風" },
  "tmpl.floating-abstract": { en: "Creative Floating", zh: "創意懸浮" },
  "tmpl.clean-neutral": { en: "Clean & Neutral", zh: "簡約中性" },
  "tmpl.elemental-artistic": { en: "Elemental & Artistic", zh: "元素藝術" },
  "tmpl.detail-closeup": { en: "Detail Close-Up", zh: "細節特寫" },
  "tmpl.packaging-box": { en: "Packaging Box", zh: "包裝禮盒" },
  "tmpl.natural-branches": { en: "Natural Branches", zh: "自然枝條" },
  "tmpl.vintage-inspired": { en: "Vintage Heritage", zh: "復古傳承" },
  "tmpl.moss-rock": { en: "Moss & Rock", zh: "苔蘚岩石" },
  "tmpl.consistent-wearing": { en: "Consistent Wearing", zh: "一致佩戴" },
  "tmpl.solid-color": { en: "Solid Color Studio", zh: "純色背景" },
  "tmpl.seashell": { en: "Seashell", zh: "貝殼海洋" },

  // ── Template descriptions ──
  "desc.glass-display": { en: "Museum-grade glass showcase on polished marble base with soft highlights", zh: "博物館級玻璃展櫃，拋光大理石底座，柔和高光" },
  "desc.natural-surface": { en: "Light pale stone, marble or sand surface with soft organic texture contrast", zh: "淡色石材、大理石或沙面，柔和有機紋理對比" },
  "desc.dark-dramatic": { en: "Deep black backdrop with bold directional key light and crisp highlights", zh: "深黑背景配大膽方向性主光，清晰高光" },
  "desc.floating-abstract": { en: "Levitating mid-air with soft shadow beneath, weightless artistic composition", zh: "半空懸浮，下方柔和陰影，失重藝術構圖" },
  "desc.clean-neutral": { en: "Pure white or soft neutral seamless background with balanced studio lighting", zh: "純白或柔和中性無縫背景，均衡棚燈" },
  "desc.elemental-artistic": { en: "Water droplets, smoke wisps or prism light refractions around the piece", zh: "水滴、煙霧或稜鏡光折射環繞珠寶" },
  "desc.detail-closeup": { en: "Extreme macro focus on engravings, metal joins and gemstone settings — distortion-free", zh: "極致微距聚焦雕刻、金屬接合與寶石鑲嵌，無失真" },
  "desc.packaging-box": { en: "Place jewelry in your custom packaging — upload a packaging image or use the default luxury box", zh: "上傳您的包裝樣式圖，或使用預設奢華珠寶盒" },
  "desc.natural-branches": { en: "5 branch styles — draped, stand, twig frame, wood grain, or floating branch", zh: "5種枝條風格：懸掛、支架、細枝框架、木紋、或懸浮枝條" },
  "desc.vintage-inspired": { en: "Classic heritage setting — customize fabric, neutral table, and velvet cloth", zh: "經典傳承場景，可自定義布料、簡約台子與絨布" },
  "desc.moss-rock": { en: "Nestled on moss-covered rock with soft cream background, editorial top view", zh: "嵌於苔蘚岩石上，柔和奶油色背景，編輯俯視角度" },
  "desc.consistent-wearing": { en: "Source image shows jewelry already worn correctly \u2014 reproduce the EXACT wearing style with your model's face and clothes", zh: "來源圖已正確佩戴珠寶 \u2014 以您的模特臉孔與服裝完美複製該佩戴方式" },
  "desc.solid-color": { en: "Custom solid color or gradient background — white, cream, black, blush and more", zh: "自訂純色或漸層背景 — 白色、奶油色、黑色、粉色等多種選擇" },
  "desc.seashell": { en: "A single perfect shell cradles the jewelry — poetic, minimal, high-end coastal editorial", zh: "單一完美貝殼承托珠寶，詩意極簡，高端海岸編輯風格" },
  "mkt.bgColorPicker": { en: "Background Color", zh: "背景顏色" },
  "mkt.solidColors": { en: "Solid Colors", zh: "純色" },
  "mkt.gradients": { en: "Gradients", zh: "漸層色" },
  "mkt.selectedBg": { en: "Selected", zh: "已選擇" },
  "mkt.packagingUploadTitle": { en: "Custom Packaging (optional)", zh: "自訂包裝（選填）" },
  "mkt.packagingUploadHint": { en: "Upload your packaging design — the AI will place the jewelry inside it. Leave empty to use the default luxury box.", zh: "上傳您的包裝設計圖，AI 將把珠寶放置其中。不上傳則使用預設奢華珠寶盒。" },
  "mkt.packagingDropHere": { en: "Drop packaging image or click to browse", zh: "拖放包裝圖或點擊瀏覽" },

  // ── Social Panel ──
  "social.schedule": { en: "Schedule", zh: "排程" },
  "social.diagnosis": { en: "Diagnosis", zh: "診斷" },
  "social.comingSoon": { en: "Scheduling Coming Soon", zh: "排程功能即將推出" },
  "social.comingSoonSub": {
    en: "Connect Blotato to schedule and auto-publish content across platforms",
    zh: "連接 Blotato 以跨平台排程並自動發布內容",
  },
  "social.blotatoKey": { en: "Blotato API Key", zh: "Blotato API 金鑰" },
  "social.blotatoPlaceholder": { en: "Paste your Blotato API key", zh: "貼上您的 Blotato API 金鑰" },

  // ── Social Scheduling ──
  "social.blotato.connect": { en: "Connect Blotato", zh: "連接 Blotato" },
  "social.blotato.connected": { en: "Blotato Connected", zh: "Blotato 已連接" },
  "social.blotato.disconnect": { en: "Disconnect", zh: "中斷連接" },
  "social.blotato.accounts": { en: "accounts connected", zh: "個帳號已連接" },
  "social.blotato.keyPlaceholder": { en: "Paste Blotato API key...", zh: "貼上 Blotato API 金鑰..." },
  "social.calendar.title": { en: "Content Calendar", zh: "內容行事曆" },
  "social.calendar.prev": { en: "Previous", zh: "上個月" },
  "social.calendar.next": { en: "Next", zh: "下個月" },
  "social.tray.title": { en: "Content Tray", zh: "內容托盤" },
  "social.tray.empty": { en: "Generate content in Marketing tab to add here", zh: "在行銷標籤生成內容後加入此處" },
  "social.tray.drag": { en: "Drag to calendar", zh: "拖曳至行事曆" },
  "social.post.caption": { en: "Caption", zh: "說明文字" },
  "social.post.time": { en: "Time", zh: "時間" },
  "social.post.platform": { en: "Platform", zh: "平台" },
  "social.post.publish": { en: "Publish Now", zh: "立即發布" },
  "social.post.schedule": { en: "Schedule", zh: "排程" },
  "social.post.delete": { en: "Delete", zh: "刪除" },
  "social.post.draft": { en: "Draft", zh: "草稿" },
  "social.post.scheduled": { en: "Scheduled", zh: "已排程" },
  "social.post.published": { en: "Published", zh: "已發布" },
  "social.post.failed": { en: "Failed", zh: "失敗" },
  "social.connect.headline": { en: "Connect Instagram for AI Diagnosis", zh: "連接 Instagram 以獲取 AI 診斷" },
  "social.connect.p1": {
    en: "Post performance — reach, saves, impressions, engagement",
    zh: "貼文表現 — 觸及、收藏、曝光、互動",
  },
  "social.connect.p2": { en: "Audience breakdown — age, gender, top regions", zh: "受眾分析 — 年齡、性別、主要地區" },
  "social.connect.p3": {
    en: "Read-only access — Convra never posts on your behalf",
    zh: "唯讀存取 — Convra 不會代您發文",
  },
  "social.connect.cta": { en: "Connect Instagram Business Account", zh: "連接 Instagram 商業帳號" },
  "social.connect.note": {
    en: "Requires an Instagram Business or Creator account connected to a Facebook Page",
    zh: "需要連接至 Facebook 專頁的 Instagram 商業或創作者帳號",
  },
  "social.idle.headline": { en: "Ready to diagnose your Instagram", zh: "準備診斷您的 Instagram" },
  "social.idle.sub": {
    en: "Convra will analyse your last 30 posts and provide AI-powered recommendations",
    zh: "Convra 將分析您最近 30 篇貼文並提供 AI 建議",
  },
  "social.run": { en: "Run Diagnosis", zh: "執行診斷" },
  "social.disconnect": { en: "Disconnect", zh: "中斷連接" },
  "social.step.posts": { en: "Fetching your last 30 posts...", zh: "正在獲取最近 30 篇貼文..." },
  "social.step.audience": { en: "Pulling audience demographics...", zh: "正在獲取受眾數據..." },
  "social.step.ai": { en: "Running AI diagnosis...", zh: "正在執行 AI 診斷..." },
  "social.working": { en: "What's Working", zh: "表現良好" },
  "social.notWorking": { en: "What's Not Working", zh: "需要改進" },
  "social.audience": { en: "Your Audience", zh: "您的受眾" },
  "social.bestTime": { en: "Best time to post:", zh: "最佳發文時間：" },
  "social.topPost": { en: "Top Performing Post", zh: "表現最佳貼文" },
  "social.nextPost": { en: "Your Next Post", zh: "下一篇貼文建議" },
  "social.generate": { en: "Generate This Content in Studio", zh: "在工作室生成此內容" },
  "social.tryAgain": { en: "Try Again", zh: "重試" },
  "social.err.generic": { en: "Something went wrong. Please try again.", zh: "發生錯誤，請重試。" },
  "social.err.denied": { en: "Connection cancelled.", zh: "連接已取消。" },
  "social.err.noAccount": {
    en: "Your Instagram isn't connected to a Facebook Page.",
    zh: "您的 Instagram 未連接至 Facebook 專頁。",
  },
  "social.err.expired": {
    en: "Your Instagram connection expired. Please reconnect.",
    zh: "您的 Instagram 連接已過期，請重新連接。",
  },

  // ── Aspect ratio labels ──
  "ratio.square": { en: "Square", zh: "方形" },
  "ratio.landscape": { en: "Landscape", zh: "橫向" },
  "ratio.portrait": { en: "Portrait", zh: "縱向" },
  "ratio.wide": { en: "Wide", zh: "寬螢幕" },
  "ratio.story": { en: "Story", zh: "限時動態" },
  "ratio.storyReel": { en: "Story/Reel", zh: "限時動態/短影片" },
  "ratio.tall": { en: "Tall", zh: "直式" },

  // ── Language toggle ──
  "lang.en": { en: "EN", zh: "EN" },
  "lang.zh": { en: "中", zh: "中" },

  // ── Loading text ──
  "loading.editor": { en: "Loading editor...", zh: "載入編輯器..." },

  // ── Video model labels ──
  "videoModel.best": { en: "Kling 2.6 (Best)", zh: "Kling 2.6（最佳）" },
  "videoModel.latest": { en: "Kling 3.0 (Latest)", zh: "Kling 3.0（最新）" },
  "videoModel.fast": { en: "Kling 2.5 Turbo (Fast)", zh: "Kling 2.5 Turbo（快速）" },

  // ── Lighting Panel ──
  "light.style": { en: "Lighting Style", zh: "燈光風格" },
  "light.reset": { en: "Reset", zh: "重置" },
  "light.natural": { en: "Natural", zh: "自然光" },
  "light.studioSoft": { en: "Studio", zh: "棚燈" },
  "light.goldenHour": { en: "Golden Hour", zh: "黃金時刻" },
  "light.blueHour": { en: "Blue Hour", zh: "藍色時刻" },
  "light.dramatic": { en: "Dramatic", zh: "戲劇光" },
  "light.soft": { en: "Soft", zh: "柔光" },
  "light.hard": { en: "Hard", zh: "硬光" },
  "light.backlight": { en: "Backlight", zh: "背光" },
  "light.sideLight": { en: "Side Light", zh: "側光" },
  "light.frontLight": { en: "Front Light", zh: "正面光" },
  "light.rimLight": { en: "Rim Light", zh: "輪廓光" },
  "light.sunset": { en: "Sunset", zh: "日落" },
  "light.sunrise": { en: "Sunrise", zh: "日出" },
  "light.neonAccent": { en: "Neon", zh: "霓虹" },
  "light.candlelight": { en: "Candlelight", zh: "燭光" },
  "light.moonlight": { en: "Moonlight", zh: "月光" },
  "light.spotlight": { en: "Spotlight", zh: "聚光燈" },
  "light.ambient": { en: "Ambient", zh: "環境光" },
  "generate.lighting": { en: "Generate Lighting", zh: "生成燈光" },
  "generate.relighting": { en: "Relighting...", zh: "調整燈光中..." },

  // ── TemplatePreview ──
  "preview.aiPowered": { en: "AI-Powered", zh: "AI 驅動" },

  // ── Admin Invoice Hub ──
  "invoice.hub": { en: "Invoice Hub", zh: "發票中心" },
  "invoice.usageDashboard": { en: "Usage Dashboard", zh: "用量儀表板" },
  "invoice.companies": { en: "Companies", zh: "公司" },
  "invoice.newCompany": { en: "+ New Company", zh: "+ 新增公司" },
  "invoice.companyName": { en: "Company name", zh: "公司名稱" },
  "invoice.billingEmail": { en: "Billing email", zh: "帳單電子郵件" },
  "invoice.notes": { en: "Notes (optional)", zh: "備註 (選填)" },
  "invoice.save": { en: "Save", zh: "儲存" },
  "invoice.cancel": { en: "Cancel", zh: "取消" },
  "invoice.edit": { en: "Edit", zh: "編輯" },
  "invoice.delete": { en: "Delete", zh: "刪除" },
  "invoice.deleteConfirm": { en: "Delete this company?", zh: "確定刪除此公司？" },
  "invoice.noCompanies": { en: "No companies yet. Create one to start billing.", zh: "尚未新增公司，請先建立。" },
  "invoice.userAssignments": { en: "User ↔ Company Assignments", zh: "用戶與公司對應" },
  "invoice.unassigned": { en: "— Unassigned —", zh: "— 未分配 —" },
  "invoice.preview": { en: "Preview", zh: "預覽" },
  "invoice.sendInvoice": { en: "Send Invoice", zh: "寄送發票" },
  "invoice.sending": { en: "Sending...", zh: "寄送中..." },
  "invoice.sendConfirm": { en: "Send invoice to {email}?", zh: "確定寄送發票至 {email}？" },
  "invoice.period": { en: "Period", zh: "計費期間" },
  "invoice.total": { en: "Total", zh: "總計" },
  "invoice.lines": { en: "User lines", zh: "用戶明細" },
  "invoice.sentOk": { en: "Invoice sent to {email}", zh: "發票已寄出至 {email}" },
  "invoice.sentFail": { en: "Send failed: {error}", zh: "寄送失敗：{error}" },
  "invoice.billedTo": { en: "Billed to:", zh: "帳單對象：" },
  "invoice.thisMonth": { en: "This Month", zh: "本月" },
  "invoice.noUsers": { en: "No users assigned to this company", zh: "此公司尚無分配用戶" },
  "invoice.selectCompany": { en: "Select a company to preview", zh: "選擇公司以預覽" },
  "invoice.resendNotConfigured": {
    en: "Email provider not configured. Invoice built but not sent — set RESEND_API_KEY to enable.",
    zh: "尚未設定郵件服務，發票已產生但未寄出 — 請設定 RESEND_API_KEY。",
  },

  // ── AuthGuard ──
  "auth.signInToContinue": { en: "Sign in to continue", zh: "請先登入以繼續" },
  "auth.pageRequiresAccount": { en: "This page requires an account.", zh: "此頁面需要登入帳號" },
  "auth.signIn": { en: "Sign In", zh: "登入" },

  // ── New navigation (AppHeader top + Marketing sub-nav) ──
  "nav.marketing": { en: "Marketing", zh: "行銷" },
  "nav.social": { en: "Social", zh: "社群" },
  "nav.3d": { en: "3D", zh: "3D" },
  "nav.usage": { en: "Usage", zh: "用量" },
  "nav.staticImage": { en: "Static Image", zh: "靜態圖片" },
  "nav.video": { en: "Video", zh: "影片" },
  "nav.orbitContent": { en: "Orbit Content", zh: "環繞內容" },
  "nav.edit": { en: "Edit", zh: "編輯" },
  "nav.lighting": { en: "Lighting", zh: "燈光" },

  // ── Orbit page (headings + actions) ──
  "orbit.productImage": { en: "Product Image", zh: "產品圖片" },
  "orbit.cameraAngle": { en: "Camera Angle", zh: "相機角度" },
  "orbit.motionStyle": { en: "Motion Style", zh: "運鏡風格" },
  "orbit.motionHint": {
    en: 'Preset styles auto-capture their signature camera path. Pick "Custom" to set your own.',
    zh: "預設風格會自動拍攝其代表的鏡頭路徑。選擇「自訂」以手動設定。",
  },
  "orbit.autoShots": { en: "{n} auto shots", zh: "{n} 段自動取景" },
  "orbit.manualBadge": { en: "MANUAL", zh: "手動" },
  "orbit.uploadProductImage": { en: "Upload a product image", zh: "上傳產品圖片" },
  "orbit.uploading": { en: "Uploading…", zh: "上傳中…" },
  "orbit.replace": { en: "Replace", zh: "替換" },
  "orbit.presets": { en: "Presets:", zh: "預設：" },
  "orbit.waypoints": { en: "Waypoints", zh: "路徑點" },
  "orbit.waypointsClear": { en: "Clear", zh: "清除" },
  "orbit.waypointsEmpty": {
    en: "Position the camera, then click Record to set Waypoint 1.",
    zh: "調整相機位置，然後點擊「錄製」設定第一個路徑點。",
  },
  "orbit.waypointsCapturing": { en: "Capturing waypoint…", zh: "正在拍攝路徑點…" },
  "orbit.waypointsRecordFirst": { en: "Record Waypoint 1", zh: "錄製路徑點 1" },
  "orbit.waypointsAddNext": { en: "+ Add Waypoint {n}", zh: "+ 新增路徑點 {n}" },
  "orbit.waypointsNeedMore": { en: "Record {n} more waypoint(s)", zh: "再錄製 {n} 個路徑點" },
  "orbit.generatingImage": { en: "Generating…", zh: "生成中…" },
  "orbit.generateImage": { en: "Generate image at this angle", zh: "用此角度生成圖片" },
  "orbit.generateImageHint": { en: "Single still — uses the camera angle above.", zh: "單張圖片 — 使用上方相機角度。" },
  "orbit.videoCapturingPhase": { en: "Capturing {n} waypoints…", zh: "正在拍攝 {n} 個路徑點…" },
  "orbit.videoStitchingPhase": { en: "Stitching with Kling 3.0…", zh: "Kling 3.0 合成影片中…" },
  "orbit.videoCustom": { en: "Generate custom motion video", zh: "生成自訂動態影片" },
  "orbit.videoPreset": { en: "Generate {style} motion video", zh: "生成 {style} 動態影片" },
  "orbit.videoCustomHint": { en: "Stitches your recorded waypoints into a Kling 3.0 video.", zh: "將錄製的路徑點合成為 Kling 3.0 影片。" },
  "orbit.videoPresetHint": { en: "Auto-captures {n} waypoints, then stitches via Kling 3.0.", zh: "自動拍攝 {n} 個路徑點，再透過 Kling 3.0 合成。" },
  "orbit.result": { en: "Result", zh: "結果" },
  "orbit.placeholder": { en: "Pick an angle and generate", zh: "選擇角度並生成" },
  "orbit.capturingWaypoints": { en: "Capturing waypoints…", zh: "拍攝路徑點中…" },
  "orbit.stitchingMotion": { en: "Stitching motion video…", zh: "合成動態影片中…" },
  "orbit.renderingAngle": { en: "Rendering from the selected angle…", zh: "正在從選定角度生成…" },
  "orbit.downloadMp4": { en: "Download MP4", zh: "下載 MP4" },

  // Orbit motion style labels + short descriptions
  "orbit.style.cinematicFloat": { en: "Cinematic Float", zh: "電影級漂浮" },
  "orbit.style.cinematicFloat.desc": {
    en: "Slow weightless glide — luxury slider feel, soft bokeh",
    zh: "緩慢無重力滑行 — 奢華滑軌質感，柔焦背景",
  },
  "orbit.style.editorialCut": { en: "Editorial Cut", zh: "雜誌跳剪" },
  "orbit.style.editorialCut.desc": {
    en: "Sharp jump cuts between angles — fashion campaign aesthetic",
    zh: "犀利的角度跳剪 — 時尚雜誌風格",
  },
  "orbit.style.kineticOrbit": { en: "Kinetic Orbit", zh: "動感環繞" },
  "orbit.style.kineticOrbit.desc": {
    en: "Fast energetic arc with momentum — product launch energy",
    zh: "充滿動能的快速弧線 — 新品發表會的張力",
  },
  "orbit.style.slowReveal": { en: "Slow Reveal", zh: "極緩揭示" },
  "orbit.style.slowReveal.desc": {
    en: "Imperceptibly slow drift — fine jewellery prestige, maximum tension",
    zh: "幾乎難以察覺的緩慢漂移 — 高級珠寶氣度,極致張力",
  },
  "orbit.style.custom": { en: "Custom Path", zh: "自訂路徑" },
  "orbit.style.custom.desc": {
    en: "Define your own camera path — record each angle manually",
    zh: "自訂相機路徑 — 手動錄製每個角度",
  },

  // Orbit camera preset labels (single-still)
  "orbit.preset.front": { en: "Front", zh: "正面" },
  "orbit.preset.frontRight": { en: "Front-Right", zh: "右前方" },
  "orbit.preset.sideR": { en: "Side (R)", zh: "右側" },
  "orbit.preset.topDown": { en: "Top-Down", zh: "俯視" },
  "orbit.preset.lowAngle": { en: "Low Angle", zh: "低角度" },
  "orbit.preset.hero34": { en: "3/4 Hero", zh: "3/4 主視角" },

  // OrbitCameraControl widget legend + axis labels
  "orbit.legend.horizontal": { en: "Horizontal", zh: "水平" },
  "orbit.legend.vertical": { en: "Vertical", zh: "垂直" },
  "orbit.legend.zoom": { en: "Zoom", zh: "縮放" },
  "orbit.label.front": { en: "Front", zh: "正面" },
  "orbit.label.frontRight": { en: "Front-Right", zh: "右前方" },
  "orbit.label.right": { en: "Right", zh: "右側" },
  "orbit.label.backRight": { en: "Back-Right", zh: "右後方" },
  "orbit.label.back": { en: "Back", zh: "背面" },
  "orbit.label.backLeft": { en: "Back-Left", zh: "左後方" },
  "orbit.label.left": { en: "Left", zh: "左側" },
  "orbit.label.frontLeft": { en: "Front-Left", zh: "左前方" },

  // Cost preview on orbit CTAs
  "orbit.creditsSuffix": { en: "{n} credit", zh: "{n} 點" },
  "orbit.creditsSuffixPlural": { en: "{n} credits", zh: "{n} 點" },

  // ── Empty hints for ResultPanel on new pages ──
  "result.emptyEditHint": {
    en: "Upload an image, paint the area to edit, and describe what should appear there.",
    zh: "上傳圖片,塗抹要編輯的區域,並描述該處應出現的內容。",
  },
  "result.emptyLightingHint": {
    en: "Upload an image and pick a lighting style — the AI will re-light your product photo.",
    zh: "上傳圖片並選擇燈光風格 — AI 會為您的產品照片重新打光。",
  },
} as const;

export type TKey = keyof typeof dict;

// ── Context ─────────────────────────────────────────────────────────────────

interface I18nCtx {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: TKey, vars?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nCtx>({
  lang: "en",
  setLang: () => {},
  t: (key) => key,
});

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("en");

  // Persist language preference
  useEffect(() => {
    const saved = localStorage.getItem("ce-lang") as Lang | null;
    if (saved === "en" || saved === "zh") setLangState(saved);
  }, []);

  const setLang = (l: Lang) => {
    setLangState(l);
    localStorage.setItem("ce-lang", l);
  };

  const t = (key: TKey, vars?: Record<string, string | number>): string => {
    const entry = dict[key];
    if (!entry) return key as string;
    let str: string = entry[lang] || entry.en;
    if (vars) {
      for (const [k, v] of Object.entries(vars)) {
        str = str.replace(`{${k}}`, String(v));
      }
    }
    return str;
  };

  return (
    <I18nContext.Provider value={{ lang, setLang, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  return useContext(I18nContext);
}

/**
 * Loose translator for keys that may not exist in the strict `dict`.
 * Returns the fallback if the key is missing. Use for pages whose keys
 * are still being authored (orbit, social, marketing subpages).
 */
export function useTMaybe() {
  const { lang } = useContext(I18nContext);
  return (key: string, fallback: string, vars?: Record<string, string | number>): string => {
    const entry = (dict as Record<string, { en?: string; zh?: string } | undefined>)[key];
    let str = entry?.[lang] ?? entry?.en ?? fallback;
    if (vars) {
      for (const [k, v] of Object.entries(vars)) {
        str = str.replace(`{${k}}`, String(v));
      }
    }
    return str;
  };
}
