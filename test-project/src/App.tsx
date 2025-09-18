import Header from "./components/Header";
import Hero from "./components/Hero";
import CounterSection from "./components/CounterSection";
import { useVars } from "@config";

export default function App() {
  const [vars] = useVars();
  const rootStyles = (vars["root-styles"] as Record<string, any>) || {};
  const cssVars = {
    "--background-color": rootStyles["background-color"] ?? vars["background-color"] ?? "#ffffff",
    "--text-color": rootStyles["text-color"] ?? vars["text-color"] ?? "#000000",
    "--font-family": rootStyles["font-family"] ?? vars["font-family"] ?? "Arial",
    "--base-font-size": rootStyles["base-font-size"] ?? vars["base-font-size"] ?? "1rem",
  } as React.CSSProperties;

  return (
    <main
      id="app"
      style={cssVars}
      className="min-h-screen bg-[var(--background-color)] text-[var(--text-color)] antialiased"
    >
      <Header />
      <Hero />
      <CounterSection />
    </main>
  );
}
