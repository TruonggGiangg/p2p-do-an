"use client";
import { cn } from "../../lib/utils";
import React, { useRef, useState, useCallback } from "react";

export const GlareCard = ({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) => {
  const isPointerInside = useRef(false);
  const refElement = useRef<HTMLDivElement>(null);
  const [glarePosition, setGlarePosition] = useState({ x: 50, y: 50 });
  const [rotateStyle, setRotateStyle] = useState({
    transform: "perspective(500px) rotateX(0deg) rotateY(0deg)",
  });

  const handleMouseMove = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (!refElement.current || !isPointerInside.current) return;
    const rect = refElement.current.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const percentX = (x / rect.width) * 100;
    const percentY = (y / rect.height) * 100;
    const rotateX = ((percentY - 50) / 50) * -10;
    const rotateY = ((percentX - 50) / 50) * 10;
    setGlarePosition({ x: percentX, y: percentY });
    setRotateStyle({
      transform: `perspective(500px) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`,
    });
  }, []);

  const handleMouseEnter = useCallback(() => {
    isPointerInside.current = true;
  }, []);

  const handleMouseLeave = useCallback(() => {
    isPointerInside.current = false;
    setRotateStyle({
      transform: "perspective(500px) rotateX(0deg) rotateY(0deg)",
    });
    setGlarePosition({ x: 50, y: 50 });
  }, []);

  return (
    <div
      className={cn(
        "relative isolate overflow-hidden rounded-2xl border border-white/10 bg-zinc-950 transition-transform duration-200 ease-out [transform-style:preserve-3d]",
        className
      )}
      ref={refElement}
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      style={rotateStyle}
    >
      {/* Glare overlay */}
      <div
        className="pointer-events-none absolute inset-0 z-30 mix-blend-overlay transition-opacity duration-300"
        style={{
          opacity: isPointerInside.current ? 1 : 0,
          background: `radial-gradient(circle at ${glarePosition.x}% ${glarePosition.y}%, rgba(255,255,255,0.25) 0%, transparent 60%)`,
        }}
      />
      {/* Gradient border glow */}
      <div
        className="pointer-events-none absolute -inset-px z-20 rounded-2xl opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{
          opacity: isPointerInside.current ? 0.6 : 0,
          background: `radial-gradient(circle at ${glarePosition.x}% ${glarePosition.y}%, rgba(120,180,255,0.3) 0%, transparent 50%)`,
        }}
      />
      {/* Content */}
      <div className="relative z-10">{children}</div>
    </div>
  );
};
