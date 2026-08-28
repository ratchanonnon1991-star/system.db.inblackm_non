import "./globals.css";

export const metadata = {
  title: "GameDB — INBLACKM",
  description: "ตาราง Query ข้อมูลจากฐานข้อมูลกลาง InblackM",
};

export default function RootLayout({ children }) {
  return (
    <html lang="th">
      <body suppressHydrationWarning className="min-h-screen bg-zinc-100 text-zinc-900 antialiased">
        {children}
      </body>
    </html>
  );
}
