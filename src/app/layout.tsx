import type { Metadata, Viewport } from "next";
import { Cairo, IBM_Plex_Sans_Arabic, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import ThemeProvider from "@/components/ThemeProvider";
import FloatingButtons from "@/components/FloatingButtons";

// Self-hosted via next/font (no runtime request to fonts.googleapis.com).
// Weights match the previous Google Fonts CSS2 <link> exactly so rendering
// is identical; variables are consumed by the --font-* tokens in globals.css.
const cairo = Cairo({
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
  display: "swap",
  variable: "--font-cairo",
});

const ibmPlexSansArabic = IBM_Plex_Sans_Arabic({
  subsets: ["arabic", "latin"],
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
  variable: "--font-ibm-plex-sans-arabic",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-jetbrains-mono",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0B3D2E",
};

export const metadata: Metadata = {
  title: "نظامي - المنصة القانونية الذكية في السعودية",
  description:
    "المنصة القانونية الذكية في السعودية: استشارات، عقود، تمثيل قضائي، توثيق، وذكاء اصطناعي قانوني متقدم.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "نظامي",
  },
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icon.png", type: "image/png" },
    ],
    apple: "/icons/apple-touch-icon.png",
    shortcut: "/icon.svg",
  },
  openGraph: {
    title: "نظامي - المنصة القانونية الذكية في السعودية",
    description:
      "استشارات قانونية فورية، صياغة عقود بالذكاء الاصطناعي، وتمثيل قضائي في منصة واحدة.",
    url: "https://nezamy.sa",
    siteName: "نظامي",
    locale: "ar_SA",
    type: "website",
    images: [
      {
        url: "https://nezamy.sa/og-image.png",
        width: 1024,
        height: 1024,
        alt: "نظامي - المنصة القانونية الذكية في السعودية",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "نظامي - المنصة القانونية الذكية في السعودية",
    description:
      "استشارات قانونية فورية، صياغة عقود بالذكاء الاصطناعي، وتمثيل قضائي في منصة واحدة.",
  },
};

const themeInitScript = `
(function () {
  try {
    var theme = localStorage.getItem("nezamy-theme") || "dark";
    var lang = localStorage.getItem("nezamy-lang") || "ar";
    if (theme !== "light" && theme !== "dark") theme = "dark";
    if (lang !== "ar" && lang !== "en") lang = "ar";
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
    document.documentElement.style.colorScheme = theme;
  } catch (error) {
    document.documentElement.classList.add("dark");
    document.documentElement.lang = "ar";
    document.documentElement.dir = "rtl";
    document.documentElement.style.colorScheme = "dark";
  }
})();
`;

const serviceWorkerRegisterScript = `
if ("serviceWorker" in navigator) {
  window.addEventListener("load", function () {
    navigator.serviceWorker.register("/sw.js").catch(function () {});
  });
}
`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="ar"
      dir="rtl"
      suppressHydrationWarning
      className={`${cairo.variable} ${ibmPlexSansArabic.variable} ${jetbrainsMono.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <script dangerouslySetInnerHTML={{ __html: serviceWorkerRegisterScript }} />
      </head>
      <body className="antialiased" suppressHydrationWarning>
        {/* «تخطَّ», not «تخطى».
            This is an imperative addressed to the reader, and the imperative of
            «تخطّى» drops the final alif: «تخطَّ». «تخطى» is the past tense — the
            link was telling the user that somebody skipped, in the one string
            a screen-reader announces first on every page in the product.
            It is also the string the owner's FOUC screenshot (shot 17) rendered
            unstyled and therefore visible, which is how it got read at all. */}
        <a href="#main-content" className="skip-to-content">
          تخطَّ إلى المحتوى الرئيسي
        </a>
        <ThemeProvider>
          <main id="main-content">{children}</main>
          <FloatingButtons />
        </ThemeProvider>
      </body>
    </html>
  );
}
