import { redirect } from "next/navigation";

/**
 * /dashboard/business/cases/new — owner decision ٥ made «القضايا» a live
 * company section, which makes this URL reachable from the case list and from
 * the floating «إضافة قضية» shortcut.
 *
 * WHAT WAS HERE: a three-step «فتح ملف قضية جديدة» wizard («فحص التعارض»,
 * client and opponent names, matter type, fee structure, three invented
 * «playbooks») that saved none of it — its finish button already sent the
 * visitor to the real intake. A conflict check that checks nothing is worse
 * than none, so the page now goes straight there: a company files a case
 * through the same three-step intake an individual uses (owner ruling س٢,
 * 26 August).
 */
export default function BusinessNewCasePage() {
  redirect("/dashboard/client/services");
}
