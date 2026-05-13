import { AuroraBackground } from "../ui/aurora-background";
import { Button as MovingBorderButton } from "../ui/moving-border";
import { motion } from "framer-motion";

export const CTASection = () => {
  return (
    <AuroraBackground className="min-h-[60vh] h-auto py-20 bg-neutral-50">
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        whileInView={{ opacity: 1, y: 0 }}
        transition={{
          delay: 0.2,
          duration: 0.8,
          ease: "easeInOut",
        }}
        className="relative flex flex-col gap-4 items-center justify-center px-4 z-10"
      >
        <h2 className="text-3xl md:text-6xl font-bold text-slate-900 text-center leading-tight">
          Privacy-Preserving
          <br />
          Audit Architecture
        </h2>
        <p className="font-light text-base md:text-xl text-slate-600 max-w-2xl text-center mt-4 leading-relaxed">
          By storing only verifiable evidence on Hyperledger Fabric and keeping
          private data off-chain, the system supports loan approval, investor
          funding, digital signing, disbursement, and delinquency auditing —
          without sacrificing borrower privacy.
        </p>

        {/* Verification Stats */}
        <div className="flex flex-wrap justify-center gap-8 mt-8 mb-6">
          {[
            { value: "6", label: "Audit Controls" },
            { value: "SHA-256", label: "Hash Standard" },
            { value: "150-750", label: "Credit Score Range" },
            { value: "5", label: "Delinquency Groups" },
          ].map((stat, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, scale: 0.8 }}
              whileInView={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.4 + i * 0.1 }}
              className="text-center"
            >
              <div className="text-2xl md:text-3xl font-bold text-slate-900">
                {stat.value}
              </div>
              <div className="text-xs text-slate-600 mt-1">{stat.label}</div>
            </motion.div>
          ))}
        </div>

        <MovingBorderButton
          borderRadius="1.75rem"
          containerClassName="h-14 w-48 sm:w-64 group"
          className="bg-slate-900 text-white border-slate-900 flex items-center justify-center font-semibold transition-all"
        >
          <span className="mr-2">Read the IEEE Paper</span>
          <motion.span
            className="inline-block"
            initial={{ x: 0 }}
            whileHover={{ x: 5 }}
            transition={{ type: "spring", stiffness: 400, damping: 10 }}
          >
            →
          </motion.span>
        </MovingBorderButton>
      </motion.div>
    </AuroraBackground>
  );
};
