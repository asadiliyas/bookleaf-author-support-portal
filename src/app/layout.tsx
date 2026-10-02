import type { Metadata } from "next";
import { Lato } from "next/font/google";
import { Providers } from "@/components/providers";
import "./globals.css";

const lato = Lato({
  variable: "--font-lato",
  subsets: ["latin"],
  weight: ["300", "400", "700", "900"],
});

export const metadata: Metadata = {
  title: { default: "BookLeaf Author Support", template: "%s · BookLeaf Author Support" },
  description: "Support and communication portal for BookLeaf Publishing authors and the BookLeaf operations team.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${lato.variable} h-full`}>
      <body className="min-h-full">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
