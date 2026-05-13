import { CanvasText } from "../ui/canvas-text";
import { WavyBackground } from "../ui/wavy-background";
import { FlipWords } from "../ui/flip-words";
import { HoverBorderGradient } from "../ui/hover-border-gradient";

export const HeroSection = () => {
  return (
    <div className="relative w-full overflow-hidden" id="home">
      <WavyBackground waveYOffset={0.75} backgroundFill="#ffffff" className="max-w-7xl mx-auto pb-40">
        <div className="relative z-10 w-full pt-10 md:pt-20">
          <div className="flex flex-col items-center justify-center text-center min-h-[15rem] md:min-h-[20rem]">
            <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold text-slate-900">
              Approve loans at <br />
              <CanvasText
                text="Lightning Speed"
                className="text-4xl md:text-6xl lg:text-7xl font-bold"
                backgroundClassName="bg-white"
                colors={[
                  "var(--color-blue-500)",
                  "var(--color-sky-500)",
                  "var(--color-violet-500)",
                  "var(--color-teal-500)",
                ]}
                lineGap={6}
                animationDuration={10}
              />
            </h1>
          </div>

          <div className="mt-[-2rem] mb-16 font-normal text-base md:text-xl text-slate-600 max-w-2xl text-center mx-auto px-4 flex flex-col items-center">
            <div className="min-h-[60px]">
              Privacy-preserving P2P lending powered by{" "}
              <br className="hidden md:block" />
              <FlipWords
                words={[
                  "Blockchain-Backed Auditability",
                  "Explainable Credit Scoring",
                  "SHA-256 Evidence Hashing",
                  "Policy-Versioned Decisions",
                ]}
              />
            </div>

            <div className="mt-8 z-50">
              <HoverBorderGradient
                containerClassName="rounded-full"
                as="button"
                className="bg-slate-900 text-white flex items-center space-x-2 px-8 py-3"
              >
                <span className="font-semibold">Explore the Platform</span>
              </HoverBorderGradient>
            </div>
          </div>
        </div>
      </WavyBackground>
    </div>
  );
};
