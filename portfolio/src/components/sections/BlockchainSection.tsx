import { BackgroundBeams } from "../ui/background-beams";
import { CardContainer, CardBody, CardItem } from "../ui/3d-card-effect";
import { Button as MovingBorderCard } from "../ui/moving-border";
import { motion } from "framer-motion";
import {
  FileKey,
  FileCheck2,
  Handshake,
  Network,
  Route,
  Ban,
  ArrowRight,
} from "lucide-react";

const evidenceItems = [
  {
    icon: <FileKey className="w-5 h-5" />,
    type: "Policy",
    fields: "Version ID, config hash, thresholds",
    purpose: "Prove the exact rule active at decision time",
    image: "/images/evidence/policy.png",
    color: "from-cyan-500 to-blue-500",
    shadow: "shadow-cyan-500/[0.15]",
  },
  {
    icon: <FileCheck2 className="w-5 h-5" />,
    type: "Document",
    fields: "SHA-256 digest, type, upload ref",
    purpose: "Detect post-decision file tampering",
    image: "/images/evidence/document.png",
    color: "from-emerald-500 to-teal-500",
    shadow: "shadow-emerald-500/[0.15]",
  },
  {
    icon: <Handshake className="w-5 h-5" />,
    type: "Contract & PKI",
    fields: "Contract hash, signer role, PKI ref",
    purpose: "Verify signing intent irrefutably",
    image: "/images/evidence/contract.png",
    color: "from-amber-500 to-orange-500",
    shadow: "shadow-amber-500/[0.15]",
  },
  {
    icon: <Network className="w-5 h-5" />,
    type: "Funding",
    fields: "Loan ref, masked investor ref, amount",
    purpose: "Rebuild the funding chain privately",
    image: "/images/evidence/funding.png",
    color: "from-pink-500 to-rose-500",
    shadow: "shadow-pink-500/[0.15]",
  },
  {
    icon: <Route className="w-5 h-5" />,
    type: "State Transition",
    fields: "From state → To state, policy ref",
    purpose: "Reconstruct the entire loan lifecycle",
    image: "/images/evidence/state.png",
    color: "from-indigo-500 to-violet-500",
    shadow: "shadow-indigo-500/[0.15]",
  },
  {
    icon: <Ban className="w-5 h-5" />,
    type: "Delinquency",
    fields: "Group, rule version, restriction ref",
    purpose: "Explain overdue blocking decisions",
    image: "/images/evidence/delinquency.png",
    color: "from-red-500 to-pink-500",
    shadow: "shadow-red-500/[0.15]",
  },
];

const flowSteps = [
  { step: "01", label: "Business Event", desc: "Off-chain record is generated when a loan is approved, contract signed, or funds transferred." },
  { step: "02", label: "Field Masking", desc: "Sensitive identifiers like national ID and wallet addresses are replaced with truncated hashes." },
  { step: "03", label: "Canonical JSON", desc: "Deterministic serialization ensures identical string output regardless of field ordering." },
  { step: "04", label: "SHA-256 Hash", desc: "A fixed-length 256-bit cryptographic digest serves as tamper-evident evidence." },
  { step: "05", label: "Fabric Commit", desc: "The evidence hash and policy reference are committed to Hyperledger Fabric's immutable world state." },
];

export const BlockchainSection = () => {
  return (
    <div className="w-full bg-neutral-50 relative overflow-hidden py-20" id="blockchain">
      <BackgroundBeams className="opacity-20" />

      <div className="relative z-10 max-w-7xl mx-auto px-4 md:px-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center mb-20"
        >
          <h2 className="text-3xl md:text-5xl font-bold text-slate-900 mb-4">
            Blockchain Evidence Pipeline
          </h2>
          <p className="text-slate-600 max-w-3xl mx-auto text-base md:text-lg">
            Operational data remains in the NoSQL database. Only compact,
            verifiable evidence is committed to Hyperledger Fabric.
          </p>
        </motion.div>

        {/* Pipeline — Moving Border Steps */}
        <div className="relative mb-28">
          {/* Animated connection line (desktop) */}
          <div className="hidden lg:block absolute top-5 left-[10%] right-[10%] -translate-y-1/2 z-0">
            <div className="h-px w-full bg-gradient-to-r from-sky-500/0 via-sky-500/60 to-sky-500/0 relative">
              <motion.div
                className="absolute top-0 left-0 h-px w-24 bg-gradient-to-r from-transparent via-sky-400 to-transparent"
                animate={{ x: ["0%", "1400%"] }}
                transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-5 relative z-10">
            {flowSteps.map((item, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: i * 0.12 }}
                className="relative flex flex-col items-center"
              >
                {/* Step number badge */}
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-sky-500 to-blue-600 flex items-center justify-center text-white font-bold text-sm mb-3 shadow-lg shadow-sky-500/30 z-10">
                  {item.step}
                </div>

                {/* Moving border card */}
                <MovingBorderCard
                  as="div"
                  borderRadius="0.75rem"
                  duration={3000 + i * 500}
                  containerClassName="w-full h-44 p-[1px]"
                  borderClassName="bg-[radial-gradient(var(--sky-500)_40%,transparent_60%)]"
                  className="bg-white border-slate-200 p-5 w-full h-full"
                >
                  <h4 className="text-slate-900 font-semibold text-base mb-2 leading-tight">
                    {item.label}
                  </h4>
                  <p className="text-slate-600 text-xs leading-relaxed">
                    {item.desc}
                  </p>
                </MovingBorderCard>

                {/* Arrow connector (mobile/tablet) */}
                {i < flowSteps.length - 1 && (
                  <div className="lg:hidden flex justify-center my-2">
                    <ArrowRight className="w-5 h-5 text-sky-500/50 rotate-90 md:rotate-0" />
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        </div>

        {/* Evidence Grid — 3D Cards with AI Images */}
        <motion.h3
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          className="text-2xl md:text-3xl font-bold text-slate-900 text-center mb-10"
        >
          Six Types of On-Chain Evidence
        </motion.h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {evidenceItems.map((item, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: i * 0.08 }}
            >
              <CardContainer className="inter-var w-full">
                <CardBody
                  className={`bg-white relative group/card shadow-sm hover:shadow-lg ${item.shadow} border-slate-200 w-full h-auto rounded-xl p-5 border`}
                >
                  <CardItem translateZ="50" className="flex items-center gap-2.5 w-full">
                    <div className={`p-2 rounded-lg bg-gradient-to-br ${item.color} text-white`}>
                      {item.icon}
                    </div>
                    <div>
                      <h4 className="text-slate-900 font-bold text-base">{item.type}</h4>
                      <p className="text-slate-500 text-[10px] font-mono">{item.fields}</p>
                    </div>
                  </CardItem>

                  <CardItem translateZ="100" className="w-full mt-3">
                    <img
                      src={item.image}
                      alt={item.type}
                      className="h-40 w-full object-cover rounded-xl group-hover/card:shadow-xl"
                    />
                  </CardItem>

                  <CardItem as="p" translateZ="30" className="text-slate-600 text-sm mt-3 leading-relaxed">
                    {item.purpose}
                  </CardItem>

                  <CardItem translateZ="20" className="w-full mt-3">
                    <div className={`h-0.5 w-full rounded-full bg-gradient-to-r ${item.color} opacity-40 group-hover/card:opacity-100 transition-opacity`} />
                  </CardItem>
                </CardBody>
              </CardContainer>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
};
