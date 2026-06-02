"use client";

import { motion } from "framer-motion";
import { useState } from "react";
import {
  WhatsappLogo,
  Envelope,
  MapPin,
  Clock,
  Phone,
  ArrowLeft,
  ArrowRight,
  TwitterLogo,
  LinkedinLogo,
  InstagramLogo,
  YoutubeLogo,
  Check,
  Warning,
  CaretRight,
  ChatCircleDots,
} from "@phosphor-icons/react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import FloatingButtons from "@/components/FloatingButtons";
import { useTheme } from "@/components/ThemeProvider";
import Link from "next/link";

// ─── Types ────────────────────────────────────────────────────────────────────

type FormState = {
  name: string;
  email: string;
  phone: string;
  subject: string;
  message: string;
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function ContactPage() {
  const { isRTL, isDark } = useTheme();
  const [form, setForm] = useState<FormState>({ name: "", email: "", phone: "", subject: "", message: "" });
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const Arrow = isRTL ? ArrowLeft : ArrowRight;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setTimeout(() => { setLoading(false); setSubmitted(true); }, 1200);
  };

  const inputClass = `w-full rounded-xl border px-4 py-3 text-sm outline-none transition focus:ring-2 ${isDark
    ? "border-white/10 bg-[#1c2128] text-white placeholder:text-gray-500 focus:border-royal/50 focus:ring-royal/20"
    : "border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus:border-royal/50 focus:ring-royal/10"}`;

  const subjects = {
    ar: ["استشارة قانونية", "شكوى أو ملاحظة", "شراكة تجارية", "دعم تقني", "أخرى"],
    en: ["Legal Consultation", "Complaint or Feedback", "Business Partnership", "Technical Support", "Other"],
  };

  return (
    <div dir={isRTL ? "rtl" : "ltr"} className={`min-h-screen ${isDark ? "bg-dark-bg text-white" : "bg-white text-slate-900"}`}>
      <Navbar />

      {/* ── Header ── */}
      <section className={`pt-32 pb-16 ${isDark ? "bg-[#0e1218]" : "bg-slate-50"}`}>
        <div className="mx-auto max-w-4xl px-4 text-center">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <span className={`mb-4 inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium ${isDark ? "bg-royal/20 text-green-300" : "bg-royal/10 text-royal"}`}>
              <ChatCircleDots size={14} weight="fill" />
              {isRTL ? "تواصل معنا" : "Contact Us"}
            </span>
            <h1 className={`mt-3 text-4xl font-bold ${isDark ? "text-white" : "text-slate-900"}`}>
              {isRTL ? "كيف يمكننا مساعدتك؟" : "How Can We Help You?"}
            </h1>
            <p className={`mx-auto mt-4 max-w-xl text-lg ${isDark ? "text-gray-400" : "text-slate-500"}`}>
              {isRTL
                ? "فريقنا جاهز للإجابة على جميع استفساراتك خلال أوقات العمل الرسمية."
                : "Our team is ready to answer all your inquiries during official working hours."}
            </p>
          </motion.div>
        </div>
      </section>

      {/* ── Main content ── */}
      <section className={`py-16 ${isDark ? "bg-dark-bg" : "bg-white"}`}>
        <div className="mx-auto max-w-6xl px-4">
          <div className="grid gap-10 lg:grid-cols-5">

            {/* ─ Contact info ─ */}
            <div className="lg:col-span-2 space-y-5">
              {[
                {
                  icon: WhatsappLogo,
                  title: isRTL ? "واتساب" : "WhatsApp",
                  value: "+966 56 065 5552",
                  sub: isRTL ? "رد خلال دقائق" : "Reply within minutes",
                  color: "bg-green-500/10 text-green-500",
                  href: "https://wa.me/966560655552",
                },
                {
                  icon: Phone,
                  title: isRTL ? "الهاتف" : "Phone",
                  value: "055 597 9607",
                  sub: isRTL ? "أحد – خميس ٨ص – ١٠م" : "Sun – Thu 8am – 10pm",
                  color: "bg-blue-500/10 text-blue-500",
                  href: "tel:+966555979607",
                },
                {
                  icon: Envelope,
                  title: isRTL ? "البريد الإلكتروني" : "Email",
                  value: "info@nezamy.com",
                  sub: isRTL ? "رد خلال ٢٤ ساعة" : "Reply within 24 hours",
                  color: "bg-royal/10 text-royal",
                  href: "mailto:info@nezamy.com",
                },
                {
                  icon: MapPin,
                  title: isRTL ? "العنوان" : "Address",
                  value: isRTL ? "مكة المكرمة — بطحاء قريش" : "Makkah — Batha Quraish",
                  sub: isRTL ? "المملكة العربية السعودية" : "Kingdom of Saudi Arabia",
                  color: "bg-amber-500/10 text-amber-500",
                  href: "#map",
                },
                {
                  icon: Clock,
                  title: isRTL ? "أوقات العمل" : "Working Hours",
                  value: isRTL ? "أحد – خميس ٨ص – ١٠م" : "Sun – Thu 8am – 10pm",
                  sub: isRTL ? "الجمعة والسبت: ٩ص – ٥م" : "Fri – Sat: 9am – 5pm",
                  color: "bg-purple-500/10 text-purple-500",
                  href: null,
                },
              ].map((item, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: isRTL ? 20 : -20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.07 }}
                >
                  {item.href ? (
                    <a href={item.href} className={`flex items-center gap-4 rounded-2xl border p-5 transition hover:shadow-md ${isDark ? "border-white/10 bg-dark-card hover:border-white/20" : "border-slate-200 bg-slate-50 hover:border-slate-300"}`}>
                      <div className={`shrink-0 rounded-xl p-3 ${item.color}`}>
                        <item.icon size={22} weight="bold" />
                      </div>
                      <div>
                        <p className={`text-xs ${isDark ? "text-gray-500" : "text-slate-400"}`}>{item.title}</p>
                        <p className={`font-semibold ${isDark ? "text-white" : "text-slate-900"}`}>{item.value}</p>
                        <p className={`text-xs ${isDark ? "text-gray-500" : "text-slate-400"}`}>{item.sub}</p>
                      </div>
                    </a>
                  ) : (
                    <div className={`flex items-center gap-4 rounded-2xl border p-5 ${isDark ? "border-white/10 bg-dark-card" : "border-slate-200 bg-slate-50"}`}>
                      <div className={`shrink-0 rounded-xl p-3 ${item.color}`}>
                        <item.icon size={22} weight="bold" />
                      </div>
                      <div>
                        <p className={`text-xs ${isDark ? "text-gray-500" : "text-slate-400"}`}>{item.title}</p>
                        <p className={`font-semibold ${isDark ? "text-white" : "text-slate-900"}`}>{item.value}</p>
                        <p className={`text-xs ${isDark ? "text-gray-500" : "text-slate-400"}`}>{item.sub}</p>
                      </div>
                    </div>
                  )}
                </motion.div>
              ))}

              {/* Social links */}
              <div className={`rounded-2xl border p-5 ${isDark ? "border-white/10 bg-dark-card" : "border-slate-200 bg-slate-50"}`}>
                <p className={`mb-3 text-sm font-medium ${isDark ? "text-gray-400" : "text-slate-600"}`}>
                  {isRTL ? "تابعنا على" : "Follow us on"}
                </p>
                <div className="flex gap-3">
                  {[
                    { icon: TwitterLogo, href: "https://x.com/nezamy", color: "hover:text-sky-400" },
                    { icon: LinkedinLogo, href: "https://linkedin.com/company/nezamy", color: "hover:text-blue-500" },
                    { icon: InstagramLogo, href: "https://instagram.com/nezamy", color: "hover:text-pink-500" },
                    { icon: YoutubeLogo, href: "https://youtube.com/@nezamy", color: "hover:text-red-500" },
                  ].map((s, i) => (
                    <a key={i} href={s.href} target="_blank" rel="noopener noreferrer" className={`rounded-xl border p-3 transition ${isDark ? "border-white/10 text-gray-400" : "border-slate-200 text-slate-500"} ${s.color}`}>
                      <s.icon size={20} weight="bold" />
                    </a>
                  ))}
                </div>
              </div>
            </div>

            {/* ─ Contact form ─ */}
            <div className="lg:col-span-3">
              <div className={`rounded-3xl border p-8 ${isDark ? "border-white/10 bg-dark-card" : "border-slate-200 bg-slate-50"}`}>
                {submitted ? (
                  <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center py-12 text-center">
                    <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-500/10">
                      <Check size={32} weight="bold" className="text-green-500" />
                    </div>
                    <h3 className={`text-xl font-bold ${isDark ? "text-white" : "text-slate-900"}`}>
                      {isRTL ? "تم إرسال رسالتك!" : "Message Sent!"}
                    </h3>
                    <p className={`mt-2 text-sm ${isDark ? "text-gray-400" : "text-slate-500"}`}>
                      {isRTL ? "سنتواصل معك خلال ٢٤ ساعة." : "We'll get back to you within 24 hours."}
                    </p>
                    <button onClick={() => { setSubmitted(false); setForm({ name: "", email: "", phone: "", subject: "", message: "" }); }} className="mt-6 rounded-xl bg-royal px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-royal/90">
                      {isRTL ? "إرسال رسالة أخرى" : "Send Another Message"}
                    </button>
                  </motion.div>
                ) : (
                  <form onSubmit={handleSubmit} className="space-y-5">
                    <h2 className={`text-xl font-bold ${isDark ? "text-white" : "text-slate-900"}`}>
                      {isRTL ? "أرسل لنا رسالة" : "Send Us a Message"}
                    </h2>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <label className={`mb-1.5 block text-xs font-medium ${isDark ? "text-gray-400" : "text-slate-600"}`}>
                          {isRTL ? "الاسم الكامل *" : "Full Name *"}
                        </label>
                        <input
                          required
                          value={form.name}
                          onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                          placeholder={isRTL ? "محمد أحمد" : "John Doe"}
                          className={inputClass}
                        />
                      </div>
                      <div>
                        <label className={`mb-1.5 block text-xs font-medium ${isDark ? "text-gray-400" : "text-slate-600"}`}>
                          {isRTL ? "رقم الجوال *" : "Phone Number *"}
                        </label>
                        <input
                          required
                          type="tel"
                          value={form.phone}
                          onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                          placeholder="+966 5x xxx xxxx"
                          className={inputClass}
                          dir="ltr"
                        />
                      </div>
                    </div>

                    <div>
                      <label className={`mb-1.5 block text-xs font-medium ${isDark ? "text-gray-400" : "text-slate-600"}`}>
                        {isRTL ? "البريد الإلكتروني *" : "Email Address *"}
                      </label>
                      <input
                        required
                        type="email"
                        value={form.email}
                        onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                        placeholder="you@example.com"
                        className={inputClass}
                        dir="ltr"
                      />
                    </div>

                    <div>
                      <label className={`mb-1.5 block text-xs font-medium ${isDark ? "text-gray-400" : "text-slate-600"}`}>
                        {isRTL ? "الموضوع *" : "Subject *"}
                      </label>
                      <select
                        required
                        value={form.subject}
                        onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
                        className={inputClass}
                      >
                        <option value="">{isRTL ? "اختر الموضوع..." : "Select subject..."}</option>
                        {(isRTL ? subjects.ar : subjects.en).map((s, i) => (
                          <option key={i} value={s}>{s}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className={`mb-1.5 block text-xs font-medium ${isDark ? "text-gray-400" : "text-slate-600"}`}>
                        {isRTL ? "الرسالة *" : "Message *"}
                      </label>
                      <textarea
                        required
                        rows={5}
                        value={form.message}
                        onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
                        placeholder={isRTL ? "اكتب رسالتك هنا..." : "Write your message here..."}
                        className={`${inputClass} resize-none`}
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={loading}
                      className="flex w-full items-center justify-center gap-2 rounded-xl bg-royal py-4 font-semibold text-white transition hover:bg-royal/90 disabled:opacity-60"
                    >
                      {loading ? (
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                      ) : (
                        <>
                          {isRTL ? "إرسال الرسالة" : "Send Message"}
                          <Arrow size={18} />
                        </>
                      )}
                    </button>
                  </form>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Google Maps ── */}
      <section id="map" className={`py-8 ${isDark ? "bg-[#0e1218]" : "bg-slate-50"}`}>
        <div className="mx-auto max-w-6xl px-4">
          <div className={`overflow-hidden rounded-3xl border ${isDark ? "border-white/10" : "border-slate-200"}`}>
            <iframe
              src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3714.5!2d39.8555!3d21.3891!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x15c20f0071aac771%3A0xc363c31091368f1e!2z2LTYsdmD2Kkg2YbYuNin2YXZiiDZhNmE2YXYrdin2YXYp9ip!5e0!3m2!1sar!2ssa!4v1712550000000!5m2!1sar!2ssa"
              width="100%"
              height="400"
              style={{ border: 0, filter: isDark ? "invert(90%) hue-rotate(180deg) brightness(0.95) contrast(0.9)" : "none" }}
              allowFullScreen
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              title={isRTL ? "موقع شركة نظامي للمحاماة — مكة المكرمة" : "Nzamy Law Firm Location — Makkah"}
            />
            <div className={`flex items-center justify-between px-6 py-4 ${isDark ? "bg-dark-card" : "bg-white"}`}>
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-amber-500/10 p-2.5">
                  <MapPin size={20} weight="fill" className="text-amber-500" />
                </div>
                <div>
                  <p className={`text-sm font-semibold ${isDark ? "text-white" : "text-slate-900"}`}>
                    {isRTL ? "شركة نظامي للمحاماة" : "Nzamy Law Firm"}
                  </p>
                  <p className={`text-xs ${isDark ? "text-gray-400" : "text-slate-500"}`}>
                    {isRTL ? "بطحاء قريش، 4173، 7603، مكة المكرمة 24362" : "Batha Quraish, 4173, 7603, Makkah 24362"}
                  </p>
                </div>
              </div>
              <a
                href="https://maps.app.goo.gl/esDRbSWuT76Wqsy7A"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-xl bg-royal/10 px-4 py-2.5 text-sm font-semibold text-royal transition hover:bg-royal/20"
              >
                {isRTL ? "فتح في خرائط Google" : "Open in Google Maps"}
                <Arrow size={14} />
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ── FAQ teaser ── */}
      <section className={`py-16 ${isDark ? "bg-dark-bg" : "bg-white"}`}>
        <div className="mx-auto max-w-4xl px-4">
          <h2 className={`mb-6 text-center text-2xl font-bold ${isDark ? "text-white" : "text-slate-900"}`}>
            {isRTL ? "أسئلة متكررة" : "Common Questions"}
          </h2>
          <div className="space-y-3">
            {[
              { q: isRTL ? "ما أوقات الدعم الفني؟" : "What are technical support hours?", href: "/faq" },
              { q: isRTL ? "كيف أسترد أتعابي في حال الخلاف؟" : "How do I recover fees in case of dispute?", href: "/faq" },
              { q: isRTL ? "هل يمكنني التواصل بالإنجليزية؟" : "Can I communicate in English?", href: "/faq" },
            ].map((item, i) => (
              <Link key={i} href={item.href} className={`flex items-center justify-between rounded-xl border px-5 py-4 transition hover:shadow-sm ${isDark ? "border-white/10 bg-dark-card hover:border-white/20" : "border-slate-200 bg-slate-50 hover:border-slate-300"}`}>
                <span className={`text-sm font-medium ${isDark ? "text-gray-300" : "text-slate-700"}`}>{item.q}</span>
                <CaretRight size={16} className={`shrink-0 ${isRTL ? "rotate-180" : ""} ${isDark ? "text-gray-500" : "text-slate-400"}`} />
              </Link>
            ))}
          </div>
          <div className="mt-6 text-center">
            <Link href="/faq" className={`text-sm font-medium text-royal hover:underline`}>
              {isRTL ? "عرض جميع الأسئلة ←" : "View All FAQs →"}
            </Link>
          </div>
        </div>
      </section>

      <Footer />
      <FloatingButtons />
    </div>
  );
}
