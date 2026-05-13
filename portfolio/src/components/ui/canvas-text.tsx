"use client";
import { useEffect, useRef } from "react";
import { cn } from "../../lib/utils";

export const CanvasText = ({
  text,
  className,
  colors = ["#3b82f6", "#0ea5e9", "#8b5cf6", "#14b8a6"],
  lineGap = 6,
  animationDuration = 10,
}: {
  text: string;
  className?: string;
  backgroundClassName?: string;
  colors?: string[];
  lineGap?: number;
  animationDuration?: number;
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const textElement = textRef.current;
    if (!textElement) return;

    let animationFrameId: number;
    let startTime = performance.now();

    const resize = () => {
      canvas.width = textElement.offsetWidth;
      canvas.height = textElement.offsetHeight;
    };
    window.addEventListener("resize", resize);
    resize();

    // Map CSS variables to actual colors if needed
    const resolveColor = (color: string) => {
      if (color.startsWith("var(")) {
        const root = document.documentElement;
        const varName = color.slice(4, -1);
        const computed = getComputedStyle(root).getPropertyValue(varName).trim();
        if (computed) return computed;
        // Fallbacks based on Tailwind default colors
        if (varName.includes("blue")) return "#3b82f6";
        if (varName.includes("sky")) return "#0ea5e9";
        if (varName.includes("violet")) return "#8b5cf6";
        if (varName.includes("teal")) return "#14b8a6";
      }
      return color;
    };

    const resolvedColors = colors.map(resolveColor);

    const render = (time: number) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const elapsed = (time - startTime) / (animationDuration * 100);

      // 1. Draw all waves first
      const linesCount = Math.floor(canvas.height / lineGap) + 5;

      for (let i = 0; i < linesCount; i++) {
        const y = i * lineGap;

        ctx.beginPath();
        // Create wavy lines
        for (let x = 0; x <= canvas.width; x += 10) {
          const wave = Math.sin(x * 0.01 + y * 0.05 + elapsed * 5) * 4;
          if (x === 0) {
            ctx.moveTo(x, y + wave);
          } else {
            ctx.lineTo(x, y + wave);
          }
        }

        ctx.strokeStyle = resolvedColors[i % resolvedColors.length];
        ctx.lineWidth = 3;
        ctx.stroke();
      }

      // 2. Use destination-in to mask the waves with the text shape
      ctx.globalCompositeOperation = "destination-in";

      const style = getComputedStyle(textElement);
      ctx.font = style.font || `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "white"; // The color doesn't matter for destination-in, only the alpha channel
      
      // Draw text exactly in the center to match the span
      ctx.fillText(text, canvas.width / 2, canvas.height / 2 + (parseFloat(style.fontSize) * 0.05));

      // 3. Restore default composite operation
      ctx.globalCompositeOperation = "source-over";

      animationFrameId = requestAnimationFrame(render);
    };

    animationFrameId = requestAnimationFrame(render);

    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(animationFrameId);
    };
  }, [colors, lineGap, animationDuration, text]);

  return (
    <div className="relative inline-flex items-center justify-center">
      <span ref={textRef} className={cn("text-transparent select-none", className)}>
        {text}
      </span>
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />
    </div>
  );
};
