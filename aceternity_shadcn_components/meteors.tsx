"use client";
import { cn } from "@/lib/utils";
import { motion } from "motion/react";
import React, { useMemo } from "react";

export const Meteors = ({
  number,
  className,
}: {
  number?: number;
  className?: string;
}) => {
  const meteorCount = number || 20;
  
  // Memoize random values to prevent hydration mismatches
  const meteorData = useMemo(() => {
    return Array.from({ length: meteorCount }, (_, idx) => ({
      id: `meteor-${idx}`,
      position: idx * (800 / meteorCount) - 400,
      animationDelay: (idx * 0.3) % 5, // Deterministic delay pattern
      animationDuration: 5 + (idx % 5), // Deterministic duration pattern
    }));
  }, [meteorCount]);
  
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
    >
      {meteorData.map((meteor) => {
        return (
          <span
            key={meteor.id}
            className={cn(
              "animate-meteor-effect absolute h-0.5 w-0.5 rotate-[45deg] rounded-[9999px] bg-slate-500 shadow-[0_0_0_1px_#ffffff10]",
              "before:absolute before:top-1/2 before:h-[1px] before:w-[50px] before:-translate-y-[50%] before:transform before:bg-gradient-to-r before:from-[#64748b] before:to-transparent before:content-['']",
              className,
            )}
            style={{
              top: "-40px", // Start above the container
              left: meteor.position + "px",
              animationDelay: meteor.animationDelay + "s",
              animationDuration: meteor.animationDuration + "s",
            }}
          ></span>
        );
      })}
    </motion.div>
  );
};
