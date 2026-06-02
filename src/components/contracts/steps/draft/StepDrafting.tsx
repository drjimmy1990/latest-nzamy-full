import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { PencilSimple, Copy, CheckCircle, Sparkle, ChatCircleDots, PencilLine, X } from "@phosphor-icons/react";
import { CONTRACT_TYPES, CONTRACT_PARAGRAPHS } from "@/components/contracts/constants";
import { ParagraphEditor, VoiceBtn } from "@/components/contracts/SharedComponents";

interface StepDraftingProps {
  isDark: boolean;
  contractType: string;
  copied: boolean;
  setCopied: React.Dispatch<React.SetStateAction<boolean>>;
  paraEdits: Record<string, string>;
  setParaEdits: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  generalEdits: string;
  setGeneralEdits: (v: string) => void;
  contractLanguage: string;
  customLanguageName: string;
  customLanguageLayout: "single" | "dual";
  customLanguageBase: "ar" | "en";
}

// ─── مصفوفة التراجم القانونية للغات المخصصة ───────────────────────────────────
const TRANSLATIONS: Record<string, Record<string, { title: string; body: string }>> = {
  "الفرنسية": {
    p1: { title: "Premièrement: Les Parties", body: "• Première Partie (Employeur): Société [Nom de l'entreprise] – RC [   ] – Siège social à [Adresse]\n• Deuxième Partie (Employé): [Nom Complet] – ID/Résidence [   ] – Nationalité [   ]" },
    p2: { title: "Deuxièmement: Objet du Contrat", body: "La Deuxième Partie travaille en tant que [Titre du poste] sous la supervision de la Première Partie et s'engage à accomplir les tâches qui lui sont confiées conformément à la nature du travail." },
    p3: { title: "Troisièmement: Rémunération", body: "La Deuxième Partie reçoit un salaire mensuel global de [Montant] SAR, versé à la fin de chaque mois civil et comprenant:\n- Salaire de base: [Montant] SAR\n- Indemnité de logement: [Montant] SAR\n- Indemnité de transport: [Montant] SAR" },
    p4: { title: "Quatrièmement: Durée du Contrat", body: "La durée de ce contrat est [Déterminée/Indéterminée] commençant le [Date] et se terminant le [Date], et se renouvelle automatiquement pour des périodes similaires sauf notification contraire de l'une des parties trente jours à l'avance." },
    p5: { title: "Cinquièmement: Période d'Essai", body: "La Deuxième Partie est soumise à une période d'essai de quatre-vingt-dix jours conformément à l'article (53) du Code du Travail." },
    p6: { title: "Sixièmement: Confidentialité", body: "La Deuxième Partie s'engage à ne pas divulguer les secrets d'affaires ou les informations confidentielles pendant la durée du contrat et après son expiration." },
    p7: { title: "Septièmement: Résiliation", body: "Chaque partie peut résilier le contrat après notification écrite de l'autre partie trente jours à l'avance conformément aux dispositions du Code du Travail." },
    p8: { title: "Huitièmement: Loi Applicable", body: "Ce contrat est régi par les lois du Royaume d'Arabie Saoudite, et tout litige sera soumis à l'autorité judiciaire compétente." }
  },
  "الألمانية": {
    p1: { title: "Erstens: Die Parteien", body: "• Erste Partei (Arbeitgeber): Gesellschaft [Name des Unternehmens] – Handelsregister [   ] – Sitz in [Adresse]\n• Zweite Partei (Arbeitnehmer): [Vollständiger Name] – Ausweis/Aufenthalt [   ] – Staatsangehörigkeit [   ]" },
    p2: { title: "Zweitens: Vertragsgegenstand", body: "Die Zweite Partei wird als [Berufsbezeichnung] unter der Aufsicht der Ersten Partei arbeiten und verpflichtet sich, die ihr übertragenen Aufgaben entsprechend der Art der Arbeit auszuführen." },
    p3: { title: "Drittens: Vergütung", body: "Die Zweite Partei erhält ein monatliches Bruttogehalt von [Betrag] SAR, zahlbar am Ende eines jeden Kalendermonats, bestehend aus:\n- Grundgehalt: [Betrag] SAR\n- Wohnungszuschuss: [Betrag] SAR\n- Beförderungszuschuss: [Betrag] SAR" },
    p4: { title: "Viertens: Vertragsdauer", body: "Die Laufzeit dieses Vertrags ist [befristet/unbefristet] und beginnt am [Datum] und endet am [Datum]. Er verlängert sich automatisch um einen ähnlichen Zeitraum, sofern nicht eine der Parteien die andere dreißig Tage im Voraus benachrichtigt." },
    p5: { title: "Fünftens: Probezeit", body: "Die Zweite Partei unterliegt einer Probezeit von neunzig Tagen gemäß Artikel (53) des Arbeitsgesetzes." },
    p6: { title: "Sechstens: Vertraulichkeit", body: "Die Zweite Partei verpflichtet sich, während der Laufzeit des Vertrags und nach dessen Ablauf keine Betriebsgeheimnisse oder vertraulichen Informationen weiterzugeben." },
    p7: { title: "Siebtens: Kündigung", body: "Jede Partei kann den Vertrag nach schriftlicher Benachrichtigung der anderen Partei dreißig Tage im Voraus gemäß den Bestimmungen des Arbeitsgesetzes kündigen." },
    p8: { title: "Achtens: Anwendbares Recht", body: "Dieser Vertrag unterliegt den Gesetzen des Königreichs Saudi-Arabien, und alle Streitigkeiten werden der zuständigen Gerichtsbehörde vorgelegt." }
  },
  "الهندية": {
    p1: { title: "पहला: पक्ष", body: "• प्रथम पक्ष (नियोक्ता): कंपनी [कंपनी का नाम] – वाणिज्यिक पंजीकरण [   ] – मुख्यालय [पता]\n• द्वितीय पक्ष (कर्मचारी): [पूरा नाम] – आईडी/निवास स्थान [   ] – राष्ट्रीयता [   ]" },
    p2: { title: "दूसरा: कार्य क्षेत्र", body: "द्वितीय पक्ष प्रथम पक्ष की देखरेख में [नौकरी का शीर्षक] के रूप में कार्य करेगा, और काम की प्रकृति के अनुसार सौंपे गए कार्यों को करने के लिए प्रतिबद्ध है।" },
    p3: { title: "तीसरा: वित्तीय मुआवजा", body: "द्वितीय पक्ष को प्रति माह [राशि] एसएआर का कुल मासिक वेतन प्राप्त होगा, जिसका भुगतान प्रत्येक कैलेंडर माह के अंत में किया जाएगा और इसमें शामिल हैं:\n- मूल वेतन: [राशि] एसएआर\n- आवास भत्ता: [राशि] एसएआर\n- परिवहन भत्ता: [राशि] एसएआर" },
    p4: { title: "चौथा: अनुबंध की अवधि", body: "इस अनुबंध की अवधि [निश्चित/अनिश्चित] है जो [तिथि] से शुरू होती है और [तिथि] को समाप्त होती है, और स्वतः ही समान अवधियों के लिए नवीनीकृत हो जाएगी जब तक कि कोई एक पक्ष दूसरे पक्ष को तीस दिन पहले सूचित न करे।" },
    p5: { title: "पांचवां: परिवीक्षा अवधि", body: "श्रम कानून के अनुच्छेद (53) के अनुसार द्वितीय पक्ष नब्बे दिनों की परिवीक्षा अवधि के अधीन है।" },
    p6: { title: "छठा: गोपनीयता", body: "द्वितीय पक्ष अनुबंध की अवधि के दौरान और उसके समाप्त होने के बाद व्यावसायिक रहस्यों या गोपनीय जानकारी का खुलासा न करने के लिए प्रतिबद्ध है।" },
    p7: { title: "सातवां: समाप्ति", body: "श्रम कानून के प्रावधानों के अनुसार कोई भी पक्ष दूसरे पक्ष को तीस दिन पहले लिखित सूचना देकर अनुबंध समाप्त कर सकता है।" },
    p8: { title: "आठवां: शासी कानून", body: "यह अनुबंध सऊदी अरब साम्राज्य के नियमों के अधीन है, और किसी भी विवाद को सक्षम न्यायिक प्राधिकरण को भेजा जाएगा।" }
  }
};

const DUAL_HEADERS: Record<string, { title: string; subtitle: string; footer: string }> = {
  "الفرنسية": {
    title: "CONTRAT DE TRAVAIL",
    subtitle: "Réf: [   ] / 2026",
    footer: "Signatures: Première Partie: ___________ · Deuxième Partie: ___________"
  },
  "الألمانية": {
    title: "ARBEITSVERTRAG",
    subtitle: "Ref: [   ] / 2026",
    footer: "Unterschriften: Erste Partei: ___________ · Zweite Partei: ___________"
  },
  "الهندية": {
    title: "अनुबंध पत्र",
    subtitle: "संदर्भ: [   ] / २०२६",
    footer: "हस्ताक्षर: प्रथम पक्ष: ___________ · द्वितीय पक्ष: ___________"
  }
};

// ─── دالة استخراج النص المترجم المناسب ────────────────────────────────────────
function getTranslationForLang(langName: string) {
  const norm = (langName || "").trim();
  if (norm.includes("فرنس") || norm.includes("French")) return TRANSLATIONS["الفرنسية"];
  if (norm.includes("ألمان") || norm.includes("German")) return TRANSLATIONS["الألمانية"];
  if (norm.includes("هند") || norm.includes("Hindi")) return TRANSLATIONS["الهندية"];
  return TRANSLATIONS["الفرنسية"]; // افتراضي فرنسي لمظهر عالي الجودة
}

function getHeaderForLang(langName: string) {
  const norm = (langName || "").trim();
  if (norm.includes("فرنس") || norm.includes("French")) return DUAL_HEADERS["الفرنسية"];
  if (norm.includes("ألمان") || norm.includes("German")) return DUAL_HEADERS["الألمانية"];
  if (norm.includes("هند") || norm.includes("Hindi")) return DUAL_HEADERS["الهندية"];
  return DUAL_HEADERS["الفرنسية"];
}

// ─── مكوّن محرر البنود ثنائي العمود المتقابل المطور ────────────────────────────────
export function BilingualParagraphEditor({
  para,
  translatedPara,
  isDark,
  editNote,
  onEditNote,
  targetLangName
}: {
  para: { id: string; title: string; body: string };
  translatedPara: { title: string; body: string };
  isDark: boolean;
  editNote: string;
  onEditNote: (val: string) => void;
  targetLangName: string;
}) {
  const [hovered, setHovered] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);

  return (
    <div
      className="relative group"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div
        onClick={() => setPanelOpen(v => !v)}
        className={`cursor-pointer rounded-xl p-4 border transition-all ${
          panelOpen
            ? isDark ? "border-amber-500/40 bg-amber-900/10" : "border-amber-400/40 bg-amber-50"
            : hovered
              ? isDark ? "border-white/[0.12] bg-white/[0.04]" : "border-zinc-300 bg-zinc-50"
              : isDark ? "border-transparent" : "border-transparent"
        }`}
      >
        {/* تقسيم شبكي عمودين متقابلين */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 divide-y md:divide-y-0 md:divide-x md:divide-x-reverse divide-zinc-200/50 dark:divide-white/[0.06]">
          {/* العمود الأيمن: عربي (RTL) */}
          <div className="space-y-1.5 md:pe-3">
            <span className={`inline-block text-[9px] px-2 py-0.5 rounded-full font-bold ${
              isDark ? "bg-[#0B3D2E]/30 text-emerald-400" : "bg-[#0B3D2E]/8 text-[#0B3D2E]"
            }`}>العربية</span>
            <p className={`text-[12px] font-bold ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>{para.title}</p>
            <p className={`text-[12px] leading-relaxed whitespace-pre-line ${isDark ? "text-zinc-100" : "text-zinc-800"}`}>{para.body}</p>
          </div>

          {/* العمود الأيسر: اللغة المخصصة الأجنبية (LTR) */}
          <div className="space-y-1.5 pt-3 md:pt-0 md:ps-5 text-left" dir="ltr">
            <span className={`inline-block text-[9px] px-2 py-0.5 rounded-full font-bold ${
              isDark ? "bg-[#C8A762]/15 text-[#C8A762]" : "bg-amber-50 text-amber-800 border border-amber-200"
            }`}>{targetLangName || "اللغة المستهدفة"}</span>
            <p className={`text-[12px] font-bold ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>{translatedPara.title}</p>
            <p className={`text-[12px] leading-relaxed whitespace-pre-line ${isDark ? "text-zinc-100" : "text-zinc-800"}`}>{translatedPara.body}</p>
          </div>
        </div>

        {/* مؤشر التعديل */}
        <AnimatePresence>
          {hovered && !panelOpen && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute top-2 start-2 flex items-center gap-1 rounded-lg px-2 py-1 bg-amber-500/90 text-white text-[10px] font-bold">
              <PencilLine size={10} /> اضغط للتعديل
            </motion.div>
          )}
        </AnimatePresence>

        {editNote && (
          <div className={`mt-3 flex items-center gap-1 text-[10px] ${isDark ? "text-amber-400" : "text-amber-600"}`}>
            <PencilLine size={10} />
            <span>تم إضافة تعديل على هذا البند الثنائي</span>
          </div>
        )}
      </div>

      <AnimatePresence>
        {panelOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 32 }}
            className="overflow-hidden"
          >
            <div className={`mt-1 rounded-xl border p-3 space-y-2 ${isDark ? "border-amber-500/25 bg-amber-900/10" : "border-amber-200 bg-amber-50/80"}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <PencilLine size={12} className="text-amber-500" />
                  <p className={`text-[11px] font-bold ${isDark ? "text-amber-400" : "text-amber-700"}`}>طلب تعديل البند المتقابل</p>
                </div>
                <div className="flex items-center gap-1.5">
                  <VoiceBtn label="صوّت تعديلك" />
                  <button onClick={() => setPanelOpen(false)}>
                    <X size={13} className={isDark ? "text-zinc-600" : "text-zinc-400"} />
                  </button>
                </div>
              </div>
              <textarea
                value={editNote}
                onChange={e => onEditNote(e.target.value)}
                placeholder="اكتب طلب تعديلك على الصياغة العربية أو المقابل المترجم هنا... سيتم التعديل الذكي تلقائياً"
                rows={3}
                className={`w-full rounded-xl border px-3 py-2 text-[12px] outline-none resize-none leading-relaxed ${
                  isDark
                    ? "border-white/[0.08] bg-zinc-800/60 text-zinc-100 placeholder:text-zinc-600"
                    : "border-zinc-200 bg-white text-zinc-800 placeholder:text-zinc-400"
                }`}
              />
              {editNote && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  className={`flex items-center gap-1 text-[10px] ${isDark ? "text-emerald-400" : "text-emerald-600"}`}>
                  <CheckCircle size={11} weight="fill" />
                  تم حفظ التعديل المقترح — سيُطبَّق بالتوازن في النسخة النهائية
                </motion.div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function StepDrafting({
  isDark,
  contractType,
  copied,
  setCopied,
  paraEdits,
  setParaEdits,
  generalEdits,
  setGeneralEdits,
  contractLanguage,
  customLanguageName,
  customLanguageLayout,
  customLanguageBase
}: StepDraftingProps) {
  const card = isDark ? "bg-zinc-900 border border-white/[0.07] rounded-2xl" : "bg-white border border-zinc-200/70 rounded-2xl";
  const inputCls = `w-full rounded-xl border px-4 py-2.5 text-[13px] outline-none ${isDark
      ? "border-white/[0.08] bg-zinc-800/60 text-zinc-100 placeholder:text-zinc-600"
      : "border-zinc-200 bg-zinc-50 text-zinc-800 placeholder:text-zinc-400"
    }`;

  // تحضير الترجمة المخصصة
  const dict = getTranslationForLang(customLanguageName);
  const headerMeta = getHeaderForLang(customLanguageName);

  // دالة النسخ الحكيمة
  const handleCopy = () => {
    let text = "";
    if (contractLanguage === "custom") {
      if (customLanguageLayout === "dual") {
        text = `بسم الله الرحمن الرحيم\n\n` +
          `عقد عمل مشترك / ${headerMeta.title}\n` +
          `رقم: [   ] / ١٤٤٧هـ  ·  ${headerMeta.subtitle}\n\n` +
          `======================================================\n\n` +
          CONTRACT_PARAGRAPHS.map(p => {
            const trans = dict[p.id] || p;
            return `[العربية - ${p.title}]\n${p.body}\n\n[${customLanguageName || "اللغة الأجنبية"} - ${trans.title}]\n${trans.body}`;
          }).join("\n\n──────────────────────────────────────────────────────\n\n") +
          `\n\nالتوقيع: الطرف الأول: ______________ · الطرف الثاني: ______________\n` +
          `${headerMeta.footer}`;
      } else {
        text = `${headerMeta.title}\n` +
          `${headerMeta.subtitle}\n\n` +
          CONTRACT_PARAGRAPHS.map(p => {
            const trans = dict[p.id] || p;
            return `${trans.title}\n${trans.body}`;
          }).join("\n\n") +
          `\n\n${headerMeta.footer}`;
      }
    } else {
      text = CONTRACT_PARAGRAPHS.map(p => `${p.title}\n${p.body}`).join("\n\n");
    }
    
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
      <div className={`${card} px-5 py-3.5 shadow-sm flex items-center justify-between`}>
        <div className="flex items-center gap-2">
          <PencilSimple size={14} className={isDark ? "text-zinc-500" : "text-zinc-400"} />
          <span className={`text-[13px] font-semibold ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>
            {contractLanguage === "custom"
              ? `عقد عمل (${customLanguageName || "لغة مخصصة"}) — نسخة ${customLanguageLayout === "dual" ? "ثنائية متقابلة" : "أحادية"}`
              : (CONTRACT_TYPES.find(c => c.id === contractType)?.title ?? "العقد المُصاغ")}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <VoiceBtn />
          <button
            onClick={handleCopy}
            className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[11px] border ${isDark ? "border-white/[0.07] bg-zinc-800 text-zinc-400" : "border-zinc-200 bg-zinc-50 text-zinc-500"}`}
          >
            {copied ? <CheckCircle size={12} className="text-emerald-500" /> : <Copy size={12} />}
            {copied ? "تم النسخ" : "نسخ العقد الكامل"}
          </button>
        </div>
      </div>

      {/* تلميح ذكي */}
      <div className={`rounded-xl px-3 py-2 flex items-center gap-2 ${isDark ? "bg-amber-900/15 border border-amber-700/25" : "bg-amber-50 border border-amber-200"}`}>
        <Sparkle size={12} className="text-amber-500 flex-shrink-0" weight="fill" />
        <p className={`text-[11px] ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
          {contractLanguage === "custom" && customLanguageLayout === "dual"
            ? "اضغط على أي بند ثنائي متقابل لتعديله بالكتابة أو الإملاء الصوتي لكلا اللغتين بالتوازي"
            : "اضغط على أي بند لتعديله بالكتابة أو الإملاء الصوتي مباشرةً"}
        </p>
      </div>

      {/* ورقة العقد المطور */}
      <div className={`${card} p-6 shadow-sm space-y-2`}>
        
        {/* رأس العقد ثنائي أو أحادي */}
        {contractLanguage === "custom" && customLanguageLayout === "dual" ? (
          <div className="grid grid-cols-2 gap-5 mb-5 text-center">
            <div className="pe-3">
              <p className={`text-[14px] font-bold mb-1 ${isDark ? "text-zinc-100" : "text-zinc-800"}`}>بسم الله الرحمن الرحيم</p>
              <p className={`text-[13px] font-bold ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>عقد عمل مشترك</p>
              <p className={`text-[11px] ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>رقم: [   ] / ١٤٤٧هـ</p>
            </div>
            <div className="ps-3 text-left font-sans" dir="ltr">
              <p className={`text-[14px] font-bold mb-1 ${isDark ? "text-zinc-100" : "text-zinc-800"}`}>IN THE NAME OF ALLAH</p>
              <p className={`text-[13px] font-bold ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>{headerMeta.title}</p>
              <p className={`text-[11px] ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>{headerMeta.subtitle}</p>
            </div>
          </div>
        ) : contractLanguage === "custom" && customLanguageLayout === "single" ? (
          <div className="text-center mb-5 font-sans" dir="ltr">
            <p className={`text-[14px] font-bold mb-1 ${isDark ? "text-zinc-100" : "text-zinc-800"}`}>IN THE NAME OF ALLAH</p>
            <p className={`text-[13px] font-bold mb-1 ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>{headerMeta.title}</p>
            <p className={`text-[11px] ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>{headerMeta.subtitle}</p>
          </div>
        ) : (
          <>
            <p className={`text-center text-[14px] font-bold mb-4 ${isDark ? "text-zinc-100" : "text-zinc-800"}`}>بسم الله الرحمن الرحيم</p>
            <p className={`text-center text-[13px] font-bold mb-1 ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>
              {CONTRACT_TYPES.find(c => c.id === contractType)?.title ?? "عقد"}
            </p>
            <p className={`text-center text-[12px] mb-5 ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>رقم: [   ] / ١٤٤٧هـ</p>
          </>
        )}

        <div className={`h-px mb-5 ${isDark ? "bg-white/[0.06]" : "bg-zinc-200"}`} />

        {/* عرض الفقرات بالتنسيق الشبكي الثنائي أو العادي الأنيق */}
        <div className="space-y-2">
          {CONTRACT_PARAGRAPHS.map((para) => {
            if (contractLanguage === "custom" && customLanguageLayout === "dual") {
              const trans = dict[para.id] || para;
              return (
                <BilingualParagraphEditor
                  key={para.id}
                  para={para}
                  translatedPara={trans}
                  isDark={isDark}
                  targetLangName={customLanguageName}
                  editNote={paraEdits[para.id] ?? ""}
                  onEditNote={(val) => setParaEdits((prev) => ({ ...prev, [para.id]: val }))}
                />
              );
            } else if (contractLanguage === "custom" && customLanguageLayout === "single") {
              const trans = dict[para.id] || para;
              return (
                <ParagraphEditor
                  key={para.id}
                  para={{ id: para.id, title: trans.title, body: trans.body }}
                  isDark={isDark}
                  editNote={paraEdits[para.id] ?? ""}
                  onEditNote={(val) => setParaEdits((prev) => ({ ...prev, [para.id]: val }))}
                />
              );
            } else {
              return (
                <ParagraphEditor
                  key={para.id}
                  para={para}
                  isDark={isDark}
                  editNote={paraEdits[para.id] ?? ""}
                  onEditNote={(val) => setParaEdits((prev) => ({ ...prev, [para.id]: val }))}
                />
              );
            }
          })}
        </div>

        {/* تذييل العقد والتواقيع */}
        <div className={`mt-5 pt-4 border-t ${isDark ? "border-white/[0.06]" : "border-zinc-100"}`}>
          {contractLanguage === "custom" && customLanguageLayout === "dual" ? (
            <div className="grid grid-cols-2 gap-5 text-[11px]">
              <div className="text-right">
                <p className={isDark ? "text-zinc-500" : "text-zinc-400"}>
                  التوقيع: الطرف الأول: ________________ · الطرف الثاني: ________________
                </p>
                <p className={`mt-0.5 ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>التاريخ: __ / __ / ١٤٤٧هـ</p>
              </div>
              <div className="text-left font-sans text-[10px]" dir="ltr">
                <p className={isDark ? "text-zinc-500" : "text-zinc-400"}>
                  {headerMeta.footer}
                </p>
                <p className={`mt-0.5 ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>Date: __ / __ / 2026</p>
              </div>
            </div>
          ) : contractLanguage === "custom" && customLanguageLayout === "single" ? (
            <div className="text-left font-sans text-[11px]" dir="ltr">
              <p className={isDark ? "text-zinc-500" : "text-zinc-400"}>
                {headerMeta.footer}
              </p>
              <p className={`mt-0.5 ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>Date: __ / __ / 2026</p>
            </div>
          ) : (
            <>
              <p className={`text-[11px] text-center ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>
                التوقيع: الطرف الأول: ________________ · الطرف الثاني: ________________
              </p>
              <p className={`text-[11px] text-center mt-0.5 ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>التاريخ: __ / __ / ١٤٤٧هـ</p>
            </>
          )}
        </div>
      </div>

      {/* صندوق التعديلات العامة المطور */}
      <div className={`${card} p-5 shadow-sm space-y-3`}>
        <div className="flex items-center gap-2">
          <ChatCircleDots size={15} className="text-[#C8A762]" weight="duotone" />
          <p className={`text-[13px] font-bold ${isDark ? "text-zinc-200" : "text-zinc-700"}`}>هل لديك تعديلات عامة؟</p>
        </div>
        <div className="relative">
          <textarea
            value={generalEdits}
            onChange={e => setGeneralEdits(e.target.value)}
            placeholder="اذكر أي تعديلات عامة على العقد هنا... مثلاً: غيّر جميع أسماء البنود لتكون أكثر رسمية، أو أضف ديباجة شاملة، أو عدّل البند الثالث بالكامل..."
            rows={4}
            className={`${inputCls} resize-none pe-20`}
          />
          <div className="absolute bottom-3 start-3">
            <VoiceBtn label="صوّت التعديل" />
          </div>
        </div>
      </div>
    </motion.div>
  );
}
