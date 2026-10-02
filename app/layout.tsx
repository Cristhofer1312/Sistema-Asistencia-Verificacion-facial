import "./globals.css";

export const metadata = { title: "Asistencia Facial — Fase 1 UX", description: "Maqueta UX sin backend (SRS v3.2)" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
