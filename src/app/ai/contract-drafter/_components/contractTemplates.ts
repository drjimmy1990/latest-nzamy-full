import { ContractType } from "./contractTypes";

export function generateContractText(
  type: ContractType,
  data: Record<string, string>,
  isRTL: boolean
): string {
  const today = new Date().toLocaleDateString(isRTL ? "ar-SA" : "en-SA", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  if (type.id === "rent") {
    return isRTL
      ? `عقد إيجار

تاريخ الإبرام: ${today}

المادة الأولى: الأطراف
المؤجِّر: ${data.landlord || "___"}
المستأجِر: ${data.tenant || "___"}

المادة الثانية: العقار
${data.property_desc || "___"}

المادة الثالثة: مدة الإيجار والبدل
تبدأ مدة الإيجار من ${data.start_date || "___"} ولمدة ${data.duration || "___"}.
بدل الإيجار السنوي: ${data.rent_amount || "___"} ريال سعودي.

المادة الرابعة: التزامات طرفي العقد
يلتزم المؤجّر بتسليم العقار بحالة صالحة للاستخدام.
يلتزم المستأجر بسداد بدل الإيجار في مواعيده.

المادة الخامسة: إنهاء العقد
يُنهى هذا العقد بانتهاء مدته أو باتفاق الطرفين.

المادة السادسة: أحكام ختامية
${data.notes ? `ملاحظات إضافية: ${data.notes}` : "لا توجد ملاحظات إضافية."}

وقّع عليه الطرفان إقراراً بالموافقة على بنوده.

المؤجِّر: _______________
المستأجِر: _______________`
      : `LEASE AGREEMENT

Date: ${today}

Article 1: Parties
Landlord: ${data.landlord || "___"}
Tenant: ${data.tenant || "___"}

Article 2: Property
${data.property_desc || "___"}

Article 3: Term and Rent
Lease commences: ${data.start_date || "___"} for a period of ${data.duration || "___"}.
Annual rent: ${data.rent_amount || "___"} SAR.

Article 4: Obligations
Landlord agrees to deliver the property in habitable condition.
Tenant agrees to pay rent on time.

Article 5: Termination
This agreement terminates at the end of its term or by mutual consent.

Article 6: General
${data.notes ? `Additional notes: ${data.notes}` : "No additional notes."}

Landlord: _______________
Tenant: _______________`;
  }

  if (type.id === "service") {
    return isRTL
      ? `عقد تقديم خدمات

تاريخ الإبرام: ${today}

المادة الأولى: الأطراف
مقدّم الخدمة: ${data.provider || "___"}
العميل: ${data.client || "___"}

المادة الثانية: الخدمة المطلوبة
${data.service_desc || "___"}

المادة الثالثة: المقابل المالي والتسليم
قيمة الخدمة: ${data.price || "___"} ريال.
تاريخ البدء: ${data.start_date || "___"}.
مدة التسليم: ${data.delivery || "___"}.

المادة الرابعة: التزامات الطرفين
يلتزم مقدّم الخدمة بتنفيذ العمل وفق الاتفاق.
يلتزم العميل بسداد المقابل عند التسليم.

المادة الخامسة: حل النزاعات
يُحسم أي خلاف بالتراضي، وعند الاستعصاء تختص المحاكم السعودية.

مقدّم الخدمة: _______________
العميل: _______________`
      : `SERVICE AGREEMENT

Date: ${today}

Article 1: Parties
Service Provider: ${data.provider || "___"}
Client: ${data.client || "___"}

Article 2: Service Description
${data.service_desc || "___"}

Article 3: Compensation & Delivery
Service value: ${data.price || "___"} SAR.
Start date: ${data.start_date || "___"}.
Delivery: ${data.delivery || "___"}.

Article 4: Obligations
Provider agrees to perform work as agreed.
Client agrees to pay upon delivery.

Article 5: Dispute Resolution
Disputes shall first be resolved amicably; otherwise Saudi courts shall have jurisdiction.

Service Provider: _______________
Client: _______________`;
  }

  if (type.id === "employment") {
    return isRTL
      ? `عقد عمل

تاريخ الإبرام: ${today}

المادة الأولى: الأطراف
صاحب العمل / الشركة: ${data.employer || "___"}
الموظف: ${data.employee || "___"}

المادة الثانية: المسمى الوظيفي والراتب
المسمى: ${data.position || "___"}
الراتب الشهري: ${data.salary || "___"} ريال.
تاريخ بدء العمل: ${data.start_date || "___"}.
${data.probation && data.probation !== "لا يوجد" && data.probation !== "None" ? `فترة التجربة: ${data.probation}.` : ""}

المادة الثالثة: الواجبات والالتزامات
يؤدي الموظف مهامه بكفاءة وفق التعليمات.
يلتزم صاحب العمل بسداد الراتب في موعده.

المادة الرابعة: إنهاء العقد
وفق نظام العمل السعودي وما اتُّفق عليه.

صاحب العمل: _______________
الموظف: _______________`
      : `EMPLOYMENT CONTRACT

Date: ${today}

Article 1: Parties
Employer: ${data.employer || "___"}
Employee: ${data.employee || "___"}

Article 2: Position & Salary
Title: ${data.position || "___"}
Monthly salary: ${data.salary || "___"} SAR.
Start date: ${data.start_date || "___"}.
${data.probation && data.probation !== "لا يوجد" && data.probation !== "None" ? `Probation: ${data.probation}.` : ""}

Article 3: Duties
Employee shall perform duties diligently.
Employer shall pay salary on time.

Article 4: Termination
Per Saudi Labor Law and as mutually agreed.

Employer: _______________
Employee: _______________`;
  }

  if (type.id === "partnership") {
    return isRTL
      ? `اتفاقية شراكة

تاريخ الإبرام: ${today}

المادة الأولى: الأطراف
الشريك الأول: ${data.partner1 || "___"}
الشريك الثاني: ${data.partner2 || "___"}

المادة الثانية: المشروع
${data.project || "___"}

المادة الثالثة: الحصص
حصة الشريك الأول: ${data.share1 || "___"}٪
حصة الشريك الثاني: ${data.share2 || "___"}٪

المادة الرابعة: المدة
${data.duration || "___"}

المادة الخامسة: إنهاء الشراكة
بالتراضي أو وفق الأنظمة المعمول بها.

${data.notes ? `بنود إضافية: ${data.notes}` : ""}

الشريك الأول: _______________
الشريك الثاني: _______________`
      : `PARTNERSHIP AGREEMENT

Date: ${today}

Article 1: Parties
Partner 1: ${data.partner1 || "___"}
Partner 2: ${data.partner2 || "___"}

Article 2: Project
${data.project || "___"}

Article 3: Equity
Partner 1 share: ${data.share1 || "___"}%
Partner 2 share: ${data.share2 || "___"}%

Article 4: Duration
${data.duration || "___"}

Article 5: Termination
By mutual agreement or as per applicable law.

${data.notes ? `Additional terms: ${data.notes}` : ""}

Partner 1: _______________
Partner 2: _______________`;
  }

  if (type.id === "sale") {
    return isRTL
      ? `عقد بيع

تاريخ الإبرام: ${today}

المادة الأولى: الأطراف
البائع: ${data.seller || "___"}
المشتري: ${data.buyer || "___"}

المادة الثانية: المبيع
${data.item || "___"}

المادة الثالثة: الثمن والسداد
قيمة البيع: ${data.price || "___"} ريال.
طريقة الدفع: ${data.payment || "___"}.
تاريخ البيع: ${data.date || "___"}.

المادة الرابعة: نقل الملكية
تنتقل الملكية فور اكتمال السداد.

المادة الخامسة: أحكام ختامية
يخضع هذا العقد لأحكام نظام المعاملات المدنية السعودي.

البائع: _______________
المشتري: _______________`
      : `SALE AGREEMENT

Date: ${today}

Article 1: Parties
Seller: ${data.seller || "___"}
Buyer: ${data.buyer || "___"}

Article 2: Item
${data.item || "___"}

Article 3: Price & Payment
Sale price: ${data.price || "___"} SAR.
Payment method: ${data.payment || "___"}.
Sale date: ${data.date || "___"}.

Article 4: Transfer of Ownership
Ownership transfers upon full payment.

Article 5: Governing Law
This agreement is subject to Saudi Civil Transactions Law.

Seller: _______________
Buyer: _______________`;
  }

  if (type.id === "other") {
    return isRTL
      ? `مسودة عقد تصنيف حر

تاريخ الإبرام: ${today}

المادة الأولى: الأطراف
الطرف الأول: ${data.party1 || "___"}
الطرف الثاني: ${data.party2 || "___"}

المادة الثانية: موضوع العقد الأساسي
${data.subject || "___"}

المادة الثالثة: القيمة والمدة
${data.amount ? `القيمة المتفق عليها: ${data.amount} ريال.` : "القيمة المتفق عليها: غير محدد / حسب الإنجاز."}
${data.duration ? `مدة العقد: ${data.duration}.` : "مدة العقد: غير محددة."}

المادة الرابعة: التزامات أطراف العقد
يلتزم الطرفان أداء التزاماتهما وفق الأنظمة المتبعة المعتمدة في المملكة العربية السعودية وما يقتضيه حُسن النية.

المادة الخامسة: شروط صياغة إضافية
${data.notes ? data.notes : "لا توجد شروط مضافة على هذه المسودة الأولية، يجب إحالة العقد للمراجعة القانونية."}

وقّع الطرفان على الموافقة المبدئية لتحويل هذه المسودة إلى عقد نهائي بعد التنقيح من قبل محامٍ مختص.

الطرف الأول: _______________
الطرف الثاني: _______________`
      : `PRELIMINARY CUSTOM DRAFT

Date: ${today}

Article 1: Parties
First Party: ${data.party1 || "___"}
Second Party: ${data.party2 || "___"}

Article 2: Subject Matter
${data.subject || "___"}

Article 3: Value and Duration
${data.amount ? `Financial Value: ${data.amount} SAR.` : "Value: Undefined / Case-by-case basis."}
${data.duration ? `Duration: ${data.duration}.` : "Duration: Undefined."}

Article 4: Mutual Obligations
Both parties shall abide by their legal obligations according to Saudi Law and act in good faith.

Article 5: Additional Requirements
${data.notes ? data.notes : "No further clauses included in preliminary draft. Subject to lawyer refinement."}

Both parties hereby mutually agree to use this draft as a basis for formal refinement.

First Party: _______________
Second Party: _______________`;
  }

  return isRTL ? "عقد فارغ..." : "Empty contract...";
}
