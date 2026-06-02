$file = "d:\Data\Data\antigravity ai\SITE MAPS NZAMY\nzamy-website\src\app\dashboard\lawyer\profile\page.tsx"
$content = [System.IO.File]::ReadAllText($file, [System.Text.Encoding]::UTF8)

# STEP 1: Remove the analytics link
$content = $content -replace '(?s)\s*<a href="/dashboard/lawyer/analytics"[^>]+>.*?</a>', ''

# STEP 2: Find "/* Pomodoro Level Card */" start
$pomStart = "            {/* Pomodoro Level Card */}"
$startIdx = $content.IndexOf($pomStart)
if ($startIdx -lt 0) { Write-Host "ERROR: could not find Pomodoro card"; exit 1 }

# STEP 3: Find the closing marker after Pomodoro card: "        </div>`n      )}"
# which is: NPS+Metal grid close + space-y-4 close + tab close
$endMarker = "      )}" + [System.Environment]::NewLine + [System.Environment]::NewLine + "      {/* Tab: Achievements */}"
$endIdx = $content.IndexOf($endMarker, $startIdx)
if ($endIdx -lt 0) {
    # Try with just the tab marker
    $endMarker = "      {/* Tab: Achievements */}"
    $endIdx = $content.IndexOf($endMarker, $startIdx)
}
Write-Host "Start: $startIdx, End: $endIdx"
if ($endIdx -lt 0) { Write-Host "ERROR: could not find end marker"; exit 1 }

# STEP 4: Build replacement (everything from Pomodoro card through end of performance tab)
$replacement = @'
            {/* Metal Level Card */}
            <div className={`${card} p-5`}>
              <div className="flex items-center gap-2 mb-4">
                <Coins size={14} weight="duotone" className="text-[#C8A762]" />
                <p className={`text-sm font-bold ${isDark ? "text-zinc-200" : "text-slate-800"}`}>مستوى الإنتاجية</p>
              </div>
              <div className={`rounded-2xl p-4 mb-4 ${isDark ? "bg-white/[0.03] border border-white/[0.06]" : "bg-slate-50 border border-slate-100"}`}>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className={`text-[10px] font-bold uppercase tracking-wider mb-1 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>المستوى الحالي</p>
                    <p className="text-[22px] font-black" style={{ color: metalTier.color }}>{metalTier.emoji} {metalTier.label}</p>
                  </div>
                  <div className="text-right">
                    <p className={`text-[32px] font-black font-mono leading-none ${isDark ? "text-zinc-100" : "text-slate-800"}`}>{WORK_HOURS.total}</p>
                    <p className={`text-[10px] mt-0.5 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>ساعة تراكمية</p>
                  </div>
                </div>
                {metalTier.next && (
                  <>
                    <div className="flex justify-between mb-1">
                      <span className={`text-[10px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
                        فاضلك <span className="font-mono font-bold">{metalHoursLeft.toFixed(1)}</span> س للمستوى التالي ({nextMetalLabel})
                      </span>
                      <span className="text-[10px] font-mono font-bold" style={{ color: metalTier.color }}>{metalPct}٪</span>
                    </div>
                    <div className={`h-1.5 rounded-full overflow-hidden ${isDark ? "bg-white/[0.05]" : "bg-slate-200"}`}>
                      <motion.div initial={{ width: 0 }} animate={{ width: `${metalPct}%` }}
                        transition={{ duration: 0.8, delay: 0.1 }} className="h-full rounded-full"
                        style={{ backgroundColor: metalTier.color }} />
                    </div>
                  </>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: "هذا الأسبوع",   value: WORK_HOURS.thisWeek,  unit: "س",    color: "#6366f1" },
                  { label: "سلسلة التركيز",  value: WORK_HOURS.streak,    unit: "يوم",  color: "#f59e0b" },
                  { label: "الجلسات",        value: WORK_HOURS.sessions,  unit: "جلسة", color: "#0B3D2E" },
                  { label: "إجمالي تراكمي", value: WORK_HOURS.total,     unit: "س",    color: metalTier.color },
                ].map(stat => (
                  <div key={stat.label} className={`rounded-xl p-3 ${isDark ? "bg-white/[0.03] border border-white/[0.04]" : "bg-slate-50 border border-slate-100"}`}>
                    <p className="text-[20px] font-black font-mono leading-none mb-0.5" style={{ color: stat.color }}>{stat.value}</p>
                    <p className={`text-[10px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>{stat.label} <span className="font-semibold">{stat.unit}</span></p>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex items-center gap-1.5 overflow-x-auto pb-1">
                {[...METAL_TIERS].reverse().map(t => (
                  <div key={t.label}
                    className={`flex-shrink-0 flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold border transition-all ${
                      metalTier.label === t.label ? "border-current" : isDark ? "border-white/[0.06] text-zinc-600" : "border-slate-200 text-slate-400"
                    }`}
                    style={{ color: metalTier.label === t.label ? t.color : undefined }}
                  >
                    <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: t.color }} />
                    {t.label}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── Activity Chart ── */}
          <SpotlightCard isDark={isDark} className="p-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <div className="flex items-center gap-2">
                <ChartBar size={14} weight="duotone" className="text-[#0B3D2E]" />
                <h3 className={`text-sm font-bold ${isDark ? "text-zinc-200" : "text-slate-800"}`}>نشاط الأعمال</h3>
              </div>
              <div className={`flex gap-1 p-1 rounded-xl self-start sm:self-auto ${isDark ? "bg-zinc-800/60 border border-white/[0.06]" : "bg-slate-100"}`}>
                {(["أسبوع", "شهر", "سنة"] as AnalyticsPeriod[]).map(p => (
                  <button key={p} onClick={() => setAnalyticsPeriod(p)}
                    className={`px-3 py-1 rounded-lg text-[11px] font-semibold transition-all ${
                      analyticsPeriod === p
                        ? isDark ? "bg-white/10 text-white shadow-sm" : "bg-white text-slate-800 shadow-sm"
                        : isDark ? "text-zinc-500" : "text-slate-400"
                    }`}>{p}</button>
                ))}
              </div>
            </div>
            <div className="flex items-end gap-1 h-28">
              {ACTIVITY_DATA[analyticsPeriod].map((d, i) => {
                const total = d.cases + d.contracts + d.consult;
                const max = Math.max(...ACTIVITY_DATA[analyticsPeriod].map(x => x.cases + x.contracts + x.consult), 1);
                const h = Math.max((total / max) * 100, 4);
                return (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1">
                    <div className="w-full flex flex-col-reverse rounded-sm overflow-hidden" style={{ height: `${h}%` }}>
                      <div className="w-full bg-[#0B3D2E]" style={{ height: `${(d.cases/total)*100}%` }} />
                      <div className="w-full bg-[#C8A762]" style={{ height: `${(d.contracts/total)*100}%` }} />
                      <div className="w-full bg-blue-500/70" style={{ height: `${(d.consult/total)*100}%` }} />
                    </div>
                    <span className={`text-[8px] font-mono ${isDark ? "text-zinc-600" : "text-slate-400"}`}>{d.label}</span>
                  </div>
                );
              })}
            </div>
            <div className="flex items-center gap-3 mt-2 text-[9px]">
              {[["قضايا","bg-[#0B3D2E]"],["عقود","bg-[#C8A762]"],["استشارات","bg-blue-500/70"]].map(([l,c]) => (
                <span key={l} className={`flex items-center gap-1 ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
                  <span className={`w-2 h-2 rounded-sm ${c}`} />{l}
                </span>
              ))}
            </div>
          </SpotlightCard>

          {/* ── Work Distribution + Win Rate (2-col) ── */}
          <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-4">
            <SpotlightCard isDark={isDark} className="p-5">
              <div className="flex items-center gap-2 mb-4">
                <Briefcase size={14} weight="duotone" className="text-[#C8A762]" />
                <h3 className={`text-sm font-bold ${isDark ? "text-zinc-200" : "text-slate-800"}`}>توزيع نوع العمل</h3>
              </div>
              <div className="space-y-2">
                {WORK_DIST.map((w, i) => {
                  const isOpen = activeWorkIdx === i;
                  return (
                    <div key={i}>
                      <button onClick={() => setActiveWorkIdx(isOpen ? null : i)}
                        className={`w-full flex items-center gap-3 rounded-xl p-2.5 transition-all text-right ${isOpen ? isDark ? "bg-white/[0.06]" : "bg-slate-50" : "hover:bg-black/[0.02]"}`}>
                        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: w.color }} />
                        <span className={`text-[12px] font-semibold flex-1 ${isDark ? "text-zinc-200" : "text-slate-700"}`}>{w.label}</span>
                        <span className="text-[11px] font-mono font-bold" style={{ color: w.color }}>{w.pct}٪</span>
                        <div className={`w-20 h-1.5 rounded-full overflow-hidden ${isDark ? "bg-white/[0.06]" : "bg-slate-100"}`}>
                          <motion.div animate={{ width: `${w.pct}%` }} initial={{ width: 0 }}
                            transition={{ duration: 0.7, delay: i * 0.1 }} className="h-full rounded-full" style={{ backgroundColor: w.color }} />
                        </div>
                        <ArrowDown size={11} className={`transition-transform ${isOpen ? "rotate-180" : ""} ${isDark ? "text-zinc-600" : "text-slate-400"}`} />
                      </button>
                      <AnimatePresence>
                        {isOpen && (
                          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.22 }} className="overflow-hidden">
                            <div className="flex flex-wrap gap-1.5 px-3 pb-2 pt-1">
                              {w.sub.map(s => (
                                <span key={s} className={`text-[10px] px-2 py-0.5 rounded-full border ${isDark ? "border-white/[0.08] text-zinc-400" : "border-slate-200 text-slate-500"}`}>{s}</span>
                              ))}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })}
              </div>
            </SpotlightCard>

            <SpotlightCard isDark={isDark} className="p-5">
              <div className="flex items-center gap-2 mb-4">
                <Trophy size={14} weight="duotone" className="text-amber-500" />
                <h3 className={`text-sm font-bold ${isDark ? "text-zinc-200" : "text-slate-800"}`}>نتائج القضايا</h3>
              </div>
              <div className="flex flex-col items-center mb-4">
                <div className="relative w-24 h-24">
                  <RingScore score={WIN_RATE_PCT} color="#C8A762" size={96} />
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className={`text-2xl font-black font-mono ${isDark ? "text-zinc-100" : "text-slate-800"}`}>{WIN_RATE_PCT}٪</span>
                    <span className={`text-[9px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>فوز</span>
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                {[
                  { label: "مكسوبة",    val: WIN.won,     color: "#10b981" },
                  { label: "تسوية",     val: WIN.settled, color: "#3b82f6" },
                  { label: "خسارة",     val: WIN.lost,    color: "#ef4444" },
                  { label: "قيد النظر", val: WIN.pending, color: "#94a3b8" },
                ].map(s => (
                  <div key={s.label} className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
                    <span className={`text-[11px] flex-1 ${isDark ? "text-zinc-500" : "text-slate-400"}`}>{s.label}</span>
                    <span className={`text-[11px] font-mono font-bold ${isDark ? "text-zinc-300" : "text-slate-700"}`}>{s.val}</span>
                    <div className={`w-12 h-1 rounded-full overflow-hidden ${isDark ? "bg-white/[0.06]" : "bg-slate-100"}`}>
                      <motion.div initial={{ width: 0 }} animate={{ width: `${(s.val / WIN_TOTAL) * 100}%` }}
                        transition={{ duration: 0.6, delay: 0.3 }} className="h-full rounded-full" style={{ backgroundColor: s.color }} />
                    </div>
                  </div>
                ))}
              </div>
            </SpotlightCard>
          </div>

          {/* ── AI Usage ── */}
          <SpotlightCard isDark={isDark} className="p-5">
            <div className="flex items-center gap-2 mb-4">
              <Robot size={14} weight="duotone" className="text-[#C8A762]" />
              <h3 className={`text-sm font-bold ${isDark ? "text-zinc-200" : "text-slate-800"}`}>أكثر أدوات نظامي AI استخداماً</h3>
              <span className={`text-[10px] font-mono mr-auto ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
                إجمالي: {AI_TOOLS.reduce((s,a) => s+a.uses, 0)} استخدام
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {AI_TOOLS.map((tool, i) => (
                <motion.div key={tool.label} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }}
                  transition={{ type: "spring", stiffness: 120, damping: 18, delay: i * 0.07 }} className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: tool.color }} />
                      <span className={`text-[12px] font-medium ${isDark ? "text-zinc-200" : "text-slate-700"}`}>{tool.label}</span>
                    </div>
                    <span className={`text-[11px] font-mono font-bold ${isDark ? "text-zinc-500" : "text-slate-400"}`}>{tool.uses}×</span>
                  </div>
                  <div className={`h-1.5 rounded-full overflow-hidden ${isDark ? "bg-white/[0.06]" : "bg-slate-100"}`}>
                    <motion.div initial={{ width: 0 }} animate={{ width: `${(tool.uses / 47) * 100}%` }}
                      transition={{ duration: 0.7, delay: 0.1 * i }} className="h-full rounded-full" style={{ backgroundColor: tool.color }} />
                  </div>
                </motion.div>
              ))}
            </div>
          </SpotlightCard>

          {/* ── Professional Scores ── */}
          <SpotlightCard isDark={isDark} className="p-5">
            <div className="flex items-center gap-2 mb-5">
              <Target size={14} weight="duotone" className="text-[#0B3D2E]" />
              <h3 className={`text-sm font-bold ${isDark ? "text-zinc-200" : "text-slate-800"}`}>مؤشرات التطوير المهني</h3>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              {PRO_SCORES.map((item, i) => (
                <motion.div key={item.label} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ type: "spring", stiffness: 100, damping: 20, delay: i * 0.1 }} className="flex flex-col items-center gap-2">
                  <div className="relative">
                    <RingScore score={item.score} color={item.color} size={84} />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className={`text-xl font-black font-mono ${isDark ? "text-zinc-100" : "text-slate-800"}`}>{item.score}</span>
                    </div>
                  </div>
                  <p className={`text-[11px] font-semibold text-center ${isDark ? "text-zinc-500" : "text-slate-400"}`}>{item.label}</p>
                </motion.div>
              ))}
            </div>
          </SpotlightCard>

          {/* ── Financial Summary ── */}
          <SpotlightCard isDark={isDark} className="p-5">
            <div className="flex items-center gap-2 mb-5">
              <Coins size={14} weight="duotone" className="text-[#C8A762]" />
              <h3 className={`text-sm font-bold ${isDark ? "text-zinc-200" : "text-slate-800"}`}>ملخص الإيرادات</h3>
              <span className={`text-[10px] mr-auto px-2 py-0.5 rounded-full border font-semibold ${isDark ? "border-white/[0.06] text-zinc-500" : "border-slate-200 text-slate-400"}`}>تقديري</span>
            </div>
            <div className="grid grid-cols-3 gap-4 mb-5">
              {[
                { label: "الإجمالي السنوي",   value: FINANCIAL_DATA.total.toLocaleString(), unit: "ر.س", color: "#0B3D2E" },
                { label: "المتوسط الشهري",     value: FINANCIAL_DATA.monthly.toLocaleString(), unit: "ر.س", color: "#C8A762" },
                { label: `أعلى شهر (${FINANCIAL_DATA.bestMonth.name})`, value: FINANCIAL_DATA.bestMonth.amount.toLocaleString(), unit: "ر.س", color: "#10b981" },
              ].map(item => (
                <div key={item.label}>
                  <p className={`text-[10px] mb-1 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>{item.label}</p>
                  <p className="text-[18px] font-black font-mono leading-none" style={{ color: item.color }}>{item.value}</p>
                  <p className={`text-[10px] ${isDark ? "text-zinc-600" : "text-slate-500"}`}>{item.unit}</p>
                </div>
              ))}
            </div>
            <div className="space-y-2">
              {FINANCIAL_DATA.sources.map((src, i) => (
                <div key={src.label}>
                  <div className="flex justify-between mb-1">
                    <span className={`text-[11px] font-semibold ${isDark ? "text-zinc-300" : "text-slate-600"}`}>{src.label}</span>
                    <span className="text-[11px] font-mono font-bold" style={{ color: src.color }}>{src.pct}٪</span>
                  </div>
                  <div className={`h-1.5 rounded-full overflow-hidden ${isDark ? "bg-white/[0.06]" : "bg-slate-100"}`}>
                    <motion.div initial={{ width: 0 }} animate={{ width: `${src.pct}%` }}
                      transition={{ duration: 0.7, delay: i * 0.1 }} className="h-full rounded-full" style={{ backgroundColor: src.color }} />
                  </div>
                </div>
              ))}
            </div>
          </SpotlightCard>
        </div>
      )}

      {/* Tab: Achievements */}
'@

# Do the replacement
$before = $content.Substring(0, $startIdx)
$afterStart = $content.IndexOf("      {/* Tab: Achievements */}", $startIdx)
$after = $content.Substring($afterStart)

$newContent = $before + $replacement + $after
[System.IO.File]::WriteAllText($file, $newContent, [System.Text.Encoding]::UTF8)
Write-Host "SUCCESS: Replaced Pomodoro card and added analytics sections. New length: $($newContent.Length)"
