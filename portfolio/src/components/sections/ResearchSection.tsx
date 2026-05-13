import { PinContainer } from "../ui/3d-pin";
import { LampContainer } from "../ui/lamp";
import { TextGenerateEffect } from "../ui/text-generate-effect";
import { motion } from "framer-motion";

const abstract = `Peer-to-peer (P2P) lending platforms must coordinate borrower verification, credit assessment, investor funding, contract signing, disbursement, repayment, and delinquency handling. If these decisions are stored only as mutable application data, later audits cannot reliably prove what was approved, by which rule, and at which time. This study designs a privacy-preserving audit architecture that improves decision traceability without storing sensitive borrower data on-chain. The prototype combines a web/mobile lending system, a NoSQL database, an internal credit scorecard, an AI probability-of-default service, a PKI-based digital-signature service, and Hyperledger Fabric as a permissioned evidence layer.`;

export const ResearchSection = () => {
  return (
    <div className="w-full bg-neutral-50 relative pb-20" id="research">
      <LampContainer>
        <motion.div
          initial={{ opacity: 0.5, y: 100 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{
            delay: 0.3,
            duration: 0.8,
            ease: "easeInOut",
          }}
          className="w-full max-w-5xl flex flex-col items-center justify-center"
        >
          <div className="text-center px-8 mb-16">
            <div className="text-sky-400 font-mono text-sm mb-3">
              IEEE ICIMTech 2025
            </div>
            <h2 className="text-3xl md:text-6xl font-bold text-slate-900 mb-6">
              Academic Research
            </h2>
            <div className="text-slate-600 text-base md:text-xl max-w-4xl mx-auto font-light leading-relaxed">
              <TextGenerateEffect words={abstract} />
            </div>
          </div>
          <div className="flex items-center justify-center w-full z-50 min-h-[30rem] pb-20">
            <PinContainer title="Read IEEE Paper" href="#">
              <div className="flex basis-full flex-col p-4 tracking-tight sm:basis-1/2 w-[20rem] h-[24rem]">
                <h3 className="max-w-xs !pb-2 !m-0 font-bold text-base text-slate-900">
                  Blockchain-Backed Auditability
                </h3>
                <div className="text-base !m-0 !p-0 font-normal">
                  <span className="text-slate-500">
                    Decision Traceability in Peer-to-Peer Lending Systems
                  </span>
                </div>
                <div className="flex flex-1 w-full rounded-lg mt-4 bg-gradient-to-br from-sky-500 via-blue-500 to-indigo-500 p-4 relative overflow-hidden">
                  <div className="space-y-2 z-10 relative">
                    <p className="text-xs text-white/90 font-semibold">
                      6 Verification Scenarios:
                    </p>
                    <ul className="text-xs text-white/70 space-y-1">
                      <li>✓ Verification-gated borrowing</li>
                      <li>✓ Policy-versioned approval</li>
                      <li>✓ Document integrity checking</li>
                      <li>✓ Investor funding traceability</li>
                      <li>✓ Signature-gated disbursement</li>
                      <li>✓ Delinquency-rule explainability</li>
                    </ul>
                  </div>
                  <div className="absolute inset-0 bg-black/10" />
                </div>
              </div>
            </PinContainer>
          </div>
        </motion.div>
      </LampContainer>
    </div>
  );
};
