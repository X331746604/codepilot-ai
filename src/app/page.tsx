import { FeatureGrid } from "@/components/home/feature-grid";
import { Hero } from "@/components/home/hero";
import { Workflow } from "@/components/home/workflow";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";

export default function HomePage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="flex-1">
        <Hero />
        <FeatureGrid />
        <Workflow />
      </main>
      <SiteFooter />
    </div>
  );
}
