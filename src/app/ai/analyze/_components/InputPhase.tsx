"use client";
import { useState, useRef, memo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FilePdf, FileDoc, FileImage, X, Plus, MagnifyingGlass,
  Microphone, VideoCamera, Note, UploadSimple, Sparkle,
} from "@phosphor-icons/react";

// ─── Types ────────────────────────────────────────────────────────────────────
export type MediaKind = "note" | "audio" | "video";
export interface CaseFile   { name: string; size: string; kind: "pdf" | "doc" | "img"; }
export interface MediaItem  { id: string; kind: MediaKind; label: string; content?: string; fileName?: string; }

// ─── Spring presets ───────────────────────────────────────────────────────────
const sp     = { type: "spring" as const, stiffness: 320, damping: 28 };
const stagger= { hidden:{}, show:{ transition:{ staggerChildren:0.07 } } };
const fadeUp = { hidden:{ opacity:0, y:10 }, show:{ opacity:1, y:0, transition:sp } };

// ─── Isolated: waveform (perpetual — never re-renders parent) ─────────────────
const Waveform = memo(function Waveform() {
  return (
    <span className="inline-flex items-end gap-[2px] h-4 ml-2">
      {[0,1,2,3,4,5,6,7].map(i => (
        <motion.span key={i} className="w-[2px] rounded-full bg-[#C8A762]/60"
          animate={{ scaleY:[0.3,1,0.4,0.8,0.3] }}
          transition={{ duration:1.4, repeat:Infinity, delay:i*0.09, ease:"easeInOut" }}
          style={{ height:14, transformOrigin:"bottom" }} />
      ))}
    </span>
  );
});

// ─── File icon helper ─────────────────────────────────────────────────────────
function FileIcon({ kind }: { kind: CaseFile["kind"] }) {
  if (kind === "pdf") return <FilePdf  size={22} weight="duotone" className="text-red-400 flex-shrink-0" />;
  if (kind === "doc") return <FileDoc  size={22} weight="duotone" className="text-blue-400 flex-shrink-0" />;
  return                     <FileImage size={22} weight="duotone" className="text-purple-400 flex-shrink-0" />;
}

// ─── Props ────────────────────────────────────────────────────────────────────
interface Props {
  isDark: boolean;
  files: CaseFile[];
  mediaItems: MediaItem[];
  context: string;
  onFiles: (f: CaseFile[]) => void;
  onAddMedia: (m: MediaItem) => void;
  onRemoveMedia: (id: string) => void;
  onContext: (v: string) => void;
  onSubmit: () => void;
}

const MEDIA_TABS: { id: MediaKind; label: string; Icon: React.ElementType }[] = [
  { id:"note",  label:"ملاحظات",  Icon: Note },
  { id:"audio", label:"صوتيات",   Icon: Microphone },
  { id:"video", label:"مرئيات",   Icon: VideoCamera },
];

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function InputPhase({
  isDark, files, mediaItems, context,
  onFiles, onAddMedia, onRemoveMedia, onContext, onSubmit,
}: Props) {
  const [dragging, setDragging]   = useState(false);
  const [mediaTab, setMediaTab]   = useState<MediaKind>("note");
  const [noteText, setNoteText]   = useState("");
  const [mediaDrag, setMediaDrag] = useState(false);
  const fileRef  = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLInputElement>(null);

  const ts  = isDark ? "text-zinc-500"                : "text-zinc-400";
  const bdr = isDark ? "border-white/[0.07]"          : "border-zinc-200";
  const bg  = isDark ? "bg-zinc-900/70 backdrop-blur" : "bg-white";

  function parseFiles(fl: FileList | null): CaseFile[] {
    if (!fl) return [];
    return Array.from(fl).map(f => ({
      name: f.name,
      size: (f.size/1024/1024).toFixed(1) + " MB",
      kind: f.name.match(/\.pdf$/i)   ? "pdf"
          : f.name.match(/\.(doc|docx)$/i) ? "doc" : "img",
    }));
  }

  function addNote() {
    if (!noteText.trim()) return;
    onAddMedia({ id:crypto.randomUUID(), kind:"note", label: `ملاحظة ${mediaItems.filter(m=>m.kind==="note").length+1}`, content:noteText.trim() });
    setNoteText("");
  }

  function addMediaFile(fl: FileList | null, kind: "audio"|"video") {
    if (!fl?.length) return;
    const f = fl[0];
    onAddMedia({ id:crypto.randomUUID(), kind, label:f.name.replace(/\.[^/.]+$/,""), fileName:f.name });
  }

  const canSubmit = files.length > 0 || mediaItems.length > 0 || context.trim().length > 8;

  return (
    <motion.div variants={stagger} initial="hidden" animate="show" className="space-y-5">

      {/* ── Header ── */}
      <motion.div variants={fadeUp} className="space-y-1">
        <h2 className={`text-[22px] font-black tracking-tight ${isDark?"text-white":"text-zinc-900"}`}>
          عصارة المرفقات
        </h2>
        <p className={`text-[13px] ${ts}`}>
          أضف مرفقات القضية وملاحظات العميل — الـ AI يستخرج كل ما له قيمة قانونية
        </p>
      </motion.div>

      {/* ── Asymmetric 2-col grid ── */}
      <motion.div variants={fadeUp}
        className="grid grid-cols-1 md:grid-cols-[2fr_1fr] gap-4">

        {/* ═══ LEFT: مرفقات القضية ═══ */}
        <div className={`rounded-2xl border-2 ${bdr} ${bg} overflow-hidden`}>
          {/* Zone header */}
          <div className={`flex items-center gap-2.5 px-5 py-3.5 border-b ${bdr}`}>
            <div className={`w-7 h-7 rounded-xl flex items-center justify-center
              ${isDark?"bg-blue-500/10 text-blue-400":"bg-blue-50 text-blue-600"}`}>
              <UploadSimple size={14} weight="bold" />
            </div>
            <span className={`text-[13px] font-bold ${isDark?"text-zinc-200":"text-zinc-800"}`}>
              مرفقات القضية
            </span>
            {files.length > 0 && (
              <span className={`mr-auto text-[11px] font-mono font-bold ${isDark?"text-zinc-500":"text-zinc-400"}`}>
                {files.length} ملف
              </span>
            )}
          </div>

          {/* Dropzone */}
          <input ref={fileRef} type="file" multiple accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" className="hidden"
            onChange={e => onFiles([...files, ...parseFiles(e.target.files)])} />
          <button
            onClick={() => fileRef.current?.click()}
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={e => { e.preventDefault(); setDragging(false); onFiles([...files, ...parseFiles(e.dataTransfer.files)]); }}
            className={`w-full flex flex-col items-center justify-center gap-3 py-10 transition-all active:scale-[0.99]
              ${dragging
                ? isDark ? "bg-blue-500/5 border-blue-500/30" : "bg-blue-50"
                : isDark ? "hover:bg-white/[0.02]"           : "hover:bg-zinc-50"
              } ${files.length===0 ? "min-h-[180px]" : "py-6"}`}>
            <motion.div animate={dragging ? { scale:1.15 } : { scale:1 }} transition={sp}
              className={`w-14 h-14 rounded-2xl flex items-center justify-center border
                ${isDark
                  ? "border-white/[0.08] bg-zinc-800/60 text-zinc-500"
                  : "border-zinc-200 bg-zinc-50 text-zinc-400"
                }`}>
              <UploadSimple size={26} weight="duotone" />
            </motion.div>
            <div className="text-center">
              <p className={`text-[13px] font-bold ${isDark?"text-zinc-300":"text-zinc-700"}`}>
                اسحب الملفات هنا أو اضغط للرفع
              </p>
              <p className={`text-[11px] mt-0.5 ${ts}`}>PDF · Word · صور</p>
            </div>
          </button>

          {/* File list */}
          <AnimatePresence>
            {files.length > 0 && (
              <motion.div initial={{ height:0 }} animate={{ height:"auto" }} exit={{ height:0 }} className="overflow-hidden">
                <div className={`border-t ${bdr} divide-y ${isDark?"divide-white/[0.04]":"divide-zinc-100"}`}>
                  {files.map((f,i) => (
                    <motion.div key={`${f.name}-${i}`} initial={{ opacity:0, x:-8 }} animate={{ opacity:1, x:0 }}
                      transition={{ ...sp, delay:i*0.05 }}
                      className="flex items-center gap-3 px-5 py-3">
                      <FileIcon kind={f.kind} />
                      <div className="flex-1 min-w-0">
                        <p className={`text-[12px] font-bold truncate ${isDark?"text-zinc-200":"text-zinc-800"}`}>{f.name}</p>
                        <p className={`text-[10px] font-mono ${ts}`}>{f.size}</p>
                      </div>
                      <button onClick={() => onFiles(files.filter((_,j)=>j!==i))}
                        className={`p-1.5 rounded-lg transition-colors ${isDark?"hover:bg-white/10 text-zinc-600 hover:text-zinc-400":"hover:bg-zinc-100 text-zinc-400"}`}>
                        <X size={12} weight="bold" />
                      </button>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* ═══ RIGHT: ملاحظات ومرئيات العميل ═══ */}
        <div className={`rounded-2xl border-2 ${bdr} ${bg} overflow-hidden flex flex-col`}>
          {/* Zone header */}
          <div className={`flex items-center gap-2.5 px-4 py-3.5 border-b ${bdr}`}>
            <div className={`w-7 h-7 rounded-xl flex items-center justify-center
              ${isDark?"bg-[#C8A762]/10 text-[#C8A762]":"bg-amber-50 text-amber-700"}`}>
              <Note size={14} weight="fill" />
            </div>
            <span className={`text-[13px] font-bold ${isDark?"text-zinc-200":"text-zinc-800"}`}>
              ملاحظات ومرئيات العميل
            </span>
          </div>

          {/* Mini type tabs */}
          <div className={`flex gap-1 p-2 border-b ${bdr}`}>
            {MEDIA_TABS.map(({ id, label, Icon }) => (
              <button key={id} onClick={() => setMediaTab(id)}
                className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-xl text-[11px] font-bold transition-all active:scale-[0.97]
                  ${mediaTab===id
                    ? isDark ? "bg-[#C8A762]/15 text-[#C8A762] border border-[#C8A762]/25"
                             : "bg-amber-100 text-amber-800 border border-amber-200"
                    : isDark ? "text-zinc-500 hover:text-zinc-300"
                             : "text-zinc-400 hover:text-zinc-700"
                  }`}>
                <Icon size={12} weight={mediaTab===id?"fill":"regular"} />
                {label}
              </button>
            ))}
          </div>

          {/* Input area */}
          <div className="flex-1 p-3 space-y-2">
            <AnimatePresence mode="wait">
              {mediaTab === "note" && (
                <motion.div key="note" initial={{ opacity:0, y:5 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0 }} transition={sp} className="space-y-2">
                  <textarea value={noteText} onChange={e => setNoteText(e.target.value)} rows={4}
                    placeholder="اكتب ما قاله العميل... الـ AI يحدد ما له قيمة قانونية ويتجاهل الباقي"
                    className={`w-full resize-none rounded-xl border px-3 py-2.5 text-[12px] leading-relaxed outline-none transition-all
                      focus:ring-2 focus:ring-[#C8A762]/20 focus:border-[#C8A762]/40
                      ${isDark?"border-white/[0.07] bg-zinc-800/60 text-white placeholder:text-zinc-600"
                               :"border-zinc-200 bg-zinc-50 text-zinc-900 placeholder:text-zinc-400"}`} />
                  <button onClick={addNote} disabled={!noteText.trim()}
                    className={`w-full flex items-center justify-center gap-1.5 py-2 rounded-xl text-[12px] font-bold transition-all active:scale-[0.97] disabled:opacity-40
                      ${isDark?"border border-white/[0.08] bg-zinc-800 text-zinc-200 hover:border-[#C8A762]/30"
                               :"border border-zinc-200 bg-white text-zinc-700 hover:border-amber-300"}`}>
                    <Plus size={13} weight="bold" /> إضافة الملاحظة
                  </button>
                </motion.div>
              )}
              {(mediaTab==="audio"||mediaTab==="video") && (
                <motion.div key={mediaTab} initial={{ opacity:0, y:5 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0 }} transition={sp}>
                  <input ref={mediaTab==="audio"?audioRef:videoRef} type="file"
                    accept={mediaTab==="audio"?".mp3,.m4a,.wav":".mp4,.mov,.webm"} className="hidden"
                    onChange={e => addMediaFile(e.target.files, mediaTab)} />
                  <button
                    onClick={() => (mediaTab==="audio"?audioRef:videoRef).current?.click()}
                    onDragOver={e => { e.preventDefault(); setMediaDrag(true); }}
                    onDragLeave={() => setMediaDrag(false)}
                    onDrop={e => { e.preventDefault(); setMediaDrag(false); addMediaFile(e.dataTransfer.files, mediaTab); }}
                    className={`w-full flex flex-col items-center gap-2.5 py-7 rounded-xl border-2 border-dashed transition-all active:scale-[0.99]
                      ${mediaDrag
                        ? isDark?"border-[#C8A762]/50 bg-[#C8A762]/5":"border-amber-400 bg-amber-50"
                        : isDark?"border-white/[0.07] hover:border-[#C8A762]/25":"border-zinc-200 hover:border-amber-300"
                      }`}>
                    {mediaTab==="audio"
                      ? <Microphone size={28} weight="duotone" className={ts} />
                      : <VideoCamera size={28} weight="duotone" className={ts} />
                    }
                    <p className={`text-[12px] font-bold ${isDark?"text-zinc-300":"text-zinc-700"}`}>
                      {mediaTab==="audio"?"ارفع تسجيلاً صوتياً":"ارفع مقطعاً مرئياً"}
                    </p>
                    <p className={`text-[10px] ${ts}`}>
                      {mediaTab==="audio"?"MP3 · M4A · WAV":"MP4 · MOV · WEBM"}
                    </p>
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Added media items */}
            <AnimatePresence>
              {mediaItems.map(m => (
                <motion.div key={m.id} layout initial={{ opacity:0, scale:0.96 }} animate={{ opacity:1, scale:1 }} exit={{ opacity:0, scale:0.94 }} transition={sp}
                  className={`group flex items-center gap-2.5 rounded-xl border px-3 py-2 transition-colors
                    ${isDark?"border-white/[0.06] bg-zinc-800/40 hover:border-[#C8A762]/25":"border-zinc-200 bg-white hover:border-amber-200"}`}>
                  {m.kind==="note"  && <Note        size={14} weight="duotone" className="text-[#C8A762] flex-shrink-0" />}
                  {m.kind==="audio" && <><Microphone size={14} weight="duotone" className="text-[#C8A762] flex-shrink-0" /><Waveform /></>}
                  {m.kind==="video" && <VideoCamera  size={14} weight="duotone" className="text-[#C8A762] flex-shrink-0" />}
                  <p className={`flex-1 truncate text-[11px] font-bold ${isDark?"text-zinc-300":"text-zinc-700"}`}>{m.label}</p>
                  <button onClick={() => onRemoveMedia(m.id)}
                    className={`opacity-0 group-hover:opacity-100 p-1 rounded-lg transition-all ${isDark?"hover:bg-white/10 text-zinc-600":"hover:bg-zinc-100 text-zinc-400"}`}>
                    <X size={11} weight="bold" />
                  </button>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>
      </motion.div>

      {/* ── Context textarea (optional) ── */}
      <motion.div variants={fadeUp} className="space-y-1.5">
        <label className={`text-[11px] font-bold uppercase tracking-wider ${ts}`}>
          سياق إضافي — اختياري
        </label>
        <div className="relative">
          <textarea value={context} onChange={e => onContext(e.target.value)} rows={3}
            placeholder="من تمثل؟ ما المنتج القانوني المستهدف؟ ما الجانب الذي تريد التركيز عليه؟"
            className={`w-full resize-none rounded-2xl border px-5 py-4 text-[13px] leading-relaxed outline-none transition-all
              focus:ring-2 focus:ring-[#C8A762]/15 focus:border-[#C8A762]/35
              ${isDark?"border-white/[0.07] bg-zinc-900/60 text-white placeholder:text-zinc-600"
                       :"border-zinc-200 bg-white text-zinc-900 placeholder:text-zinc-400"}`} />
          <span className={`absolute bottom-3 left-4 text-[10px] font-mono ${ts}`}>{context.length}</span>
        </div>
      </motion.div>

      {/* ── Submit ── */}
      <motion.div variants={fadeUp} className="flex items-center justify-between gap-4">
        <p className={`text-[11px] ${ts}`}>
          {files.length + mediaItems.length === 0
            ? "أضف على الأقل ملفاً واحداً أو ملاحظة للبدء"
            : `${files.length} مرفق · ${mediaItems.length} من مواد العميل`
          }
        </p>
        <motion.button
          onClick={onSubmit} disabled={!canSubmit}
          whileHover={canSubmit ? { scale:1.02, y:-1 } : {}}
          whileTap={canSubmit ? { scale:0.97 } : {}}
          transition={sp}
          className={`flex items-center gap-2.5 px-8 py-3.5 rounded-2xl font-black text-[14px] transition-all shadow-xl
            ${canSubmit
              ? "bg-[#0B3D2E] text-white hover:bg-[#0a3328] shadow-[#0B3D2E]/20"
              : "bg-zinc-200 text-zinc-400 cursor-not-allowed dark:bg-zinc-800 dark:text-zinc-600"
            }`}>
          <Sparkle size={18} weight="fill" />
          ابدأ العصر
          <MagnifyingGlass size={16} weight="bold" />
        </motion.button>
      </motion.div>
    </motion.div>
  );
}
