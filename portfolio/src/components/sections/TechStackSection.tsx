import { ParallaxHeroImages } from "../ui/parallax-hero-images";

/* ── Unified Line Icons ─────────────────────────────────── */
import { 
  Hexagon, 
  Atom, 
  Blocks, 
  Database, 
  KeyRound, 
  Landmark, 
  ShieldCheck 
} from "lucide-react";

const NestJSLogo = () => <Hexagon className="w-8 h-8 text-slate-800" strokeWidth={1.5} />;
const ReactLogo = () => <Atom className="w-8 h-8 text-slate-800" strokeWidth={1.5} />;
const FabricLogo = () => <Blocks className="w-8 h-8 text-slate-800" strokeWidth={1.5} />;
const MongoDBLogo = () => <Database className="w-8 h-8 text-slate-800" strokeWidth={1.5} />;
const KeycloakLogo = () => <KeyRound className="w-8 h-8 text-slate-800" strokeWidth={1.5} />;
const FineractLogo = () => <Landmark className="w-8 h-8 text-slate-800" strokeWidth={1.5} />;
const SmartCALogo = () => <ShieldCheck className="w-8 h-8 text-slate-800" strokeWidth={1.5} />;

/* ── Floating Tech Card ─────────────────────────────────── */

const TechCard = ({
  icon,
  name,
  role,
  gradient,
}: {
  icon: React.ReactNode;
  name: string;
  role: string;
  gradient: string;
}) => (
  <div className="flex items-center gap-3 bg-white/90 backdrop-blur-sm border border-slate-200 rounded-xl px-5 py-4 shadow-lg shadow-slate-200/50 select-none pointer-events-none w-52">
    <div className={`p-2.5 rounded-lg bg-gradient-to-br ${gradient} border border-slate-200 shadow-sm shrink-0 flex items-center justify-center`}>
      {icon}
    </div>
    <div>
      <div className="text-slate-900 font-semibold text-sm leading-tight">{name}</div>
      <div className="text-slate-500 text-xs">{role}</div>
    </div>
  </div>
);

/* ── Tech Items ─────────────────────────────────────────── */

const techCards = [
  <TechCard key="nestjs" icon={<NestJSLogo />} name="NestJS" role="Core Orchestrator" gradient="from-red-600/20 to-red-900/20" />,
  <TechCard key="react" icon={<ReactLogo />} name="React Native" role="Mobile Client" gradient="from-cyan-600/20 to-blue-900/20" />,
  <TechCard key="fabric" icon={<FabricLogo />} name="Hyperledger Fabric" role="Evidence Layer" gradient="from-emerald-600/20 to-teal-900/20" />,
  <TechCard key="mongo" icon={<MongoDBLogo />} name="MongoDB" role="Operational DB" gradient="from-green-600/20 to-green-900/20" />,
  <TechCard key="keycloak" icon={<KeycloakLogo />} name="Keycloak" role="Identity & Access" gradient="from-sky-600/20 to-blue-900/20" />,
  <TechCard key="fineract" icon={<FineractLogo />} name="Apache Fineract" role="Financial Core" gradient="from-orange-600/20 to-red-900/20" />,
  <TechCard key="smartca" icon={<SmartCALogo />} name="VNPT SmartCA" role="PKI Signing" gradient="from-blue-600/20 to-indigo-900/20" />,
];

/* ── Section ────────────────────────────────────────────── */

export const TechStackSection = () => {
  return (
    <div
      className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-neutral-50"
      id="techstack"
    >
      <ParallaxHeroImages>
        {techCards}
      </ParallaxHeroImages>

      {/* Center content */}
      <div className="relative z-10 mx-auto flex max-w-4xl flex-col items-center gap-4 px-4 text-center md:-translate-x-8 -translate-x-4">
        <h2 className="text-4xl font-bold tracking-tight text-slate-900 drop-shadow-sm md:text-6xl">
          Technology Stack
        </h2>
        <p className="max-w-lg text-slate-600 drop-shadow-sm text-lg">
          Seven integrated services forming a hybrid on-chain/off-chain
          architecture. Move your mouse to explore.
        </p>
      </div>
    </div>
  );
};
