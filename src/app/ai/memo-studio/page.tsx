"use client";

// Litigation Studio — المحاكي الشامل للقضايا
// This page is the unified entry point combining:
//   • Wargaming (محاكي الخصم)
//   • Position Strength (قوة الموقف)
//   • Memo Builder (بناء المذكرة)
// Instead of re-building, we re-export the unified wargaming page directly.
// The wargaming component already covers all 3 use-cases via its tabs.

export { default } from "@/app/ai/wargaming/page";
