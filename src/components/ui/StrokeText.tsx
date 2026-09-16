"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";

/** Draws SVG text in via an animated stroke, then fades in the fill behind
 * it. `getComputedTextLength()` only approximates the glyphs' actual stroke
 * perimeter (it's the advance width, not a path length), so the dash array
 * is padded — close enough for a stylized draw-in, not a precise trace. */
export function StrokeText({
  text,
  fontSize = 16,
  strokeColor = "#8185E5",
  fillColor = "#7E6DC9",
  strokeWidth = 1,
  duration = 1.2,
  trigger = "mount",
  className,
}: {
  text: string;
  fontSize?: number;
  strokeColor?: string;
  fillColor?: string;
  strokeWidth?: number;
  duration?: number;
  trigger?: "mount" | "hover";
  className?: string;
}) {
  const textRef = useRef<SVGTextElement>(null);

  useEffect(() => {
    const el = textRef.current;
    if (!el) return;

    const length = Math.ceil(el.getComputedTextLength() * 1.5) || 1;
    gsap.set(el, { strokeDasharray: length, strokeDashoffset: length, fillOpacity: 0 });

    const tl = gsap.timeline({ paused: trigger === "hover" });
    tl.to(el, { strokeDashoffset: 0, duration, ease: "power2.inOut" }).to(
      el,
      { fillOpacity: 1, duration: duration * 0.4, ease: "power1.out" },
      `-=${duration * 0.3}`,
    );

    if (trigger === "mount") tl.play();
    else {
      const node = el.closest("svg") ?? el;
      const play = () => tl.play();
      const reverse = () => tl.reverse();
      node.addEventListener("mouseenter", play);
      node.addEventListener("mouseleave", reverse);
      return () => {
        node.removeEventListener("mouseenter", play);
        node.removeEventListener("mouseleave", reverse);
        tl.kill();
      };
    }

    return () => {
      tl.kill();
    };
  }, [text, duration, trigger]);

  const width = Math.max(text.length * fontSize * 0.62, 10);
  const height = fontSize * 1.4;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      style={{ maxWidth: "100%" }}
      className={className}
      role="img"
      aria-label={text}
    >
      <text
        ref={textRef}
        x="50%"
        y="50%"
        dominantBaseline="middle"
        textAnchor="middle"
        fontSize={fontSize}
        fontWeight={600}
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        fill={fillColor}
      >
        {text}
      </text>
    </svg>
  );
}
