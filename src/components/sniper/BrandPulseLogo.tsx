import { cn } from "@/lib/utils";
import { Activity } from "lucide-react";

type BrandPulseLogoProps = {
  size?: "sm" | "lg";
  /** When true, green/red market-energy pulses sweep through the logo. */
  animated?: boolean;
};

/**
 * Reusable brand mark component.
 * - size="sm": h-8 w-8, used in AppShell nav rail header
 * - size="lg": h-24 w-24, used in TradingLoadingScreen hero
 * - animated: adds green (buy) + red (sell) light sweep + breathing effect
 */
export function BrandPulseLogo({ size = "sm", animated = false }: BrandPulseLogoProps) {
  return (
    <div
      className={cn(
        "brand-mark relative overflow-hidden",
        size === "lg"
          ? "flex h-24 w-24 items-center justify-center rounded-2xl shadow-xl md:h-28 md:w-28"
          : "flex h-8 w-8 items-center justify-center rounded-md",
        animated && "loading-brand-mark",
      )}
    >
      <Activity
        className={cn("text-[#1a1208]", size === "lg" ? "h-12 w-12 md:h-14 md:w-14" : "h-4 w-4")}
        strokeWidth={2.5}
      />
      {animated && (
        <>
          <span className="pulse-light pulse-light-buy" aria-hidden="true" />
          <span className="pulse-light pulse-light-sell" aria-hidden="true" />
        </>
      )}
    </div>
  );
}
