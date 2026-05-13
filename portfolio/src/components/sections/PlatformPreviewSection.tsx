import { MacbookScroll } from "../ui/macbook-scroll";

export const PlatformPreviewSection = () => {
  return (
    <div className="w-full overflow-hidden bg-white" id="platform">
      <MacbookScroll
        title={
          <span className="text-slate-900 text-4xl md:text-5xl font-bold">
            Administration Portal <br />
            <span className="text-slate-600 text-xl md:text-2xl font-normal">
              Staff approval queue, credit policy configuration, and blockchain explorer
            </span>
          </span>
        }
        src="/images/dashboard.png"
        showGradient={false}
      />
    </div>
  );
};
