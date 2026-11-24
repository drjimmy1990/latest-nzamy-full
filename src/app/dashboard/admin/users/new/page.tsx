"use client";

// «إضافة مستخدم» — live check of 13 Nov, row 30.
//
// WHAT THIS PAGE WAS: a form whose button set a local flag and then printed
// «تم إنشاء الحساب — تم إرسال دعوة التفعيل إلى …» without a single request:
// no account was created and no invitation was sent. It also offered «admin»
// as an account type.
//
// WHY «قيد التفعيل» AND NOT A REAL FORM: no admin route creates an account or
// sends an invitation (GET /api/v1/admin/users only lists them), and creating
// accounts from the console — above all staff accounts — is a permission
// decision that is not taken yet. An honest «not available» is better than a
// success message for something that did not happen. Accounts are created by
// the person registering through the normal sign-up.

import DashboardComingSoon from "@/components/ui/DashboardComingSoon";

export default function AdminNewUserPage() {
  return (
    <DashboardComingSoon
      title="إضافة مستخدم"
      description="إنشاء الحسابات من لوحة الإدارة قيد التفعيل. يُنشئ المستخدم حسابه الآن من صفحة التسجيل."
      backHref="/dashboard/admin/users"
    />
  );
}
