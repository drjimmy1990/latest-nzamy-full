"use client";

import { motion } from "framer-motion";

// ─── Base Skeleton Pulse ──────────────────────────────────────────────────────

function Pulse({ className = "" }: { className?: string }) {
  return (
    <motion.div
      className={`rounded-xl bg-gray-200 dark:bg-white/8 ${className}`}
      animate={{ opacity: [0.4, 0.7, 0.4] }}
      transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
    />
  );
}

// ─── Skeleton Card ────────────────────────────────────────────────────────────

export function SkeletonCard({ className = "" }: { className?: string }) {
  return (
    <div className={`rounded-2xl border border-gray-100 dark:border-white/8 bg-white dark:bg-[#161b22] p-5 ${className}`}>
      <div className="flex items-start gap-4">
        <Pulse className="w-11 h-11 rounded-xl flex-shrink-0" />
        <div className="flex-1 space-y-3">
          <Pulse className="h-4 w-3/4" />
          <Pulse className="h-3 w-1/2" />
          <Pulse className="h-3 w-1/3" />
        </div>
      </div>
    </div>
  );
}

// ─── Skeleton List ────────────────────────────────────────────────────────────

export function SkeletonList({ count = 3, className = "" }: { count?: number; className?: string }) {
  return (
    <div className={`space-y-3 ${className}`}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}

// ─── Skeleton Table Row ───────────────────────────────────────────────────────

export function SkeletonTableRow() {
  return (
    <div className="flex items-center gap-4 py-3 px-4">
      <Pulse className="w-8 h-8 rounded-lg flex-shrink-0" />
      <Pulse className="h-3 flex-1" />
      <Pulse className="h-3 w-20" />
      <Pulse className="h-6 w-16 rounded-full" />
    </div>
  );
}

export function SkeletonTable({ rows = 4 }: { rows?: number }) {
  return (
    <div className="rounded-2xl border border-gray-100 dark:border-white/8 bg-white dark:bg-[#161b22] divide-y divide-gray-50 dark:divide-white/5">
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonTableRow key={i} />
      ))}
    </div>
  );
}

// ─── Skeleton Text ────────────────────────────────────────────────────────────

export function SkeletonText({ lines = 3, className = "" }: { lines?: number; className?: string }) {
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <Pulse key={i} className={`h-3 ${i === lines - 1 ? "w-2/3" : "w-full"}`} />
      ))}
    </div>
  );
}

// ─── Skeleton Stat Card ───────────────────────────────────────────────────────

export function SkeletonStat() {
  return (
    <div className="rounded-2xl border border-gray-100 dark:border-white/8 bg-white dark:bg-[#161b22] p-5">
      <div className="flex items-center justify-between mb-3">
        <Pulse className="h-3 w-20" />
        <Pulse className="w-8 h-8 rounded-lg" />
      </div>
      <Pulse className="h-7 w-16 mb-1" />
      <Pulse className="h-2 w-24" />
    </div>
  );
}

// ─── Full Dashboard Skeleton ──────────────────────────────────────────────────

export function DashboardPageSkeleton() {
  return (
    <div className="space-y-6 animate-in fade-in duration-300" dir="rtl">
      {/* Hero */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 rounded-2xl border border-gray-100 dark:border-white/8 bg-white dark:bg-[#161b22] p-6">
          <Pulse className="h-6 w-48 mb-3" />
          <Pulse className="h-4 w-64 mb-4" />
          <div className="flex gap-3">
            <Pulse className="h-10 w-28 rounded-xl" />
            <Pulse className="h-10 w-28 rounded-xl" />
          </div>
        </div>
        <SkeletonCard />
      </div>

      {/* Cases */}
      <SkeletonList count={2} />

      {/* Plan + Services */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <SkeletonStat />
        <SkeletonStat />
        <SkeletonStat />
        <SkeletonStat />
      </div>

      {/* Messages + Docs */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SkeletonList count={2} />
        <SkeletonList count={2} />
      </div>
    </div>
  );
}

// ─── Thread List Skeleton (Messages) ──────────────────────────────────────────

export function SkeletonThreadList({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-1">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 p-3 rounded-xl">
          <Pulse className="w-10 h-10 rounded-full flex-shrink-0" />
          <div className="flex-1 space-y-2">
            <Pulse className="h-3 w-24" />
            <Pulse className="h-2 w-40" />
          </div>
          <Pulse className="h-2 w-12" />
        </div>
      ))}
    </div>
  );
}

// ─── Message Bubbles Skeleton ─────────────────────────────────────────────────

export function SkeletonMessages({ count = 4 }: { count?: number }) {
  return (
    <div className="space-y-4 p-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className={`flex ${i % 2 === 0 ? "justify-start" : "justify-end"}`}>
          <Pulse className={`h-12 rounded-2xl ${i % 2 === 0 ? "w-3/5" : "w-2/5"}`} />
        </div>
      ))}
    </div>
  );
}
