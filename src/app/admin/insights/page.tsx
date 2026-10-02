import type { Metadata } from "next";
import { AiInsights } from "@/components/admin/ai-insights";

export const metadata: Metadata = { title: "AI insights" };

export default function InsightsPage() {
  return <AiInsights />;
}
