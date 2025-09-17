import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Analytics } from "@vercel/analytics/next";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "OVO",
  description: "Consulta y valora en tiempo real la tortilla de la cafetería de la FIC.",
  icons: {
    icon: "/src/app/favicon.ico", 
  },
  openGraph: {
    title: "OvO",
    description: "Consulta y valora en tiempo real la tortilla de la cafetería de la FIC.",
    url: "https://ovo-fic.vercel.app", // cambia por tu dominio si lo personalizas
    siteName: "OvO",
    locale: "es_ES",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "OVO",
    description: "Consulta y valora en tiempo real la tortilla de la cafetería de la FIC.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
        <Analytics />
      </body>
    </html>
  );
}
