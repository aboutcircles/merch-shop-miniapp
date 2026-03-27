import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { Panel } from "@/components/ui/Panel";

const secondaryLinks = [
  {
    href: "https://github.com/aboutcircles/circles-gnosisApp-starter-kit",
    label: "Boilerplate for QR-based miniapps",
    description: "Use the Gnosis App starter kit when your mini app hands payment or signing off through a QR flow.",
  },
  {
    href: "https://github.com/aboutcircles/CirclesMiniapps",
    label: "Circles Miniapps GitHub repo",
    description: "Study the hosted mini app codebase and the integration patterns used inside the Circles environment.",
  },
  {
    href: "https://github.com/aboutcircles/CirclesMiniapps#submitting-your-app-to-the-marketplace",
    label: "How to submit miniapps",
    description: "Follow the marketplace submission guide and open a PR with your app entry.",
  },
];

const valueProps = [
  {
    title: "Two integration models",
    body: "Some mini apps are hosted inside iframe windows, while others use a QR handoff and complete the wallet step in Gnosis App.",
  },
  {
    title: "Wallet interactions where they fit",
    body: "Hosted apps can request signatures and transactions through the Circles host. QR apps move that confirmation step into Gnosis App.",
  },
  {
    title: "Focused product surfaces",
    body: "Both patterns let teams ship a narrow, useful onchain flow without rebuilding the full platform around it.",
  },
];

const buildFlow = [
  {
    step: "1",
    title: "Choose the right pattern",
    body: "Start by deciding whether your app should be hosted inside Circles or whether it should use a QR handoff to Gnosis App for the wallet step.",
  },
  {
    step: "2",
    title: "Implement the interaction",
    body: "Hosted apps integrate with the Circles host bridge for signatures and transactions. QR apps render a QR payload, then watch for the resulting onchain action.",
  },
  {
    step: "3",
    title: "Decide how users discover it",
    body: "Hosted mini apps can be submitted to the Circles mini app marketplace. QR-based flows can also live on shared screens, booths, or merchant pages outside the hosted gallery.",
  },
];

const miniAppTypes = [
  {
    title: "QR-initiated mini apps",
    subtitle: "Best for shared screens, booths, kiosks, and in-person flows",
    body: "This merch shop is an example of a QR-first mini app. The app runs as a lightweight web experience, but the actual payment is completed from the user's Gnosis App after they scan a QR code. That pattern works well when the app is shown on a public device or when the person completing the action is not already interacting from their own wallet-enabled browser.",
    bullets: [
      "The screen displays a payment request or action as a QR code.",
      "The user scans the QR with Gnosis App and confirms the transaction there.",
      "The mini app watches for the resulting onchain payment and updates the UI after settlement.",
    ],
  },
  {
    title: "Hosted wallet-connected mini apps",
    subtitle: "Best for product flows that should feel fully native inside Circles",
    body: "Mini apps hosted at circles.gnosis.io run inside the Circles mini app host and can integrate wallet interaction directly through the host bridge. Instead of asking the user to switch devices and scan a QR, the app can request signatures or transactions from inside the Circles environment itself. That makes the flow feel more embedded, continuous, and app-like.",
    bullets: [
      "The mini app is opened from the Circles mini app gallery or a direct mini app URL.",
      "Wallet interactions are requested through the Circles iframe host instead of a separate QR handoff.",
      "This pattern is better when you want mobile first flows, richer in-app experiences, repeat actions, or deeper product journeys.",
    ],
  },
];

export const metadata: Metadata = {
  title: "Developers | Gnosis Merch Shop",
  description: "Learn what Circles mini apps are, how they work, and how to start building one.",
};

export default function DevelopersPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-6 px-4 py-5 md:px-8 md:py-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="overflow-hidden rounded-[18px] border border-[var(--line)] bg-white/80 p-2 shadow-[0_10px_30px_rgba(5,6,26,0.06)]">
            <Image src="/circles-logo.svg" alt="Circles logo" width={44} height={44} priority />
          </div>
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--accent)]">Circles</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight text-[var(--ink)] md:text-4xl">
              Mini App Developers
            </h1>
          </div>
        </div>

        <Link
          href="/"
          className="inline-flex min-h-11 items-center justify-center rounded-full border border-[var(--line)] bg-white px-4 text-sm font-semibold text-[var(--ink)] shadow-[0_10px_30px_rgba(5,6,26,0.06)] transition-transform duration-200 ease-out hover:-translate-y-0.5"
        >
          Back to store
        </Link>
      </header>

      <section>
        <Panel className="relative overflow-hidden p-6 md:p-8">
          <div className="absolute inset-x-0 top-0 h-28 bg-[radial-gradient(circle_at_top,rgba(67,53,223,0.14),transparent_70%)]" />
          <div className="absolute -right-16 top-24 h-44 w-44 rounded-full bg-[rgba(255,125,62,0.12)] blur-3xl" />
          <div className="relative">
            <div className="space-y-6">
              <div className="space-y-4">
                <h2 className="max-w-3xl text-4xl font-semibold tracking-tight text-[var(--ink)] md:text-5xl">
                  Mini apps are focused web experiences built around Circles.
                </h2>
                <p className="text-base leading-7 text-[var(--muted)] md:text-lg">
                  Some run inside the Circles mini app environment and can request wallet interactions directly.
                  Others, like this merch booth, use a QR handoff so the user completes the transaction in Gnosis
                  App. Both patterns let builders ship focused onchain products and lightweight utilities without
                  rebuilding the full product stack from scratch.
                </p>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                {valueProps.map((item) => (
                  <div
                    key={item.title}
                    className="rounded-[24px] border border-[var(--line)] bg-white/88 p-4 shadow-[inset_0_1px_0_#fff]"
                  >
                    <p className="text-sm font-semibold text-[var(--ink)]">{item.title}</p>
                    <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{item.body}</p>
                  </div>
                ))}
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <a
                  href="https://t.me/about_circles/499"
                  target="_blank"
                  rel="noreferrer"
                  className="primary-button inline-flex min-h-12 items-center justify-center rounded-full px-5 text-sm font-semibold shadow-[0_16px_36px_rgba(67,53,223,0.24)] transition-transform duration-200 ease-out hover:-translate-y-0.5"
                >
                  Join Circles Builders on Telegram
                </a>
                <a
                  href="https://circles.gnosis.io/miniapps"
                  target="_blank"
                  rel="noreferrer"
                  className="secondary-button inline-flex min-h-12 items-center justify-center rounded-full px-5 text-sm font-semibold transition-transform duration-200 ease-out hover:-translate-y-0.5"
                >
                  Browse Circles Miniapps
                </a>
              </div>
            </div>
          </div>
        </Panel>
      </section>

      <section className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
        <Panel className="p-6 md:p-8">
          <div className="space-y-3">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--accent)]">How it works</p>
            <h3 className="text-3xl font-semibold tracking-tight text-[var(--ink)]">The build path depends on the pattern you choose</h3>
            <p className="max-w-2xl text-sm leading-6 text-[var(--muted)]">
              There is not one single mini app architecture. The main decision is whether your app should live
              inside the Circles mini app host or whether it should use a QR-based handoff to Gnosis App from an
              external screen or web page.
            </p>
          </div>

          <div className="mt-6 grid gap-4">
            {buildFlow.map((item) => (
              <div
                key={item.step}
                className="grid gap-3 rounded-[24px] border border-[var(--line)] bg-white/90 p-4 sm:grid-cols-[auto_1fr]"
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--accent-soft)] text-sm font-semibold text-[var(--accent)]">
                  {item.step}
                </div>
                <div>
                  <p className="text-base font-semibold text-[var(--ink)]">{item.title}</p>
                  <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{item.body}</p>
                </div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel className="p-6 md:p-8">
          <div className="space-y-3">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--accent)]">Developer resources</p>
            <h3 className="text-3xl font-semibold tracking-tight text-[var(--ink)]">Start building or study live examples</h3>
            <p className="max-w-2xl text-sm leading-6 text-[var(--muted)]">
              Use the QR starter when you need a Gnosis App handoff, study the Circles Miniapps repo to
              understand the hosted environment, and follow the submission guide when you are ready to list a
              hosted app.
            </p>
          </div>

          <div className="mt-6 grid gap-3">
            {secondaryLinks.map((item) => (
              <a
                key={item.label}
                href={item.href}
                target="_blank"
                rel="noreferrer"
                className="rounded-[24px] border border-[var(--line)] bg-white/90 p-5 transition-transform duration-200 ease-out hover:-translate-y-0.5"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-lg font-semibold tracking-tight text-[var(--ink)]">{item.label}</p>
                  <span className="text-lg text-[var(--accent)]">↗</span>
                </div>
                <p className="mt-2 max-w-xl text-sm leading-6 text-[var(--muted)]">{item.description}</p>
              </a>
            ))}
          </div>
        </Panel>
      </section>

      <section>
        <Panel className="p-6 md:p-8">
          <div className="space-y-3">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--accent)]">Two mini app patterns</p>
            <h3 className="text-3xl font-semibold tracking-tight text-[var(--ink)]">Choose the interaction model that fits the context</h3>
            <p className="text-sm leading-6 text-[var(--muted)]">
              Circles mini apps do not all behave the same way. Some use a QR handoff so the user completes the
              transaction in Gnosis App, while others are hosted inside the Circles mini app environment and can
              trigger wallet actions directly from within the app.
            </p>
          </div>

          <div className="mt-6 grid gap-4 xl:grid-cols-2">
            {miniAppTypes.map((item) => (
              <div
                key={item.title}
                className="rounded-[28px] border border-[var(--line)] bg-white/92 p-5 shadow-[inset_0_1px_0_#fff]"
              >
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent)]">{item.subtitle}</p>
                  <h4 className="text-2xl font-semibold tracking-tight text-[var(--ink)]">{item.title}</h4>
                  <p className="text-sm leading-6 text-[var(--muted)]">{item.body}</p>
                </div>

                <div className="mt-5 grid gap-3">
                  {item.bullets.map((bullet) => (
                    <div
                      key={bullet}
                      className="flex items-start gap-3 rounded-[20px] border border-[var(--line)] bg-[rgba(250,245,241,0.64)] px-4 py-3"
                    >
                      <span
                        aria-hidden="true"
                        className="mt-[0.7rem] h-2 w-2 shrink-0 rounded-full bg-[var(--accent)]"
                      />
                      <p className="text-sm leading-6 text-[var(--ink)]">{bullet}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </section>
    </main>
  );
}
