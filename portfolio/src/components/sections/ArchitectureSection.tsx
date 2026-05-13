import { CardSpotlight } from "../ui/card-spotlight";
import { Meteors } from "../ui/meteors";
import { motion } from "framer-motion";
import {
  Globe,
  ShieldCheck,
  Cpu,
  Database,
  Blocks,
  Landmark,
} from "lucide-react";

const architectureItems = [
  {
    title: "Gateway Layer",
    description:
      "Nginx reverse proxy handling SSL termination, load balancing, and routing to backend services.",
    icon: <Globe className="w-8 h-8" />,
    color: "text-sky-400",
    borderColor: "group-hover:border-sky-500/50",
  },
  {
    title: "Identity & Access",
    description:
      "Keycloak IAM providing SSO, RBAC, and OIDC for secure multi-role authentication.",
    icon: <ShieldCheck className="w-8 h-8" />,
    color: "text-amber-400",
    borderColor: "group-hover:border-amber-500/50",
  },
  {
    title: "Core Orchestrator",
    description:
      "NestJS service coordinating loan lifecycle, investment matching, risk routing, and wallet movements.",
    icon: <Cpu className="w-8 h-8" />,
    color: "text-red-400",
    borderColor: "group-hover:border-red-500/50",
  },
  {
    title: "Data Persistence",
    description:
      "MongoDB for P2P state management and PostgreSQL for Keycloak identity store.",
    icon: <Database className="w-8 h-8" />,
    color: "text-emerald-400",
    borderColor: "group-hover:border-emerald-500/50",
  },
  {
    title: "Partner Integrations",
    description:
      "VNPT SmartCA for remote PKI signing and Apache Fineract as simulated financial core for loan products.",
    icon: <Landmark className="w-8 h-8" />,
    color: "text-orange-400",
    borderColor: "group-hover:border-orange-500/50",
  },
  {
    title: "Blockchain Trust Layer",
    description:
      "Hyperledger Fabric chaincode storing SHA-256 evidence hashes, policy references, and state transitions.",
    icon: <Blocks className="w-8 h-8" />,
    color: "text-blue-400",
    borderColor: "group-hover:border-blue-500/50",
  },
];

export const ArchitectureSection = () => {
  return (
    <div
      className="py-20 w-full bg-black dark:bg-grid-white/[0.02] relative flex flex-col items-center justify-center overflow-hidden"
      id="architecture"
    >
      <Meteors number={20} />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="text-center mb-16 z-10 relative px-4"
      >
        <h2 className="text-3xl md:text-5xl font-bold text-white mb-4">
          System Architecture
        </h2>
        <p className="text-neutral-400 max-w-2xl mx-auto">
          Three-layer prototype: Client (mobile + web), Service (NestJS core),
          and Evidence (Hyperledger Fabric).
        </p>
      </motion.div>

      <div className="max-w-6xl mx-auto px-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 z-10 relative">
        {architectureItems.map((item, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: i * 0.1 }}
          >
            <CardSpotlight className="h-full group">
              <div className={`${item.color} mb-4`}>{item.icon}</div>
              <h3 className="text-white font-bold text-lg mb-2">
                {item.title}
              </h3>
              <p className="text-neutral-400 text-sm leading-relaxed">
                {item.description}
              </p>
            </CardSpotlight>
          </motion.div>
        ))}
      </div>
    </div>
  );
};
