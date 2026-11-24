import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Personality Lab | AI人格・反応比較実験",
  description:
    "4つの人格、ひとつの問いかけ。ローカルAIで性格と記憶が反応に与える変化を観察する実験室。",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja">
      <body className="antialiased">{children}</body>
    </html>
  );
}
