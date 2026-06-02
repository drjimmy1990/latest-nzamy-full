import type { Metadata, Viewport } from "next";
import "./globals.css";
import ThemeProvider from "@/components/ThemeProvider";
import FloatingButtons from "@/components/FloatingButtons";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  maximumScale: 1,
};

export const metadata: Metadata = {
  title: "نظامي - المنصة القانونية الذكية في السعودية",
  description:
    "المنصة القانونية الذكية في السعودية: استشارات، عقود، تمثيل قضائي، توثيق، وذكاء اصطناعي قانوني متقدم.",
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icon.png", type: "image/png" },
    ],
    apple: "/icon.png",
    shortcut: "/icon.svg",
  },
  openGraph: {
    title: "نظامي - المنصة القانونية الذكية في السعودية",
    description:
      "استشارات قانونية فورية، صياغة عقود بالذكاء الاصطناعي، وتمثيل قضائي في منصة واحدة.",
    url: "https://nezamy.online",
    siteName: "نظامي",
    locale: "ar_SA",
    type: "website",
    images: [
      {
        url: "https://nezamy.online/og-image.png",
        width: 1200,
        height: 630,
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

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;800;900&family=IBM+Plex+Sans+Arabic:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="antialiased" suppressHydrationWarning>
        <a href="#main-content" className="skip-to-content">
          تخطى إلى المحتوى الرئيسي
        </a>
        <ThemeProvider>
          <main id="main-content">{children}</main>
          <FloatingButtons />
        </ThemeProvider>
      </body>
    </html>
  );
}
