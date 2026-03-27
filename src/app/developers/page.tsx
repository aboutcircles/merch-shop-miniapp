import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { Panel } from "@/components/ui/Panel";

const secondaryLinks = [
  {
    href: "https://github.com/aboutcircles/circles-gnosisApp-starter-kit",
    label: "Boilerplate for QR-based miniapps",
    description: "Use this starter when users scan a QR code and complete the action inside Gnosis App.",
  },
  {
    href: "https://github.com/aboutcircles/CirclesMiniapps",
    label: "Circles Miniapps GitHub repo",
    description: "Study the hosted mini app setup when you want users to sign actions directly inside Circles with their Gnosis App passkey.",
  },
  {
    href: "https://github.com/aboutcircles/CirclesMiniapps#submitting-your-app-to-the-marketplace",
    label: "How to submit miniapps",
    description: "Follow this guide when your hosted mini app is ready to be listed in the Circles mini app store.",
  },
];

const valueProps = [
  {
    title: "Two user journeys",
    body: "Users either sign the action directly inside Circles with their Gnosis App passkey or scan a QR code and finish it in Gnosis App.",
  },
  {
    title: "Direct signing feels smoother",
    body: "Hosted mini apps keep people in one flow, but they require the Circles SDK and listing in the mini app store.",
  },
  {
    title: "QR is easier to deploy",
    body: "QR-based mini apps can run on almost any web page or shared screen without store listing, but they add one extra step for the user.",
  },
];

const buildFlow = [
  {
    step: "1",
    title: "Choose the user journey first",
    body: "Decide whether people should sign directly inside Circles with their Gnosis App passkey or scan a QR code and continue in Gnosis App.",
  },
  {
    step: "2",
    title: "Implement the interaction",
    body: "Hosted apps integrate with the Circles SDK and host bridge for signatures and transactions. QR apps render a QR payload, then watch for the resulting onchain action.",
  },
  {
    step: "3",
    title: "Decide how users discover it",
    body: "Hosted mini apps can be listed in the Circles mini app store. QR-based flows can also live on shared screens, booths, or merchant pages without store distribution.",
  },
];

const miniAppTypes = [
  {
    title: "Hosted mini apps with direct signing",
    subtitle: "Best for the smoothest user experience inside Circles",
    body: "In this model, the user opens your mini app inside Circles and signs actions directly with their Gnosis App passkey. They do not need to switch devices or scan a code, so the flow feels more natural for repeat actions and deeper product journeys. The tradeoff is that you need the Circles SDK and a listing in the mini app store.",
    bullets: [
      "The user opens the app from the Circles mini app store or a hosted mini app URL.",
      "Signatures and transactions are requested directly inside the Circles environment.",
      "This is the more user-friendly route, but it depends on host integration and store distribution.",
    ],
  },
  {
    title: "QR-initiated mini apps",
    subtitle: "Best for booths, kiosks, shared screens, and quick launches",
    body: "This merch shop is an example of the QR route. Your app can run on a normal web page, kiosk, or public screen, and when the wallet step is needed it shows a QR code. The user scans it with Gnosis App and finishes the action there. That makes the setup more flexible because you do not need hosted mini app integration or store listing, but it is slightly less convenient for the user.",
    bullets: [
      "The screen displays a payment request or action as a QR code.",
      "The user scans the QR with Gnosis App and confirms the transaction there.",
      "The mini app watches for the resulting onchain action and updates the UI after settlement.",
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
                  There are two common ways to build one. In the smoother path, the user opens your app inside
                  Circles MiniApp environment and signs with their Gnosis App passkey. In the more flexible path, the user scans a QR
                  code and finishes the action in Gnosis App. The first route is more user-friendly, but it
                  requires Circles host integration, SDK usage, and listing in the mini app store. The second
                  route is easier to ship anywhere, but it adds a handoff step.
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
            <h3 className="text-3xl font-semibold tracking-tight text-[var(--ink)]">Start from the user experience you want</h3>
            <p className="max-w-2xl text-sm leading-6 text-[var(--muted)]">
              The main decision is simple: should users approve actions directly inside your mini app, or should
              they scan a QR code and continue in Gnosis App? That user-facing choice determines the integration
              work and distribution path.
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
              Use the QR starter when you want a scan-first flow, study the Circles Miniapps repo when you want
              direct in-app signing, and follow the submission guide when your hosted app is ready for the store.
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
              The difference is mostly about what the user has to do at the moment of signing. Either they stay
              inside the mini app and approve with their Gnosis App passkey, or they scan a QR code and complete
              the action in Gnosis App.
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
