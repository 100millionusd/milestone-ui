"use client";
import { useEffect } from "react";

export default function useMilestonesUpdated(onChange: () => void) {
  useEffect(() => {
    const h = () => onChange();
    window.addEventListener("milestones:updated", h);
    return () => window.removeEventListener("milestones:updated", h);
  }, [onChange]);
}
