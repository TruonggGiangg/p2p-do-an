"use client";
import React, { useRef, useCallback, ReactNode } from "react";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { cn } from "../../lib/utils";

interface ParallaxHeroImagesProps {
  images?: string[];
  children?: ReactNode[];
  className?: string;
  imageClassName?: string;
  variant?: "default" | "edge-focus";
}

interface ImagePosition {
  x: number;
  y: number;
  z: number;
  rotate: number;
}

const defaultPositions: ImagePosition[] = [
  { x: -35, y: -25, z: 0.9, rotate: -12 },
  { x: 32, y: -20, z: 0.6, rotate: 8 },
  { x: -28, y: 22, z: 0.45, rotate: 6 },
  { x: 35, y: 18, z: 0.75, rotate: -8 },
  { x: -42, y: 2, z: 0.5, rotate: 10 },
  { x: 40, y: -8, z: 0.35, rotate: -6 },
  { x: 5, y: 32, z: 0.85, rotate: -4 },
  { x: -10, y: -35, z: 0.4, rotate: 14 },
];

const edgeFocusPositions: ImagePosition[] = [
  { x: -38, y: -22, z: 0.9, rotate: -15 },
  { x: 35, y: -28, z: 0.85, rotate: 10 },
  { x: -20, y: 5, z: 0.3, rotate: 5 },
  { x: 25, y: 0, z: 0.25, rotate: -3 },
  { x: -30, y: 25, z: 0.8, rotate: 8 },
  { x: 38, y: 22, z: 0.9, rotate: -12 },
  { x: 0, y: -30, z: 0.7, rotate: -6 },
  { x: 5, y: 28, z: 0.75, rotate: 4 },
];

export const ParallaxHeroImages = ({
  images,
  children,
  className,
  imageClassName,
  variant = "default",
}: ParallaxHeroImagesProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  const smoothX = useSpring(mouseX, { stiffness: 80, damping: 20, mass: 0.5 });
  const smoothY = useSpring(mouseY, { stiffness: 80, damping: 20, mass: 0.5 });

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      mouseX.set((e.clientX - centerX) / (rect.width / 2));
      mouseY.set((e.clientY - centerY) / (rect.height / 2));
    },
    [mouseX, mouseY]
  );

  const handleMouseLeave = useCallback(() => {
    mouseX.set(0);
    mouseY.set(0);
  }, [mouseX, mouseY]);

  const positions = variant === "edge-focus" ? edgeFocusPositions : defaultPositions;
  const items = children || [];
  const imageItems = images || [];

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className={cn("absolute inset-0 overflow-hidden", className)}
    >
      {imageItems.map((src, index) => (
        <ParallaxItem
          key={`img-${index}`}
          position={positions[index % positions.length]}
          smoothX={smoothX}
          smoothY={smoothY}
          index={index}
        >
          <img
            src={src}
            alt={`Parallax ${index + 1}`}
            className={cn(
              "w-60 rounded-xl shadow-2xl shadow-black/50 object-cover pointer-events-none select-none border border-white/10",
              imageClassName
            )}
            draggable={false}
          />
        </ParallaxItem>
      ))}
      {items.map((child, index) => (
        <ParallaxItem
          key={`child-${index}`}
          position={positions[index % positions.length]}
          smoothX={smoothX}
          smoothY={smoothY}
          index={index}
        >
          {child}
        </ParallaxItem>
      ))}
    </div>
  );
};

const ParallaxItem = ({
  children,
  position,
  smoothX,
  smoothY,
  index,
}: {
  children: ReactNode;
  position: ImagePosition;
  smoothX: any;
  smoothY: any;
  index: number;
}) => {
  const intensity = position.z * 50;

  const translateX = useTransform(smoothX, [-1, 1], [-intensity, intensity]);
  const translateY = useTransform(smoothY, [-1, 1], [-intensity, intensity]);
  const rotateX = useTransform(smoothY, [-1, 1], [position.z * 8, -position.z * 8]);
  const rotateY = useTransform(smoothX, [-1, 1], [-position.z * 8, position.z * 8]);

  return (
    <motion.div
      initial={{ opacity: 0, filter: "blur(12px)", scale: 0.8 }}
      animate={{ opacity: 1, filter: "blur(0px)", scale: 1 }}
      transition={{ duration: 0.7, delay: index * 0.12, ease: "easeOut" }}
      className="absolute pointer-events-none"
      style={{
        left: `${50 + position.x}%`,
        top: `${50 + position.y}%`,
        x: translateX,
        y: translateY,
        rotateX,
        rotateY,
        rotate: position.rotate,
        zIndex: Math.round(position.z * 10),
        transformStyle: "preserve-3d",
        perspective: 800,
      }}
    >
      {children}
    </motion.div>
  );
};
