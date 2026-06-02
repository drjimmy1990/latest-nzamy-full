/**
 * Centralized Motion Variants — design-taste-frontend compliant
 * MOTION_INTENSITY: 6 → Spring Physics mandatory on all interactive elements
 * 
 * Usage:
 *   import { spring, fadeUp, staggerContainer } from "@/lib/motion";
 *   <motion.div variants={fadeUp} initial="hidden" animate="show" />
 */

// ─── Core Spring Transitions ──────────────────────────────────────────────────

/** Standard spring — feels weighty and premium */
export const spring = { type: "spring" as const, stiffness: 100, damping: 20 };

/** Snappy spring — for buttons, tabs, small interactive elements */
export const snapSpring = { type: "spring" as const, stiffness: 200, damping: 15 };

/** Gentle spring — for modals, panels, large surfaces */
export const gentleSpring = { type: "spring" as const, stiffness: 80, damping: 25 };

/** Overshoot spring — for notification badges, attention elements */
export const overshootSpring = { type: "spring" as const, stiffness: 300, damping: 12 };

// ─── Animation Variants ──────────────────────────────────────────────────────

/** Fade up — standard entrance animation */
export const fadeUp = {
  hidden: { opacity: 0, y: 15 },
  show: { opacity: 1, y: 0, transition: spring },
};

/** Fade up with custom index delay */
export const fadeUpStagger = {
  hidden: { opacity: 0, y: 15 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { ...spring, delay: i * 0.06 },
  }),
};

/** Scale in — for modals, cards appearing */
export const scaleIn = {
  hidden: { opacity: 0, scale: 0.95 },
  show: { opacity: 1, scale: 1, transition: spring },
  exit: { opacity: 0, scale: 0.95, transition: { duration: 0.15 } },
};

/** Slide in from right (RTL primary direction) */
export const slideInRTL = {
  hidden: { opacity: 0, x: 20 },
  show: { opacity: 1, x: 0, transition: spring },
  exit: { opacity: 0, x: -20, transition: { duration: 0.15 } },
};

// ─── Container Variants (Stagger Children) ───────────────────────────────────

/** Parent container for staggered reveals */
export const staggerContainer = {
  hidden: {},
  show: {
    transition: {
      staggerChildren: 0.06,
      delayChildren: 0.1,
    },
  },
};

/** Slower stagger for emphasis */
export const staggerContainerSlow = {
  hidden: {},
  show: {
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.15,
    },
  },
};

// ─── Interaction Presets ──────────────────────────────────────────────────────

/** Hover + Tap preset for cards */
export const cardHover = {
  whileHover: { y: -3, transition: snapSpring },
  whileTap: { scale: 0.98, transition: snapSpring },
};

/** Hover + Tap preset for buttons */
export const buttonPress = {
  whileHover: { scale: 1.02, transition: snapSpring },
  whileTap: { scale: 0.97, transition: snapSpring },
};

/** Magnetic-style subtle pull */
export const magneticPull = {
  whileHover: { scale: 1.04, y: -1, transition: snapSpring },
  whileTap: { scale: 0.97, transition: snapSpring },
};
