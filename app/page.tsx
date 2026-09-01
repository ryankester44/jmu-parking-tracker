import { Section } from "@/components/Section";
import { DevCollectButton } from "@/components/DevCollectButton";
import { LiveDashboard } from "@/components/LiveDashboard";
import { TodayPanel } from "@/components/TodayPanel";
import { TypicalPanel } from "@/components/TypicalPanel";
import { BestTimesToPark } from "@/components/BestTimesToPark";
import { Heatmap } from "@/components/Heatmap";
import { WhereShouldIPark } from "@/components/WhereShouldIPark";
import { DataInfo } from "@/components/DataInfo";

export default function Home() {
  return (
    <main>
      <header className="border-b" style={{ borderColor: "var(--border)" }}>
        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
          <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-jmu-purple">
            Unofficial &middot; Student Project
          </p>
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
            <span className="text-jmu-purple">JMU</span> Parking Tracker
          </h1>
          <p className="mt-2 max-w-2xl text-[color:var(--text-secondary)]">
            See when commuter decks fill up and find the best time to park.
          </p>
        </div>
      </header>

      <Section id="live" title="Live Availability">
        {process.env.NODE_ENV !== "production" && <DevCollectButton />}
        <LiveDashboard />
      </Section>

      <Section
        id="today"
        title="Today's Parking"
        subtitle="Minute-by-minute availability for a specific day. Click a deck below the chart to hide/show it."
      >
        <TodayPanel />
      </Section>

      <Section
        id="typical"
        title="Typical Availability"
        subtitle="Historical averages by weekday — Monday and Friday patterns are never mixed together."
      >
        <TypicalPanel />
      </Section>

      <Section id="best-times" title="Best Times to Park" subtitle="Generated from real historical averages, not a forecast.">
        <BestTimesToPark />
      </Section>

      <Section id="heatmap" title="Availability Heatmap">
        <Heatmap />
      </Section>

      <Section id="where" title="Where Should I Park?" subtitle="Pick a weekday and arrival time to rank decks by historical availability.">
        <WhereShouldIPark />
      </Section>

      <Section id="data-info" title="Data Information">
        <DataInfo />
      </Section>

      <footer className="mx-auto max-w-6xl px-4 pb-10 pt-4 text-xs text-[color:var(--text-muted)] sm:px-6">
        Not an official JMU website. Parking availability data is sourced from JMU&apos;s own public
        commuter parking feed.
      </footer>
    </main>
  );
}
