"use client";

import DashboardComingSoon from "@/components/ui/DashboardComingSoon";

/**
 * /dashboard/admin/system/backup — «النسخ الاحتياطي» (owner answer ١١٥).
 *
 * The page claimed a last backup on a fixed April date, listed five fixed
 * backups with sizes, and showed storage, count and success-rate figures. Its
 * «نسخة الآن» button ran a three-second spinner and created nothing. The
 * console is not connected to whatever backs up the self-hosted database, so
 * there is no date, size or rate to show. The primary sidebar row carries
 * «قريباً».
 */
export default function AdminBackupPage() {
  return (
    <DashboardComingSoon
      title="النسخ الاحتياطي"
      description="لا تعرض لوحة الإدارة حالة النسخ الاحتياطي بعد: لا يوجد ربط بنظام النسخ، فلا تواريخ ولا أحجام حقيقية لعرضها، ولا يمكن تشغيل نسخة من هنا."
      backHref="/dashboard/admin"
    />
  );
}
