import { World } from "../ui/globe";

export const GlobeSection = () => {
  const globeConfig = {
    pointSize: 4,
    globeColor: "#f8fafc",
    showAtmosphere: true,
    atmosphereColor: "#e2e8f0",
    atmosphereAltitude: 0.1,
    emissive: "#ffffff",
    emissiveIntensity: 0.1,
    shininess: 0.9,
    polygonColor: "rgba(15, 23, 42, 0.7)",
    ambientLight: "#38bdf8",
    directionalLeftLight: "#ffffff",
    directionalTopLight: "#ffffff",
    pointLight: "#ffffff",
    arcTime: 1000,
    arcLength: 0.9,
    rings: 1,
    maxRings: 3,
    initialPosition: { lat: 22.3193, lng: 114.1694 },
    autoRotate: true,
    autoRotateSpeed: 0.5,
  };

  const colors = ["#06b6d4", "#3b82f6", "#6366f1"];
  const sampleArcs = [
    {
      order: 1,
      startLat: -15.7801,
      startLng: -47.9292,
      endLat: 38.7223,
      endLng: -9.1393,
      arcAlt: 0.2,
      color: colors[Math.floor(Math.random() * colors.length)],
    },
    {
      order: 1,
      startLat: 38.7223,
      startLng: -9.1393,
      endLat: 51.5072,
      endLng: -0.1276,
      arcAlt: 0.1,
      color: colors[Math.floor(Math.random() * colors.length)],
    },
    {
      order: 1,
      startLat: 51.5072,
      startLng: -0.1276,
      endLat: 35.6762,
      endLng: 139.6503,
      arcAlt: 0.3,
      color: colors[Math.floor(Math.random() * colors.length)],
    },
    {
      order: 2,
      startLat: 35.6762,
      startLng: 139.6503,
      endLat: 22.3193,
      endLng: 114.1694,
      arcAlt: 0.1,
      color: colors[Math.floor(Math.random() * colors.length)],
    },
    {
      order: 2,
      startLat: 22.3193,
      startLng: 114.1694,
      endLat: 1.3521,
      endLng: 103.8198,
      arcAlt: 0.1,
      color: colors[Math.floor(Math.random() * colors.length)],
    },
    {
      order: 3,
      startLat: 1.3521,
      startLng: 103.8198,
      endLat: -33.8688,
      endLng: 151.2093,
      arcAlt: 0.2,
      color: colors[Math.floor(Math.random() * colors.length)],
    },
    {
      order: 3,
      startLat: 21.0285, // Hanoi
      startLng: 105.8542,
      endLat: 35.6762, // Tokyo
      endLng: 139.6503,
      arcAlt: 0.2,
      color: colors[0],
    },
    {
      order: 4,
      startLat: 21.0285, // Hanoi
      startLng: 105.8542,
      endLat: 1.3521, // Singapore
      endLng: 103.8198,
      arcAlt: 0.1,
      color: colors[1],
    }
  ];

  return (
    <div className="flex flex-col items-center justify-center py-20 h-[50rem] md:h-[60rem] relative bg-white w-full overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 md:px-8 lg:px-10 z-10 text-center">
        <h2 className="text-3xl md:text-5xl font-bold text-slate-900 mb-4">
          Distributed Trust Network
        </h2>
        <p className="text-slate-600 max-w-2xl mx-auto text-lg">
          Hyperledger Fabric provides permissioned membership, X.509 identity
          management, and channel-based privacy for a borderless P2P lending
          evidence layer.
        </p>
      </div>

      <div className="absolute w-full bottom-0 inset-x-0 h-40 bg-gradient-to-b pointer-events-none select-none from-transparent to-white z-40" />
      
      <div className="absolute w-full h-full z-0 top-[20%]">
        <World globeConfig={globeConfig} data={sampleArcs} />
      </div>

      {/* Separator */}
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-neutral-300 to-transparent z-50" />
    </div>
  );
};
