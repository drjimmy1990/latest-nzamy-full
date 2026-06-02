'use client';

import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import Link from 'next/link';
import {
  ShieldCheck,
  Lock,
  Database,
  Eye,
  ClockCountdown,
  SealCheck,
  ArrowLeft,
  Key,
  GitBranch,
  FileText,
} from '@phosphor-icons/react';

const FadeUp = ({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) => {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-60px' });
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 24 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.5, delay, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  );
};

const pillars = [
  {
    icon: Lock,
    title: 'تشفير من الطرف إلى الطرف',
    desc: 'جميع البيانات مشفّرة بتقنية AES-256 أثناء النقل (TLS 1.3) وأثناء التخزين. لا أحد يصل إلى بياناتك حتى موظفونا.',
    badge: 'AES-256',
  },
  {
    icon: Database,
    title: 'السيرفرات في المملكة',
    desc: 'بياناتك تُخزَّن حصرياً على خوادم موجودة داخل المملكة العربية السعودية متوافقة مع متطلبات هيئة الاتصالات وتقنية المعلومات.',
    badge: 'KSA Hosted',
  },
  {
    icon: SealCheck,
    title: 'توافق نظام حماية البيانات (PDPL)',
    desc: 'المنصة متوافقة بالكامل مع نظام حماية البيانات الشخصية السعودي الصادر بالمرسوم الملكي رقم م/19.',
    badge: 'PDPL',
  },
  {
    icon: Eye,
    title: 'سياسة عدم المشاركة',
    desc: 'لا نبيع بياناتك ولا نشاركها مع أي طرف ثالث لأغراض تسويقية. بياناتك تُستخدم فقط لتقديم الخدمة.',
    badge: 'No Sell',
  },
  {
    icon: Key,
    title: 'التحقق الثنائي (2FA)',
    desc: 'طبقة إضافية من الحماية على كل حساب — OTP عبر الجوال أو تطبيق المصادقة.',
    badge: '2FA',
  },
  {
    icon: ClockCountdown,
    title: 'نسخ احتياطية تلقائية',
    desc: 'يتم نسخ كل البيانات احتياطياً كل 6 ساعات مع الاحتفاظ بـ 30 نسخة — لا خطر لفقدان ملفاتك.',
    badge: 'Auto Backup',
  },
];

const certifications = [
  { name: 'ISO 27001', desc: 'أمن المعلومات' },
  { name: 'PDPL متوافق', desc: 'حماية البيانات الشخصية' },
  { name: 'ZATCA Ready', desc: 'فوترة إلكترونية' },
  { name: 'TLS 1.3', desc: 'بروتوكول النقل الآمن' },
];

export default function SecurityPage() {
  return (
    <main className="min-h-[100dvh] bg-surface pt-24 pb-20" dir="rtl" lang="ar">

      {/* ── Hero ── */}
      <section className="max-w-[1400px] mx-auto px-6 md:px-10 grid grid-cols-1 lg:grid-cols-[55%_45%] gap-12 items-center min-h-[52vh]">
        <div className="space-y-7">
          <FadeUp>
            <span className="inline-flex items-center gap-2 text-xs font-semibold tracking-widest uppercase text-gold px-3 py-1 rounded-full border border-gold/30 bg-gold/5">
              أمان البيانات والخصوصية
            </span>
          </FadeUp>
          <FadeUp delay={0.07}>
            <h1 className="text-[clamp(2rem,5vw,3.5rem)] font-bold tracking-tight leading-[1.1] text-ink" style={{ fontFamily: 'var(--font-brand)' }}>
              بياناتك القانونية
              <br />
              <span className="text-royal">في أأمن مكان.</span>
            </h1>
          </FadeUp>
          <FadeUp delay={0.12}>
            <p className="text-ink-muted text-lg leading-relaxed max-w-[50ch]">
              بنينا أمان نظامي من الأساس — لأن بياناتك القانونية تستحق أعلى مستويات الحماية والخصوصية.
            </p>
          </FadeUp>
          <FadeUp delay={0.17}>
            <div className="flex flex-wrap gap-3 pt-2">
              <Link href="/privacy" className="inline-flex items-center gap-2 px-6 py-3 bg-royal text-white rounded-xl text-sm font-semibold transition-all hover:-translate-y-[2px] hover:bg-royal-light active:scale-[0.98]">
                سياسة الخصوصية
                <ArrowLeft size={17} weight="bold" />
              </Link>
              <Link href="/contact" className="inline-flex items-center gap-2 px-6 py-3 border border-slate-200 text-ink rounded-xl text-sm font-semibold transition-all hover:border-royal/30 hover:bg-royal/5">
                تواصل مع فريق الأمان
              </Link>
            </div>
          </FadeUp>
        </div>

        <FadeUp delay={0.2}>
          <div className="relative p-8 rounded-3xl bg-royal overflow-hidden">
            <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 80% 20%, #C8A762, transparent 60%)' }} />
            <div className="relative z-[1] flex flex-col items-center gap-6">
              <motion.div
                animate={{ scale: [1, 1.04, 1] }}
                transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                className="w-20 h-20 rounded-3xl bg-white/10 border border-white/20 flex items-center justify-center shadow-[inset_0_1px_0_rgba(255,255,255,0.15)]"
              >
                <ShieldCheck size={40} className="text-gold" weight="fill" />
              </motion.div>
              <div className="text-center">
                <p className="text-white font-bold text-xl mb-1">حماية شاملة ٢٤/٧</p>
                <p className="text-white/60 text-sm">مراقبة أمنية على مدار الساعة</p>
              </div>
              <div className="grid grid-cols-2 gap-3 w-full">
                {certifications.map((c, i) => (
                  <motion.div
                    key={c.name}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.4 + i * 0.1 }}
                    className="p-3 rounded-2xl bg-white/8 border border-white/15 text-center"
                  >
                    <p className="text-gold font-bold text-xs mb-0.5">{c.name}</p>
                    <p className="text-white/50 text-[10px]">{c.desc}</p>
                  </motion.div>
                ))}
              </div>
            </div>
          </div>
        </FadeUp>
      </section>

      {/* ── Security Pillars ── */}
      <section className="max-w-[1400px] mx-auto px-6 md:px-10 mt-24">
        <FadeUp>
          <h2 className="text-2xl font-bold text-ink mb-10" style={{ fontFamily: 'var(--font-brand)' }}>
            ستة طبقات لحماية بياناتك
          </h2>
        </FadeUp>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {pillars.map((p, i) => (
            <FadeUp key={p.title} delay={i * 0.07}>
              <div className="group p-7 rounded-2xl border border-slate-200/80 bg-white hover:border-royal/25 hover:shadow-[0_8px_28px_-8px_rgba(11,61,46,0.1)] transition-all duration-300 h-full flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <div className="w-10 h-10 rounded-xl bg-royal/8 flex items-center justify-center group-hover:bg-royal/15 transition-colors">
                    <p.icon size={20} className="text-royal" />
                  </div>
                  <span className="text-[10px] px-2 py-0.5 bg-gold/10 text-gold-dark rounded-full font-medium font-mono">{p.badge}</span>
                </div>
                <div>
                  <h3 className="font-semibold text-ink text-sm mb-2">{p.title}</h3>
                  <p className="text-ink-muted text-xs leading-relaxed">{p.desc}</p>
                </div>
              </div>
            </FadeUp>
          ))}
        </div>
      </section>

      {/* ── Data Rights ── */}
      <section className="max-w-[1400px] mx-auto px-6 md:px-10 mt-24">
        <FadeUp>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
            <div>
              <h2 className="text-2xl font-bold text-ink mb-5" style={{ fontFamily: 'var(--font-brand)' }}>
                حقوقك في بياناتك
              </h2>
              <div className="space-y-4">
                {[
                  { icon: Eye, title: 'حق الوصول', desc: 'احصل على نسخة كاملة من بياناتك في أي وقت' },
                  { icon: FileText, title: 'حق التصحيح', desc: 'طلب تصحيح أي بيانات غير دقيقة فوراً' },
                  { icon: GitBranch, title: 'حق المحو', desc: 'طلب حذف بياناتك بشكل كامل ونهائي' },
                ].map((r, i) => (
                  <div key={r.title} className="flex items-start gap-4 p-4 rounded-xl border border-slate-100 hover:border-royal/20 transition-colors">
                    <div className="w-9 h-9 rounded-xl bg-royal/8 flex items-center justify-center flex-shrink-0">
                      <r.icon size={17} className="text-royal" />
                    </div>
                    <div>
                      <p className="font-semibold text-ink text-sm">{r.title}</p>
                      <p className="text-ink-muted text-xs mt-0.5">{r.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <FadeUp delay={0.1}>
              <div className="p-8 rounded-3xl bg-slate-50 border border-slate-200">
                <h3 className="font-bold text-ink mb-5 text-base">للتواصل مع فريق الأمان</h3>
                <div className="space-y-3 mb-6">
                  {[
                    { label: 'إيميل الأمان', value: 'security@nzamy.sa' },
                    { label: 'وقت الاستجابة', value: 'خلال ٢٤ ساعة' },
                    { label: 'برنامج الثغرات', value: 'Bug Bounty متاح' },
                  ].map((item) => (
                    <div key={item.label} className="flex justify-between py-2 border-b border-slate-200 last:border-0 text-sm">
                      <span className="text-ink-muted">{item.label}</span>
                      <span className="font-medium text-ink">{item.value}</span>
                    </div>
                  ))}
                </div>
                <Link
                  href="/contact"
                  className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 bg-royal text-white rounded-xl text-sm font-semibold transition-all hover:-translate-y-[1px] hover:bg-royal-light"
                >
                  أبلغ عن ثغرة أمنية
                  <ArrowLeft size={16} weight="bold" />
                </Link>
              </div>
            </FadeUp>
          </div>
        </FadeUp>
      </section>

    </main>
  );
}
