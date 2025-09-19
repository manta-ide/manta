import Header from "./components/Header";
import Hero from "./components/Hero";
import ProjectsSection from "./components/ProjectsSection";
import Team from "./components/Team";
import Footer from "./components/Footer";
import { useVars } from "../_graph/varsHmr.ts";

export default function App() {
  const [vars] = useVars();
  const rootStyles = (vars["root-styles"] as Record<string, any>) || {};
  const cssVars = {
    "--background-color": rootStyles["background-color"] ?? vars["background-color"] ?? "#ffffff",
    "--text-color": rootStyles["text-color"] ?? vars["text-color"] ?? "#000000",
    "--font-family": rootStyles["font-family"] ?? vars["font-family"] ?? "Inter",
    "--base-font-size": rootStyles["base-font-size"] ?? vars["base-font-size"] ?? "1rem",
    "--gradient-start": "#667eea",
    "--gradient-end": "#764ba2",
  } as React.CSSProperties;

  return (
    <main
      id="app"
      style={cssVars}
      className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 text-[var(--text-color)] antialiased relative overflow-x-hidden"
    >
      {/* Modern background pattern */}
      <div className="fixed inset-0 opacity-[0.02] pointer-events-none">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_25%_25%,_theme(colors.blue.500)_0%,_transparent_50%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_75%_75%,_theme(colors.purple.500)_0%,_transparent_50%)]" />
      </div>

      {/* Content with modern stacking */}
      <div className="relative z-10">
        <Header />
        <Hero />
        <ProjectsSection />
        <Team />
        <Footer />
      </div>

      {/* Floating decorative elements */}
      <div className="fixed top-20 left-10 w-20 h-20 bg-gradient-to-br from-blue-400/20 to-purple-400/20 rounded-full blur-xl animate-pulse pointer-events-none" />
      <div className="fixed bottom-20 right-10 w-32 h-32 bg-gradient-to-br from-purple-400/20 to-pink-400/20 rounded-full blur-xl animate-pulse pointer-events-none" style={{ animationDelay: '2s' }} />
    </main>
  );
}
