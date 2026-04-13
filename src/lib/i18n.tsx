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
  "mkt.pieceSize": { en: "Piece size (cm)", zh: "尺寸 (cm)" },
  "mkt.videoModel": { en: "Video model", zh: "影片模型" },
  "mkt.studioTheme": { en: "Studio Theme", zh: "攝影主題" },
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
  "tmpl.white-background": { en: "Clean White Studio", zh: "純白背景" },

  // ── Template descriptions ──
  "desc.glass-display": { en: "Museum-grade glass showcase on polished marble base with soft highlights", zh: "博物館級玻璃展櫃，拋光大理石底座，柔和高光" },
  "desc.natural-surface": { en: "Raw stone, marble, sand or wood surface with organic texture contrast", zh: "原石、大理石、沙子或木頭表面，有機紋理對比" },
  "desc.dark-dramatic": { en: "Deep black backdrop with bold directional key light and crisp highlights", zh: "深黑背景配大膽方向性主光，清晰高光" },
  "desc.floating-abstract": { en: "Levitating mid-air with soft shadow beneath, weightless artistic composition", zh: "半空懸浮，下方柔和陰影，失重藝術構圖" },
  "desc.clean-neutral": { en: "Pure white or soft neutral seamless background with balanced studio lighting", zh: "純白或柔和中性無縫背景，均衡棚燈" },
  "desc.elemental-artistic": { en: "Water droplets, smoke wisps or prism light refractions around the piece", zh: "水滴、煙霧或稜鏡光折射環繞珠寶" },
  "desc.detail-closeup": { en: "Extreme macro focus on engravings, metal joins and gemstone settings", zh: "極致微距聚焦雕刻、金屬接合與寶石鑲嵌" },
  "desc.packaging-box": { en: "Inside an open luxury jewellery box with plush cushion interior", zh: "放置於打開的奢華珠寶盒中，內襯柔軟墊子" },
  "desc.natural-branches": { en: "Draped over sculptural tree branch with organic curves and bark texture", zh: "懸掛於造型樹枝上，自然曲線與樹皮紋理" },
  "desc.vintage-inspired": { en: "Classic heritage setting with aged linen, warm tones and old-world elegance", zh: "經典傳承場景，做舊亞麻布，暖色調與復古優雅" },
  "desc.moss-rock": { en: "Nestled on moss-covered rock with soft cream background, editorial top view", zh: "嵌於苔蘚岩石上，柔和奶油色背景，編輯俯視角度" },
  "desc.consistent-wearing": { en: "Source image shows jewelry already worn correctly \u2014 reproduce the EXACT wearing style with your model's face and clothes", zh: "來源圖已正確佩戴珠寶 \u2014 以您的模特臉孔與服裝完美複製該佩戴方式" },
  "desc.white-background": { en: "Transforms any messy photo into a clean white background product shot", zh: "將雜亂照片轉換為純白背景產品圖" },

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
