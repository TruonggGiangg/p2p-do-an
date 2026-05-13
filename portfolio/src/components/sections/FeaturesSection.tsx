import { WobbleCard } from "../ui/wobble-card";

export const FeaturesSection = () => {
  return (
    <div className="py-24 bg-neutral-50 relative" id="features">
      {/* Top separator */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-neutral-300 to-transparent" />
      <h2 className="text-3xl md:text-5xl font-bold text-center mb-4 text-slate-900">
        Five Core Challenges
      </h2>
      <p className="text-slate-600 max-w-2xl text-center mx-auto mb-16 px-4">
        The system addresses five challenges identified in the P2P lending
        domain — from verification gates to privacy-preserving auditability.
      </p>
      <div className="p-4 max-w-7xl mx-auto w-full grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* C1 - Verification-Gated Borrowing */}
        <WobbleCard
          containerClassName="col-span-1 lg:col-span-2 h-full bg-white border border-slate-200 shadow-sm min-h-[500px] lg:min-h-[300px]"
          className=""
        >
          <div className="max-w-sm">
            <div className="text-xs font-mono text-pink-600 mb-2">
              Challenge C1
            </div>
            <h2 className="text-left text-balance text-base md:text-xl lg:text-3xl font-semibold tracking-[-0.015em] text-slate-900">
              Verification-Gated Borrowing
            </h2>
            <p className="mt-4 text-left text-base/6 text-slate-600">
              Borrowers must complete eKYC approval, device-bound SmartOTP
              registration, and PIN setup before submitting a loan or receiving
              wallet functions.
            </p>
          </div>
          <img
            src="/images/ekyc.png"
            alt="eKYC Verification"
            className="absolute -right-4 lg:-right-[10%] -bottom-10 object-contain rounded-2xl w-[80%] lg:w-[50%]"
          />
        </WobbleCard>

        {/* C2 - Risk Assessment */}
        <WobbleCard containerClassName="col-span-1 min-h-[450px] bg-white border border-slate-200 shadow-sm">
          <div className="text-xs font-mono text-blue-600 mb-2">
            Challenge C2
          </div>
          <h2 className="max-w-80 text-left text-balance text-base md:text-xl lg:text-3xl font-semibold tracking-[-0.015em] text-slate-900">
            Risk & Affordability
          </h2>
          <p className="mt-4 max-w-[26rem] text-left text-base/6 text-slate-600">
            Combines internal credit score (150–750), AI probability-of-default
            (0–100), income, and loan term for explainable risk routing.
          </p>
          <img
            src="/images/matching.png"
            alt="Credit Scoring"
            className="absolute -right-4 lg:-right-0 -bottom-4 object-contain rounded-2xl w-[90%] lg:w-[100%] h-48 mt-4"
          />
        </WobbleCard>

        {/* C3 - Policy Mutability */}
        <WobbleCard containerClassName="col-span-1 min-h-[450px] bg-white border border-slate-200 shadow-sm">
          <div className="text-xs font-mono text-emerald-600 mb-2">
            Challenge C3
          </div>
          <h2 className="max-w-80 text-left text-balance text-base md:text-xl lg:text-3xl font-semibold tracking-[-0.015em] text-slate-900">
            Policy Versioning
          </h2>
          <p className="mt-4 max-w-[26rem] text-left text-base/6 text-slate-600 z-10 relative">
            Score weights, grade bands, and approval thresholds can change — so
            every decision stores the policy version hash used at that moment.
          </p>
          <img
            src="/images/repayment.png"
            alt="Policy Config"
            className="absolute -right-4 lg:-right-0 -bottom-4 object-contain rounded-2xl w-[90%] lg:w-[100%] h-48 mt-4"
          />
        </WobbleCard>

        {/* C4+C5 - Funding Traceability + Privacy */}
        <WobbleCard
          containerClassName="col-span-1 lg:col-span-2 h-full bg-white border border-slate-200 shadow-sm min-h-[500px] lg:min-h-[300px]"
          className=""
        >
          <div className="max-w-md">
            <div className="text-xs font-mono text-indigo-600 mb-2">
              Challenges C4 + C5
            </div>
            <h2 className="text-left text-balance text-base md:text-xl lg:text-3xl font-semibold tracking-[-0.015em] text-slate-900">
              Funding Traceability & Privacy
            </h2>
            <p className="mt-4 text-left text-base/6 text-slate-600">
              Investor allocations, digital signatures, and disbursement form
              one reconstructable dependency chain. Identity documents,
              contracts, and wallet data are never stored raw on-chain — only
              masked references, SHA-256 hashes, and timestamps.
            </p>
          </div>
          <div className="absolute -right-10 -bottom-10 lg:-right-10 lg:-bottom-20 w-[60%] opacity-20">
            <svg
              viewBox="0 0 200 200"
              xmlns="http://www.w3.org/2000/svg"
              className="w-full h-full fill-indigo-100"
            >
              <path
                d="M45,-77.9C58.3,-71.4,69.2,-58.5,77.7,-44.1C86.1,-29.7,92,-14.8,91.8,-0.1C91.6,14.6,85.2,29.1,75.9,41.4C66.5,53.7,54.1,63.7,40.4,72.3C26.6,80.9,11.3,88.1,-3.5,94.1C-18.4,100.2,-36.8,105.1,-52.4,98.6C-67.9,92.1,-80.7,74.2,-87.3,55.1C-93.9,36.1,-94.3,16,-90.6,-2.2C-86.8,-20.3,-78.9,-36.6,-67.2,-48.9C-55.5,-61.1,-40.1,-69.3,-25.6,-74.6C-11,-80,4.4,-82.6,19.3,-81.1C34.2,-79.7,48.5,-74.2,59.3,-64.8L45,-77.9Z"
                transform="translate(100 100)"
              />
            </svg>
          </div>
        </WobbleCard>
      </div>
    </div>
  );
};
