import { useEffect } from "react";
import { Features } from "./landing/Features";
import { Hero } from "./landing/Hero";
import { Nav } from "./landing/Nav";
import { Compare, Faq, FinalCta, Footer, HowItWorks, Marquee, ToolTeaser } from "./landing/Sections";
import { Pricing } from "./landing/Pricing";
import { Simulator } from "./landing/Simulator";

export default function Landing() {
  useEffect(() => {
    document.title = "AwaFund — run your group fund like a real bank";
    // The marketing site has its own designed light/dark rhythm; don't let the app theme repaint it.
    const root = document.documentElement;
    const wasDark = root.classList.contains("dark");
    root.classList.remove("dark");
    return () => {
      if (wasDark) root.classList.add("dark");
    };
  }, []);
  return (
    <div className="min-h-dvh bg-ink-950 font-sans">
      <Nav />
      <main>
        <Hero />
        <Marquee />
        <Simulator />
        <Features />
        <HowItWorks />
        <Compare />
        <ToolTeaser />
        <Pricing />
        <Faq />
        <FinalCta />
      </main>
      <Footer />
    </div>
  );
}
