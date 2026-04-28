import type { Metadata } from "next";
import { Outfit, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "stocky-ahh 📈 | Stock Trend Analyzer & Currency Converter",
    template: "%s | stocky-ahh",
  },
  description:
    "Real-time stock analysis, market trends, and USD/THB currency converter. Figure out if you're going to the moon 🌕 or holding the bag 🎒.",
  keywords: [
    "stock analyzer",
    "market trends",
    "currency converter",
    "USD to THB",
    "stock market",
    "finance",
    "investment",
    "crypto",
    "stonks",
  ],
  authors: [{ name: "lynchz", url: "https://github.com/lynchzdev" }],
  creator: "lynchz",
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://stocky-ahh.vercel.app",
    title: "stocky-ahh 📈 | To the Moon or Bust?",
    description:
      "Visualize stock price movements, check market vibes, and convert your tendies to THB. Real-time data for the modern investor.",
    siteName: "stocky-ahh",
    images: [
      {
        url: "/logo.svg",
        width: 1200,
        height: 630,
        alt: "stocky-ahh Application Interface",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "stocky-ahh 📈 | Stock Trend Analyzer",
    description: "Real-time stock analysis and currency converter. 🚀",
    images: ["/logo.svg"],
    creator: "@lynchzdev",
  },
  icons: {
    icon: "/logo.svg",
    shortcut: "/logo.svg",
    apple: "/logo.svg",
  },
  metadataBase: new URL("https://stocky-ahh.vercel.app"),
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <head>
        <meta
          httpEquiv="Content-Security-Policy"
          content="default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://fonts.gstatic.com; font-src 'self' https://fonts.gstatic.com data:; connect-src 'self' https://query1.finance.yahoo.com https://api.exchangerate-api.com https://openrouter.ai; img-src 'self' data: https:;"
        />
      </head>
      <body
        className={`${outfit.variable} ${jetbrainsMono.variable} font-sans antialiased min-h-screen grid-background`}
      >
        {children}
      </body>
    </html>
  );
}
