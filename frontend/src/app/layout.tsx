import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

// Fontes guardadas no projeto (subconjunto latin, variáveis; licença OFL), para o build não
// depender do Google Fonts: um download quebrado lá já derrubou o build do macOS no release.
const manrope = localFont({
  variable: "--font-manrope",
  src: "./fonts/Manrope-Variable.woff2",
  weight: "200 800",
  display: "swap",
});

// Números grandes e títulos (MASTER.md, "Tipografia"); o texto continua em Manrope.
// Variável em peso, tamanho óptico (opsz) e largura (wdth).
const bricolage = localFont({
  variable: "--font-bricolage",
  src: "./fonts/BricolageGrotesque-Variable.woff2",
  weight: "200 800",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Finora",
  description: "Suas finanças, automaticamente",
};

// Aplica o tema escolhido antes da primeira pintura (sem piscar o tema errado)
const themeScript = `try{var t=localStorage.getItem("mf_theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className={`${manrope.variable} ${bricolage.variable} antialiased`}>{children}</body>
    </html>
  );
}
