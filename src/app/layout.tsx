import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Career Intelligence Assistant — newpage.ai",
  description:
    "Upload your resume and job postings to get AI-powered analysis of fit, skill gaps, experience alignment, and interview preparation.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
