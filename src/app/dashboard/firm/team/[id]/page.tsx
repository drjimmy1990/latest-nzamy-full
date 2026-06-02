'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { motion } from 'framer-motion';
import Link from 'next/link';
import {
  ArrowLeft, Star, Gavel, CalendarBlank, Phone, Envelope,
  SealCheck, Student, Key, CheckCircle, Warning,
  ChartBar, Scales, FileText, Handshake,
  MagnifyingGlassPlus, ChatCircle, Trophy, Target,
  BookOpen, Flame, Lightning, Lock,
  FilePdf, ChartLine, Users, PencilSimple,
  FunnelSimple, Briefcase, Scroll, Lightbulb, GitMerge,
} from '@phosphor-icons/react';
import { useTheme } from '@/components/ThemeProvider';
import {
  type MemberRole,
  type MemberStatus,
  type WorkItemType,
  type WorkItemStatus,
  type TaskBreakdown,
  type WorkItem,
  type TeamMember,
  TASK_WEIGHTS,
  MAX_POINTS,
  calcPoints,
  WORK_TYPE,
  WORK_STATUS,
  MOCK_TEAM,
  ROLE_RANK,
  ROLE_CONFIG,
  STATUS_CFG,
  ACH_TEMPLATES,
  CURRENT_USER,
  sp,
} from "@/constants/firmTeamData";

export default function FirmTeamMemberPage() {
  const { id } = useParams<{ id: string }>();
  const { isDark } = useTheme();
  const member = MOCK_TEAM.find(m => m.id === id) ?? MOCK_TEAM[0];

  // ── RBAC ──────────────────────────────────────────────────────────────────
  const isOwn        = member.id === CURRENT_USER.id;
  const viewerRank   = ROLE_RANK[CURRENT_USER.role];
  const viewedRank   = ROLE_RANK[member.role];
  const canManage    = viewerRank > viewedRank;            // يعلوه في الهرم
  const canAssignTask = !isOwn && canManage;               // يسند مهمة لمن هو أدنى
  const canSeeOpsData = isOwn || canManage;                // بيانات الإنتاجية والأداء
  const canSeeAllFiles = isOwn || canManage;               // كل الملفات (لا فقط المشتركة)
  // ──────────────────────────────────────────────────────────────────────────

  const [activeTab, setActiveTab] = useState('الملف المهني');
  const [typeFilter, setTypeFilter] = useState<WorkItemType | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<WorkItemStatus | 'all'>('all');

  const rc = ROLE_CONFIG[member.role];
  const sc = STATUS_CFG[member.status];
  const pts = calcPoints(member.tasks);
  const winRate = member.casesTotal > 0 ? Math.round((member.casesWon / member.casesTotal) * 100) : 0;

  const card = isDark
    ? 'rounded-2xl border border-white/[0.06] bg-zinc-900/60'
    : 'rounded-2xl border border-black/[0.06] bg-white/80';

  // canSeeAllFiles → يرى كل الملفات. غيره → يرى المشتركة فقط (سرية الموكل)
  const filteredItems = canSeeAllFiles
    ? member.workItems.filter(w => {
        if (typeFilter !== 'all' && w.type !== typeFilter) return false;
        if (statusFilter !== 'all' && w.status !== statusFilter) return false;
        return true;
      })
    : member.workItems.filter(w => {
        const isShared = w.collaborators && w.collaborators.length > 0;
        const hasMe = w.collaborators?.includes(MOCK_TEAM.find(m=>m.id===CURRENT_USER.id)?.name ?? '');
        if (!isShared || !hasMe) return false;
        if (typeFilter !== 'all' && w.type !== typeFilter) return false;
        if (statusFilter !== 'all' && w.status !== statusFilter) return false;
        return true;
      });

  const sharedItems = canSeeAllFiles
    ? member.workItems.filter(w =>
        w.collaborators && w.collaborators.length > 0 &&
        (typeFilter === 'all' || w.type === typeFilter) &&
        (statusFilter === 'all' || w.status === statusFilter)
      )
    : [];

  // عبء العمل يظهر فقط لمن يملك صلاحية رؤية البيانات التشغيلية
  const TABS = canSeeOpsData
    ? ['الملف المهني', 'الملفات', 'عبء العمل', 'الإنجازات']
    : ['الملف المهني', 'الملفات', 'الإنجازات'];

  return (
    <div dir="rtl" className={`min-h-screen p-4 md:p-8 ${isDark ? 'bg-zinc-950 text-white' : 'bg-slate-50 text-zinc-900'}`}>
      {/* Back */}
      <Link href="/dashboard/firm/team" className="inline-flex items-center gap-2 text-sm opacity-60 hover:opacity-100 mb-6 transition-opacity">
        <ArrowLeft size={16} />
        <span>العودة للفريق</span>
      </Link>

      {/* Hero Card */}
      <motion.div initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} transition={sp}
        className={`${card} overflow-hidden mb-6`}>
        <div className="h-24 w-full" style={{background:`linear-gradient(135deg,#0B3D2E,#C8A762)`}} />
        <div className="px-6 pb-6">
          <div className="flex items-end justify-between -mt-10 mb-4 flex-wrap gap-3">
            <div className="w-20 h-20 rounded-2xl border-4 border-[#0B3D2E] bg-gradient-to-br from-[#0B3D2E] to-[#C8A762] flex items-center justify-center text-white text-2xl font-bold shadow-lg">
              {member.name[0]}
            </div>
            <div className="flex gap-2 flex-wrap">
              {isOwn ? (
                <>
                  <span className="text-xs px-3 py-1 rounded-full bg-[#C8A762]/20 text-[#C8A762] font-semibold">بروفيلي</span>
                  <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-[#0B3D2E] text-white hover:bg-[#0B3D2E]/80 transition-colors">
                    <PencilSimple size={14}/> تعديل الملف
                  </button>
                </>
              ) : (
                <>
                  <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border border-current opacity-70 hover:opacity-100 transition-opacity">
                    <FilePdf size={14}/> تصدير PDF
                  </button>
                  {canAssignTask && (
                    <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-[#0B3D2E] text-white hover:bg-[#0B3D2E]/80 transition-colors">
                      <Briefcase size={14}/> إسناد مهمة
                    </button>
                  )}
                </>
              )}
            </div>
          </div>

          <div className="flex items-start justify-between flex-wrap gap-4">
            <div>
              <h1 className="text-xl font-bold mb-1">{member.name}</h1>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{background:`${rc.color}22`,color:rc.color}}>
                  {rc.label}
                </span>
                <span className="text-sm opacity-60">{member.specialization}</span>
                <span className={`flex items-center gap-1 text-xs ${sc.text}`}>
                  <span className={`w-2 h-2 rounded-full ${sc.dot}`}/>
                  {sc.label}
                </span>
              </div>
            </div>
            <div className="flex gap-6 flex-wrap">
              {[
                {label:'قضايا مكسوبة', val:`${member.casesWon}/${member.casesTotal}`, icon:Trophy},
                {label:'نسبة الفوز', val:`${winRate}%`, icon:Target},
                {label:'التقييم', val:`${member.rating}`, icon:Star},
                {label:'منذ', val:member.joinDate, icon:CalendarBlank},
              ].map(({label,val,icon:Icon})=>(
                <div key={label} className="text-center">
                  <div className="flex items-center justify-center gap-1 text-[#C8A762] mb-0.5">
                    <Icon size={14}/><span className="font-mono font-bold text-sm">{val}</span>
                  </div>
                  <div className="text-xs opacity-50">{label}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-3 mt-4 flex-wrap">
            <a href={`tel:${member.phone}`} className="flex items-center gap-1.5 text-xs opacity-60 hover:opacity-100 transition-opacity">
              <Phone size={13}/>{member.phone}
            </a>
            <a href={`mailto:${member.email}`} className="flex items-center gap-1.5 text-xs opacity-60 hover:opacity-100 transition-opacity">
              <Envelope size={13}/>{member.email}
            </a>
          </div>
        </div>
      </motion.div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 overflow-x-auto">
        {TABS.map((t)=>(
          <button key={t} onClick={()=>setActiveTab(t)}
            className={`px-4 py-2 rounded-xl text-sm font-semibold whitespace-nowrap transition-all ${
              activeTab===t ? 'bg-[#0B3D2E] text-white shadow-lg' : 'opacity-50 hover:opacity-80'
            }`}>
            {t}
          </button>
        ))}
      </div>

      {/* ── Tab 1: الملف المهني ── */}
      {activeTab==='الملف المهني' && (
        <motion.div initial={{opacity:0}} animate={{opacity:1}} transition={sp} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            {/* Bio */}
            <div className={`${card} p-6`}>
              <h2 className="font-bold mb-3 flex items-center gap-2"><ChatCircle size={16} className="text-[#C8A762]"/>نبذة مهنية</h2>
              <p className="text-sm leading-relaxed opacity-80">{member.bio}</p>
            </div>

            {/* Responsibilities */}
            <div className={`${card} p-6`}>
              <h2 className="font-bold mb-4 flex items-center gap-2"><SealCheck size={16} className="text-emerald-500"/>المسؤوليات</h2>
              <div className="mb-3">
                <p className="text-xs opacity-50 mb-2">يتولى بشكل رئيسي</p>
                <div className="flex flex-wrap gap-2">
                  {member.primaryResponsibilities.map(r=>(
                    <span key={r} className="text-xs px-3 py-1 rounded-full bg-emerald-500/15 text-emerald-600 font-medium">{r}</span>
                  ))}
                </div>
              </div>
              {member.assistsIn.length>0 && (
                <div>
                  <p className="text-xs opacity-50 mb-2">يساعد في</p>
                  <div className="flex flex-wrap gap-2">
                    {member.assistsIn.map(r=>(
                      <span key={r} className="text-xs px-3 py-1 rounded-full bg-zinc-500/10 opacity-70 font-medium">{r}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Performance — يظهر فقط لصاحب الملف أو من يعلوه */}
            {canSeeOpsData && (
              <div className={`${card} p-6`}>
                <h2 className="font-bold mb-4 flex items-center gap-2"><ChartBar size={16} className="text-[#C8A762]"/>الأداء</h2>
                {[
                  {label:'معدل الاستغلال', val:member.utilizationRate},
                  {label:'الالتزام بالمواعيد', val:member.deadlineAdherence},
                  {label:'نسبة الفوز', val:winRate},
                ].map(({label,val})=>(
                  <div key={label} className="mb-4">
                    <div className="flex justify-between text-sm mb-1">
                      <span className="opacity-70">{label}</span>
                      <span className="font-mono font-bold text-[#C8A762]">{val}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                      <motion.div initial={{width:0}} animate={{width:`${val}%`}} transition={{...sp,delay:0.2}}
                        className="h-full rounded-full bg-gradient-to-r from-[#0B3D2E] to-[#C8A762]"/>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {!canSeeOpsData && (
              <div className={`${card} p-6 text-center opacity-50`}>
                <Lock size={20} className="mx-auto mb-2"/>
                <p className="text-xs">بيانات الأداء متاحة لإدارة المكتب فقط</p>
              </div>
            )}
          </div>

          <div className="space-y-6">
            {/* Education */}
            <div className={`${card} p-6`}>
              <h2 className="font-bold mb-4 flex items-center gap-2"><Student size={16} className="text-[#C8A762]"/>التعليم</h2>
              <div className="space-y-4">
                {member.education.map((e,i)=>(
                  <div key={i} className="border-r-2 border-[#C8A762] pr-3">
                    <div className="font-semibold text-sm">{e.degree}</div>
                    <div className="text-xs opacity-60">{e.institution}</div>
                    <div className="text-xs opacity-40 font-mono">{e.year}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Courts */}
            {member.courts && (
              <div className={`${card} p-6`}>
                <h2 className="font-bold mb-4 flex items-center gap-2"><Scales size={16} className="text-[#C8A762]"/>المحاكم</h2>
                <div className="space-y-2">
                  {member.courts.map(c=>(
                    <div key={c} className="flex items-center gap-2 text-sm">
                      <CheckCircle size={14} className="text-emerald-500 shrink-0"/>
                      <span className="opacity-80">{c}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Expertise */}
            <div className={`${card} p-6`}>
              <h2 className="font-bold mb-4 flex items-center gap-2"><BookOpen size={16} className="text-[#C8A762]"/>التخصصات</h2>
              <div className="flex flex-wrap gap-2">
                {member.expertise.map(e=>(
                  <span key={e} className="text-xs px-2 py-1 rounded-lg bg-[#0B3D2E]/20 text-[#0B3D2E] dark:bg-[#C8A762]/10 dark:text-[#C8A762]">{e}</span>
                ))}
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {/* ── Tab 2: الملفات ── */}
      {/* RBAC note: canSeeAllFiles → كل الملفات | غيره → المشتركة فقط (سرية الموكل) */}
      {activeTab==='الملفات' && (
        <motion.div initial={{opacity:0}} animate={{opacity:1}} transition={sp} className="space-y-6">
          {/* Filters */}
          <div className={`${card} p-4`}>
            <div className="flex items-center gap-2 mb-3">
              <FunnelSimple size={14} className="text-[#C8A762]"/>
              <span className="text-sm font-semibold">تصفية</span>
            </div>
            <div className="flex flex-wrap gap-2 mb-2">
              {(['all','case','contract','advisory','study'] as const).map(t=>{
                const cfg = t==='all' ? null : WORK_TYPE[t];
                return (
                  <button key={t} onClick={()=>setTypeFilter(t)}
                    className={`text-xs px-3 py-1.5 rounded-full font-medium transition-all ${
                      typeFilter===t ? 'bg-[#0B3D2E] text-white' : 'opacity-50 hover:opacity-80 border border-current'
                    }`}>
                    {t==='all' ? 'الكل' : cfg!.label}
                  </button>
                );
              })}
            </div>
            <div className="flex flex-wrap gap-2">
              {(['all','active','scheduled','done','pending'] as const).map(s=>{
                const cfg = s==='all' ? null : WORK_STATUS[s];
                return (
                  <button key={s} onClick={()=>setStatusFilter(s)}
                    className={`text-xs px-3 py-1.5 rounded-full font-medium transition-all ${
                      statusFilter===s ? 'bg-[#C8A762] text-white' : 'opacity-50 hover:opacity-80 border border-current'
                    }`}>
                    {s==='all' ? 'كل الحالات' : cfg!.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Solo Items */}
          {filteredItems.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold opacity-50 mb-3">الملفات الفردية ({filteredItems.length})</h3>
              <div className="space-y-3">
                {filteredItems.map(item=>{
                  const tc = WORK_TYPE[item.type];
                  const sc2 = WORK_STATUS[item.status];
                  return (
                    <motion.div key={item.id} initial={{opacity:0,x:10}} animate={{opacity:1,x:0}} transition={sp}
                      className={`${card} p-4 flex items-center justify-between gap-3`}>
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-xl ${tc.bg}`}>
                          <tc.icon size={16} className={tc.color}/>
                        </div>
                        <div>
                          <div className="font-semibold text-sm">{item.title}</div>
                          <div className="text-xs opacity-50 font-mono">{item.date}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {item.isLead && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-[#C8A762]/20 text-[#C8A762]">قائد</span>
                        )}
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${sc2.badge}`}>
                          <span className="flex items-center gap-1">
                            <span className={`w-1.5 h-1.5 rounded-full ${sc2.dot}`}/>
                            {sc2.label}
                          </span>
                        </span>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Shared Items */}
          {sharedItems.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold opacity-50 mb-3 flex items-center gap-2">
                <GitMerge size={14}/>ملفات مشتركة ({sharedItems.length})
              </h3>
              <div className="space-y-3">
                {sharedItems.map(item=>{
                  const tc = WORK_TYPE[item.type];
                  const sc2 = WORK_STATUS[item.status];
                  return (
                    <motion.div key={item.id} initial={{opacity:0,x:10}} animate={{opacity:1,x:0}} transition={sp}
                      className={`${card} p-4 border-r-2 border-[#C8A762]`}>
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className={`p-2 rounded-xl ${tc.bg}`}>
                            <tc.icon size={16} className={tc.color}/>
                          </div>
                          <div>
                            <div className="font-semibold text-sm">{item.title}</div>
                            <div className="text-xs opacity-50 font-mono">{item.date}</div>
                          </div>
                        </div>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${sc2.badge}`}>
                          <span className="flex items-center gap-1">
                            <span className={`w-1.5 h-1.5 rounded-full ${sc2.dot}`}/>
                            {sc2.label}
                          </span>
                        </span>
                      </div>
                      {item.collaborators && (
                        <div className="mt-2 flex items-center gap-2">
                          <Users size={12} className="opacity-40"/>
                          <span className="text-xs opacity-50">مع: {item.collaborators.join('، ')}</span>
                          {item.isLead && <span className="text-xs px-1.5 py-0.5 rounded-full bg-[#C8A762]/20 text-[#C8A762]">قائد</span>}
                        </div>
                      )}
                    </motion.div>
                  );
                })}
              </div>
            </div>
          )}

          {!canSeeAllFiles && (
            <div className={`${card} p-3 mb-4 flex items-center gap-2 text-xs`}>
              <Lock size={14} className="text-amber-500 shrink-0"/>
              <span className="opacity-70">أنت ترى الملفات المشتركة بينكما فقط — سرية الموكل محفوظة</span>
            </div>
          )}
          {filteredItems.length === 0 && sharedItems.length === 0 && (
            <div className="text-center py-16 opacity-40">
              <Warning size={32} className="mx-auto mb-2"/>
              <p className="text-sm">{canSeeAllFiles ? 'لا توجد ملفات بهذه الفلاتر' : 'لا توجد ملفات مشتركة بينكما بهذه الفلاتر'}</p>
            </div>
          )}
        </motion.div>
      )}

      {/* ── Tab 3: عبء العمل — يظهر فقط إذا canSeeOpsData ── */}
      {activeTab==='عبء العمل' && canSeeOpsData && (
        <motion.div initial={{opacity:0}} animate={{opacity:1}} transition={sp} className="space-y-6">
          {/* Total bar */}
          <div className={`${card} p-6`}>
            <div className="flex justify-between items-baseline mb-2">
              <h2 className="font-bold flex items-center gap-2"><ChartLine size={16} className="text-[#C8A762]"/>إجمالي النقاط</h2>
              <span className="font-mono text-2xl font-bold text-[#C8A762]">{pts}<span className="text-sm opacity-50">/{MAX_POINTS}</span></span>
            </div>
            <div className="h-3 rounded-full bg-white/10 overflow-hidden mb-2">
              <motion.div initial={{width:0}} animate={{width:`${Math.min((pts/MAX_POINTS)*100,100)}%`}} transition={{...sp,delay:0.1}}
                className="h-full rounded-full bg-gradient-to-r from-[#0B3D2E] to-[#C8A762]"/>
            </div>
            <p className="text-xs opacity-50">
              {pts >= 40 ? '🔴 عبء مرتفع — يُقترح إعادة توزيع' :
               pts >= 25 ? '🟡 عبء متوسط — يمكن إضافة مهام' :
               '🟢 عبء منخفض — متاح للمزيد'}
            </p>
          </div>

          {/* Task breakdown */}
          <div className={`${card} p-6`}>
            <h2 className="font-bold mb-4 flex items-center gap-2"><Briefcase size={16} className="text-[#C8A762]"/>تفصيل المهام</h2>
            <div className="space-y-4">
              {(Object.keys(member.tasks) as (keyof TaskBreakdown)[]).map(k=>{
                const cfg = TASK_WEIGHTS[k];
                const count = member.tasks[k];
                const contrib = count * cfg.weight;
                const pct = pts > 0 ? Math.round((contrib/pts)*100) : 0;
                if (count === 0) return null;
                return (
                  <div key={k}>
                    <div className="flex justify-between items-center text-sm mb-1">
                      <div className="flex items-center gap-2">
                        <cfg.icon size={14} className="opacity-60"/>
                        <span>{cfg.label}</span>
                        <span className="text-xs opacity-40 font-mono">×{count} = {contrib}نق</span>
                      </div>
                      <span className="font-mono text-xs text-[#C8A762]">{pct}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                      <motion.div initial={{width:0}} animate={{width:`${pct}%`}} transition={{...sp,delay:0.1}}
                        className="h-full rounded-full bg-gradient-to-r from-[#0B3D2E] to-[#C8A762]"/>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* vs Team avg */}
          <div className={`${card} p-6`}>
            <h2 className="font-bold mb-4 flex items-center gap-2"><Users size={16} className="text-[#C8A762]"/>مقارنة بالفريق</h2>
            {(() => {
              const teamAvg = Math.round(MOCK_TEAM.reduce((s,m)=>s+calcPoints(m.tasks),0)/MOCK_TEAM.length);
              const diff = pts - teamAvg;
              return (
                <div className="flex items-center gap-6">
                  <div className="text-center">
                    <div className="font-mono text-2xl font-bold text-[#C8A762]">{pts}</div>
                    <div className="text-xs opacity-50">نقاطك</div>
                  </div>
                  <div className="flex-1 h-px bg-white/10"/>
                  <div className={`text-center ${diff>0?'text-amber-500':diff<0?'text-emerald-500':'text-zinc-400'}`}>
                     <div className="font-mono text-lg font-bold">{diff>0?'+':''}{diff}</div>
                    <div className="text-xs opacity-70">{diff>0?'أعلى من المتوسط':diff<0?'أقل من المتوسط':'مثل المتوسط'}</div>
                  </div>
                  <div className="flex-1 h-px bg-white/10"/>
                  <div className="text-center">
                    <div className="font-mono text-2xl font-bold opacity-60">{teamAvg}</div>
                    <div className="text-xs opacity-50">متوسط الفريق</div>
                  </div>
                </div>
              );
            })()}
          </div>
        </motion.div>
      )}

      {/* ── Tab 4: الإنجازات ── */}
      {activeTab==='الإنجازات' && (
        <motion.div initial={{opacity:0}} animate={{opacity:1}} transition={sp} className="space-y-6">
          {/* Points hero */}
          <div className="rounded-2xl p-6 text-white text-center" style={{background:'linear-gradient(135deg,#0B3D2E,#C8A762)'}}>
            <Trophy size={32} className="mx-auto mb-2"/>
            <div className="font-mono text-4xl font-bold mb-1">
              {ACH_TEMPLATES.reduce((s,a)=>{
                const unlocked = a.field==='casesWon' ? member.casesWon>=a.threshold :
                                 a.field==='rating'   ? member.rating>=a.threshold :
                                 a.field==='deadline' ? member.deadlineAdherence>=a.threshold :
                                 a.field==='nego'     ? member.tasks.negotiations>=a.threshold : false;
                return s + (unlocked ? a.points : 0);
              },0)}
            </div>
            <div className="text-sm opacity-80">نقاط الإنجاز</div>
          </div>

          {/* Grid */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {ACH_TEMPLATES.map(a=>{
              const unlocked = a.field==='casesWon' ? member.casesWon>=a.threshold :
                               a.field==='rating'   ? member.rating>=a.threshold :
                               a.field==='deadline' ? member.deadlineAdherence>=a.threshold :
                               a.field==='nego'     ? member.tasks.negotiations>=a.threshold : false;
              return (
                <motion.div key={a.title} initial={{opacity:0,scale:0.9}} animate={{opacity:1,scale:1}} transition={sp}
                  className={`${card} p-4 text-center ${!unlocked?'opacity-40':''}`}>
                  <div className={`w-12 h-12 rounded-2xl mx-auto mb-3 flex items-center justify-center ${
                    unlocked ? 'bg-gradient-to-br from-[#0B3D2E] to-[#C8A762]' : 'bg-zinc-700'
                  }`}>
                    {unlocked ? <a.icon size={22} className="text-white"/> : <Lock size={22} className="text-zinc-500"/>}
                  </div>
                  <div className="font-bold text-sm mb-1">{a.title}</div>
                  <div className="text-xs opacity-60 mb-2">{a.desc}</div>
                  <div className="font-mono text-xs font-bold text-[#C8A762]">{unlocked ? `+${a.points} نقطة` : 'مقفول'}</div>
                </motion.div>
              );
            })}
          </div>
        </motion.div>
      )}
    </div>
  );
}
