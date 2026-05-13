import { StickyScroll } from "../ui/sticky-scroll-reveal";
import { FileKey, FileCheck2, Handshake, Network, Route, Ban } from "lucide-react";

const content = [
  {
    title: "Policy References",
    description:
      "To prove the exact rule used at decision time, the system stores the Policy Version ID and configuration hash. Score weights, grade bands, and approval thresholds can change over time — anchoring the active policy ensures old decisions remain verifiable under the rule that applied at that moment.",
    content: (
      <div className="h-full w-full bg-[linear-gradient(to_bottom_right,var(--cyan-500),var(--emerald-500))] flex items-center justify-center text-white">
        <FileKey className="w-20 h-20" />
      </div>
    ),
  },
  {
    title: "Document Digests",
    description:
      "Identity and financial documents cannot be stored raw on-chain due to privacy regulations. Instead, a SHA-256 digest and upload reference are committed to the ledger. During audit, the system recomputes the digest from the current off-chain record and compares it with the stored Fabric value — a mismatch indicates post-decision file tampering.",
    content: (
      <div className="h-full w-full bg-[linear-gradient(to_bottom_right,var(--pink-500),var(--indigo-500))] flex items-center justify-center text-white">
        <FileCheck2 className="w-20 h-20" />
      </div>
    ),
  },
  {
    title: "Contract & PKI",
    description:
      "When a borrower and investor sign a contract via VNPT SmartCA, the platform hashes the generated contract and stores the signer role along with the PKI reference. This irrefutably verifies signing intent and enables signature-gated disbursement — capital is only released when all required signatures are present.",
    content: (
      <div className="h-full w-full bg-[linear-gradient(to_bottom_right,var(--orange-500),var(--yellow-500))] flex items-center justify-center text-white">
        <Handshake className="w-20 h-20" />
      </div>
    ),
  },
  {
    title: "Funding Traceability",
    description:
      "Every capital allocation is traced. The ledger records the loan reference, masked investor reference, and the allocated amount to rebuild the funding chain without exposing the investor's real identity to the public. Both direct and automatic matching allocations are anchored.",
    content: (
      <div className="h-full w-full bg-[linear-gradient(to_bottom_right,var(--cyan-500),var(--emerald-500))] flex items-center justify-center text-white">
        <Network className="w-20 h-20" />
      </div>
    ),
  },
  {
    title: "State Transitions",
    description:
      "The entire loan lifecycle is verifiable. State transitions (e.g., from 'Submitted' to 'Approved' to 'Disbursed') are anchored with timestamps, policy references, and masked actor references to reconstruct the exact flow of events for audit.",
    content: (
      <div className="h-full w-full bg-[linear-gradient(to_bottom_right,var(--pink-500),var(--indigo-500))] flex items-center justify-center text-white">
        <Route className="w-20 h-20" />
      </div>
    ),
  },
  {
    title: "Explainable Delinquency",
    description:
      "If an account becomes overdue, the restriction applied (grace handling, suspension, or legal escalation) is recorded with the active delinquency rule version. Five groups per SBV Circular 31/2024 ensure every blocking decision is explainable to regulators.",
    content: (
      <div className="h-full w-full bg-[linear-gradient(to_bottom_right,var(--orange-500),var(--yellow-500))] flex items-center justify-center text-white">
        <Ban className="w-20 h-20" />
      </div>
    ),
  },
];

export const EvidenceSection = () => {
  return (
    <div className="bg-black py-20 w-full" id="evidence">
      <div className="max-w-7xl mx-auto px-4 md:px-8 lg:px-10 mb-10">
        <h2 className="text-3xl md:text-5xl font-bold text-white max-w-4xl">
          On-Chain Evidence
        </h2>
        <p className="text-neutral-400 text-sm md:text-base mt-4 max-w-2xl">
          Operational records remain in the NoSQL database to ensure privacy,
          while compact, verifiable evidence is committed to Hyperledger Fabric.
          During audit, SHA-256 digest recomputation detects any post-decision modification.
        </p>
      </div>
      <StickyScroll content={content} />
    </div>
  );
};
