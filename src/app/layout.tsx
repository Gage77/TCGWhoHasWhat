import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Who Has What",
  description: "Compare your playgroup's Magic collections and find who has the cards you need.",
};

/**
 * Most of this gets used at a kitchen table with a phone in one hand, so the
 * mobile browser chrome is told to match the page rather than sit in white
 * above a dark app. Pinch-zoom is left alone on purpose — card lists are
 * exactly the kind of thing people zoom into.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      {/* `dvh` rather than `%`: mobile browser chrome slides away as you scroll. */}
      <body className="flex min-h-dvh flex-col">{children}</body>
    </html>
  );
}
