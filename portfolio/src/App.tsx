import { HeroSection } from "./components/sections/HeroSection";
import { motion, useScroll, useSpring } from "framer-motion";
import { TechStackSection } from "./components/sections/TechStackSection";
import { FeaturesSection } from "./components/sections/FeaturesSection";
import { WorkflowSection } from "./components/sections/WorkflowSection";
import { BlockchainSection } from "./components/sections/BlockchainSection";
import { ResearchSection } from "./components/sections/ResearchSection";
import { GlobeSection } from "./components/sections/GlobeSection";
import { PlatformPreviewSection } from "./components/sections/PlatformPreviewSection";
import { CTASection } from "./components/sections/CTASection";
import { FloatingDock } from "./components/ui/floating-dock";
import { CustomCursor } from "./components/ui/custom-cursor";
import { NoiseOverlay } from "./components/ui/noise-overlay";
import {
  IconHome,
  IconTerminal2,
  IconNewSection,
  IconComponents,
  IconBolt,
  IconSchool,
  IconCode,
} from "@tabler/icons-react";

function App() {
  const dockItems = [
    {
      title: "Home",
      icon: <IconHome className="h-full w-full text-neutral-500 dark:text-neutral-300" />,
      href: "#home",
    },
    {
      title: "Platform",
      icon: <IconTerminal2 className="h-full w-full text-neutral-500 dark:text-neutral-300" />,
      href: "#platform",
    },
    {
      title: "Challenges",
      icon: <IconNewSection className="h-full w-full text-neutral-500 dark:text-neutral-300" />,
      href: "#features",
    },
    {
      title: "Workflow",
      icon: <IconComponents className="h-full w-full text-neutral-500 dark:text-neutral-300" />,
      href: "#workflow",
    },
    {
      title: "Tech Stack",
      icon: <IconCode className="h-full w-full text-neutral-500 dark:text-neutral-300" />,
      href: "#techstack",
    },
    {
      title: "Blockchain",
      icon: <IconBolt className="h-full w-full text-neutral-500 dark:text-neutral-300" />,
      href: "#blockchain",
    },
    {
      title: "Research",
      icon: <IconSchool className="h-full w-full text-neutral-500 dark:text-neutral-300" />,
      href: "#research",
    },
  ];

  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, {
    stiffness: 100,
    damping: 30,
    restDelta: 0.001
  });

  return (
    <main className="bg-white min-h-screen text-slate-900 overflow-x-hidden relative">
      <NoiseOverlay />
      <CustomCursor />
      {/* Scroll Progress Bar */}
      <motion.div
        className="fixed top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-sky-400 via-blue-500 to-indigo-500 origin-left z-[100] shadow-sm shadow-sky-500/20"
        style={{ scaleX }}
      />

      <HeroSection />
      <PlatformPreviewSection />
      <FeaturesSection />
      <WorkflowSection />
      <TechStackSection />
      <GlobeSection />
      <BlockchainSection />
      <ResearchSection />
      <CTASection />

      {/* Global Floating Dock */}
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[100]">
        <FloatingDock items={dockItems} />
      </div>
    </main>
  );
}

export default App;
