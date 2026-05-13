import { Timeline } from "../ui/timeline";
import { CheckCircle2, ShieldAlert, BadgeDollarSign, FileSignature, Landmark } from "lucide-react";

export const WorkflowSection = () => {
  const data = [
    {
      title: "Step 1: Verification Gates",
      content: (
        <div className="text-slate-600">
          <p className="text-slate-600 text-sm md:text-lg font-normal mb-8">
            Borrowers must pass strict identity verification gates before they can interact with the lending platform.
          </p>
          <div className="flex gap-4 items-start mb-6">
            <CheckCircle2 className="w-6 h-6 text-emerald-400 shrink-0 mt-1" />
            <div>
              <h4 className="text-slate-900 font-semibold text-lg">eKYC & SmartOTP</h4>
              <p className="text-sm text-slate-600 mt-1">Identity validation, facial recognition, and device-bound OTP registration ensure only verified users proceed.</p>
            </div>
          </div>
          <div className="flex gap-4 items-start">
            <CheckCircle2 className="w-6 h-6 text-emerald-400 shrink-0 mt-1" />
            <div>
              <h4 className="text-slate-900 font-semibold text-lg">PIN Setup</h4>
              <p className="text-sm text-slate-600 mt-1">Secure PIN creation for wallet operations and transaction authorization. Verification snapshot stored as Fabric evidence.</p>
            </div>
          </div>
        </div>
      ),
    },
    {
      title: "Step 2: Risk Assessment",
      content: (
        <div className="text-slate-600">
          <p className="text-slate-600 text-sm md:text-lg font-normal mb-8">
            The platform assesses risk using a dual-score mechanism before routing the application.
          </p>
          <div className="flex gap-4 items-start mb-6">
            <ShieldAlert className="w-6 h-6 text-blue-400 shrink-0 mt-1" />
            <div>
              <h4 className="text-slate-900 font-semibold text-lg">Internal Scorecard S<sub>int</sub> (150–750)</h4>
              <p className="text-sm text-slate-600 mt-1">Logistic scorecard using 5 WoE features: payment history, debt utilization, credit age, credit mix, and new credit.</p>
            </div>
          </div>
          <div className="flex gap-4 items-start">
            <ShieldAlert className="w-6 h-6 text-blue-400 shrink-0 mt-1" />
            <div>
              <h4 className="text-slate-900 font-semibold text-lg">AI Review Score S<sub>eval</sub> (0–100)</h4>
              <p className="text-sm text-slate-600 mt-1">AI probability-of-default converted to review score. Policy maps S<sub>eval</sub> to grades and approval/rejection/review actions.</p>
            </div>
          </div>
        </div>
      ),
    },
    {
      title: "Step 3: Investor Funding",
      content: (
        <div className="text-slate-600">
          <p className="text-slate-600 text-sm md:text-lg font-normal mb-8">
            Approved loans enter the funding pool where investors allocate capital.
          </p>
          <div className="flex gap-4 items-start mb-6">
            <BadgeDollarSign className="w-6 h-6 text-yellow-400 shrink-0 mt-1" />
            <div>
              <h4 className="text-slate-900 font-semibold text-lg">Direct & Auto Matching</h4>
              <p className="text-sm text-slate-600 mt-1">Investors manually select loans or configure automatic matching rules based on grade and term preferences.</p>
            </div>
          </div>
          <div className="flex gap-4 items-start">
            <BadgeDollarSign className="w-6 h-6 text-yellow-400 shrink-0 mt-1" />
            <div>
              <h4 className="text-slate-900 font-semibold text-lg">Funding Traceability</h4>
              <p className="text-sm text-slate-600 mt-1">Each allocation anchored on Fabric with masked investor reference and loan reference for audit reconstruction.</p>
            </div>
          </div>
        </div>
      ),
    },
    {
      title: "Step 4: Contract Signing",
      content: (
        <div className="text-slate-600">
          <p className="text-slate-600 text-sm md:text-lg font-normal mb-8">
            Legally binding digital contracts generated and signed by all parties through PKI.
          </p>
          <div className="flex gap-4 items-start">
            <FileSignature className="w-6 h-6 text-sky-400 shrink-0 mt-1" />
            <div>
              <h4 className="text-slate-900 font-semibold text-lg">PKI-based Digital Signatures</h4>
              <p className="text-sm text-slate-600 mt-1">Integration with VNPT SmartCA for remote signing. Contract hash and signer PKI reference committed to Hyperledger Fabric.</p>
            </div>
          </div>
        </div>
      ),
    },
    {
      title: "Step 5: Servicing & Delinquency",
      content: (
        <div className="text-slate-600">
          <p className="text-slate-600 text-sm md:text-lg font-normal mb-8">
            Signature-gated disbursement, repayment tracking, and explainable delinquency handling.
          </p>
          <div className="flex gap-4 items-start mb-6">
            <Landmark className="w-6 h-6 text-cyan-400 shrink-0 mt-1" />
            <div>
              <h4 className="text-slate-900 font-semibold text-lg">Signature-Gated Disbursement</h4>
              <p className="text-sm text-slate-600 mt-1">Capital released to borrower's wallet only after verifying all required cryptographic signatures are complete.</p>
            </div>
          </div>
          <div className="flex gap-4 items-start">
            <Landmark className="w-6 h-6 text-cyan-400 shrink-0 mt-1" />
            <div>
              <h4 className="text-slate-900 font-semibold text-lg">Explainable Delinquency</h4>
              <p className="text-sm text-slate-600 mt-1">Overdue handling maps behavior into 5 groups per SBV Circular 31/2024, with rule-version evidence on-chain for blocking explainability.</p>
            </div>
          </div>
        </div>
      ),
    },
  ];

  return (
    <div className="w-full bg-white relative py-10" id="workflow">
      {/* Top separator */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-neutral-300 to-transparent" />
      <Timeline data={data} />
    </div>
  );
};
