"use client";

import { motion } from "framer-motion";
import { Star } from "@phosphor-icons/react";
import type { Plan } from "@/constants/pricingData";

interface PricingTestimonialsProps {
  isAr: boolean;
  planList: Plan[];
}

/**
 * PricingTestimonials renders nothing, and that is deliberate.
 *
 *
 * «فيصل الدوسري — مدير شؤون قانونية، مجموعة الرائد» · «نورة القحطاني — محامية
 * مستقلة، الرياض» · «خالد العمري — رائد أعمال، جدة». Three named people, with
 * job titles, employers, cities, quoted paragraphs and five gold stars each.
 *
 * None of them exists. Production holds 18 accounts, ZERO consultations, zero
 * published lawyers, and no reviews table for a review to have come from — so
 * there is no customer who could have said any of it. This is not an
 * exaggerated number like the counters above; it is invented testimony
 * attributed to named individuals, which is the most serious thing in this
 * entire audit.
 *
 * The same three personas were rendered TWICE — here and on /pricing, where
 * «فيصل الدوسري» also claimed «نظامي AI وفّر علينا ٤٠٪ من وقت مراجعة العقود»
 * about a language model that is not connected to anything. Deleting one and
 * leaving the other is the exact failure mode Wave 1's rule exists to stop, so
 * both went in the same commit.
 *
 * Nothing replaces them. A testimonial needs a customer who said it and agreed
 * to be named; `reviews` is a real table waiting for `/api/v1/reviews`
 * (matrix row 192), and that is where real ones will come from.
 *
 * The component itself is kept, and still mounted at
 * src/app/pricing/page.tsx:88, so that wiring it to `/api/v1/reviews` later is
 * an edit here rather than an archaeology exercise across two files. It takes
 * its props unchanged for the same reason.
 */
export function PricingTestimonials(_props: PricingTestimonialsProps) {
  return null;
}
