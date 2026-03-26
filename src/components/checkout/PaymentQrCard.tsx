"use client";

import QRCode from "react-qr-code";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import type { PurchaseSnapshot } from "@/types";
import { Panel } from "@/components/ui/Panel";
import { StatusBadge } from "@/components/status/StatusBadge";
import { formatDateTime, formatRelativeCountdownAt } from "@/lib/utils";

function IconCircle({
  children,
  tone = "accent",
}: {
  children: React.ReactNode;
  tone?: "accent" | "success";
}) {
  const toneClass =
    tone === "success"
      ? "bg-[var(--success-bg)] text-[var(--success-ink)]"
      : "bg-[var(--accent)]/12 text-[var(--accent)]";

  return (
    <span className={`inline-flex h-10 w-10 items-center justify-center rounded-full ${toneClass}`}>
      {children}
    </span>
  );
}

export function PaymentQrCard({
  snapshot,
  pending,
}: {
  snapshot: PurchaseSnapshot;
  pending: boolean;
}) {
  const router = useRouter();
  const [now, setNow] = useState(() => Date.now());
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => window.clearInterval(interval);
  }, [snapshot.expiresAt]);

  const countdown = formatRelativeCountdownAt(snapshot.expiresAt, now);
  const awaitingPayment = snapshot.paymentStatus === "awaiting_payment";
  const paymentComplete = snapshot.paymentStatus === "paid";
  const refundEligible = paymentComplete && snapshot.outcomeStatus === "won";
  const paymentLost = paymentComplete && snapshot.outcomeStatus === "lost";
  const showMiniAppCta = paymentComplete;
  const showMainMessage = refundEligible || paymentLost;
  const displayMessage = awaitingPayment ? null : snapshot.statusMessage;

  const statusTone =
    refundEligible
      ? "accent"
      : snapshot.paymentStatus === "paid"
        ? "success"
        : snapshot.paymentStatus === "failed"
          ? "error"
          : snapshot.paymentStatus === "cancelled"
            ? "warn"
            : "accent";

  const statusLabel =
    refundEligible
      ? "Winner"
      : snapshot.paymentStatus === "paid"
        ? "Paid"
        : snapshot.paymentStatus === "failed"
          ? "Payment failed"
          : snapshot.paymentStatus === "cancelled"
            ? "Cancelled"
            : "Awaiting payment";

  async function handleCancel() {
    setCancelling(true);

    try {
      await fetch("/api/purchase/cancel", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ticket: snapshot.ticket,
        }),
      });
    } finally {
      router.push("/");
      router.refresh();
    }
  }

  return (
    <Panel className="mx-auto flex w-full max-w-[32rem] flex-col items-center gap-6 p-5 text-center md:p-7">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--accent)]">
          {snapshot.reference}
        </p>
        <h2 className="mt-2 text-3xl font-semibold text-[var(--ink)]">{snapshot.merchName}</h2>
      </div>

      <div
        className={
          refundEligible
            ? "w-full rounded-[30px] border border-[var(--accent)] bg-[radial-gradient(circle_at_top,rgba(255,244,214,0.96),rgba(255,255,255,0.98)_55%,rgba(255,246,232,0.96))] px-6 py-6 shadow-[0_22px_60px_rgba(240,165,49,0.22)]"
            : "flex flex-col items-center gap-3"
        }
      >
        {refundEligible ? (
          <div className="flex flex-col items-center gap-4 text-center">
            <StatusBadge tone={statusTone}>{statusLabel}</StatusBadge>
            <div className="space-y-3">
              <h3 className="flex items-center justify-center gap-3 text-3xl font-semibold tracking-tight text-[var(--ink)] md:text-4xl">
                <span>Congratulations, you won this merch for free!</span>
                <IconCircle>
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 20 20"
                    className="h-6 w-6"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.9"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M10 2.5v3" />
                    <path d="M10 14.5v3" />
                    <path d="M2.5 10h3" />
                    <path d="M14.5 10h3" />
                    <path d="m4.7 4.7 2.1 2.1" />
                    <path d="m13.2 13.2 2.1 2.1" />
                    <path d="m15.3 4.7-2.1 2.1" />
                    <path d="m6.8 13.2-2.1 2.1" />
                    <path d="M10 6.5 11 8.6l2.3.3-1.7 1.6.4 2.2-2-1.1-2 1.1.4-2.2-1.7-1.6 2.3-.3z" />
                  </svg>
                </IconCircle>
              </h3>
              <p className="mx-auto max-w-md text-base leading-7 text-[var(--ink)]">
                The payment you made will be automaticlaly refunded
              </p>
            </div>
          </div>
        ) : null}

        {paymentLost ? (
          <div className="flex flex-col items-center gap-4 text-center">
            <StatusBadge tone="success">Paid</StatusBadge>
            <div className="space-y-3">
              <h3 className="flex items-center justify-center gap-3 text-3xl font-semibold tracking-tight text-[var(--ink)] md:text-4xl">
                <span>Payment received</span>
                <IconCircle tone="success">
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 20 20"
                    className="h-6 w-6"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.25"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="m5 10 3 3 7-7" />
                  </svg>
                </IconCircle>
              </h3>
              <p className="mx-auto flex max-w-md items-center justify-center gap-2 text-base leading-7 text-[var(--ink)]">
                <span>No refund this time. Better luck on the next one</span>
                <svg
                  aria-hidden="true"
                  viewBox="0 0 20 20"
                  className="h-5 w-5 text-[var(--accent)]"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.9"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M9.9 10.2c-.8 1.3-2.2 2-3.5 2-2 0-3.6-1.5-3.6-3.5S4.4 5.2 6.4 5.2c1.3 0 2.6.8 3.4 2" />
                  <path d="M10.1 10.2c.8 1.3 2.2 2 3.5 2 2 0 3.6-1.5 3.6-3.5s-1.6-3.5-3.6-3.5c-1.3 0-2.6.8-3.4 2" />
                  <path d="M10 10.2c-1 0-1.8-.9-1.8-2s.8-2 1.8-2 1.8.9 1.8 2-.8 2-1.8 2Z" />
                  <path d="M10 10.4v5.1" />
                  <path d="M10 15.5c0 1.1-.8 1.9-1.8 1.9" />
                </svg>
              </p>
            </div>
          </div>
        ) : null}

        {!showMainMessage ? (
          <>
            <StatusBadge tone={statusTone}>{statusLabel}</StatusBadge>
            {displayMessage ? <p className="max-w-md text-sm text-[var(--muted)]">{displayMessage}</p> : null}
            {awaitingPayment ? (
              <p className="text-xs uppercase tracking-[0.14em] text-[var(--muted)]">
                {pending ? "Checking for payment..." : "Watching for on-chain payment..."}
              </p>
            ) : null}
          </>
        ) : null}
      </div>

      {awaitingPayment ? (
        <div className="rounded-[28px] border border-[var(--line)] bg-white p-4 shadow-[inset_0_1px_0_#fff]">
          <div className="mx-auto flex max-w-[340px] justify-center rounded-[24px] bg-white p-4 md:p-6">
            <QRCode size={280} value={snapshot.qrPayload} />
          </div>
        </div>
      ) : (
        <div
          className={
            refundEligible
              ? "w-full rounded-[30px] border border-[rgba(240,165,49,0.34)] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(255,248,235,0.98))] px-5 py-5 text-left shadow-[0_18px_40px_rgba(240,165,49,0.14)]"
              : "w-full rounded-[28px] border border-[var(--line)] bg-white px-5 py-4 text-left shadow-[inset_0_1px_0_#fff]"
          }
        >
          <div className="grid gap-3 text-sm text-[var(--muted)]">
            <div className="flex items-center justify-between gap-4">
              <span>Amount</span>
              <span className="font-semibold text-[var(--ink)]">{snapshot.selectedAmountCrc} CRC</span>
            </div>
            {snapshot.payerAddress ? (
              <div className="flex items-center justify-between gap-4">
                <span>Payer</span>
                <span className="font-semibold text-[var(--ink)]">
                  {snapshot.payerDisplayName ?? "Unnamed Circles user"}
                </span>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {showMiniAppCta ? (
        <div className="w-full rounded-[28px] border border-[rgba(67,53,223,0.18)] bg-[linear-gradient(180deg,rgba(244,242,255,0.95),rgba(255,255,255,0.98))] px-5 py-5 text-left shadow-[0_16px_40px_rgba(67,53,223,0.08)]">
          <div className="space-y-3">
            <StatusBadge tone="accent">Built on Circles</StatusBadge>
            <div className="space-y-2 text-sm leading-6 text-[var(--ink)]">
              <p>You just used a mini-app.</p>
              <p>
                This merch shop runs entirely onchain, built on top of Circles in a few lines of code.
              </p>
              <p>
                If you&apos;re a developer or just curious about how this works, everything you need to build your own is here:
              </p>
            </div>
            <a
              href="https://github.com/aboutcircles/CirclesMiniapps"
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-[var(--accent)] bg-white px-4 text-sm font-semibold text-[var(--accent)] transition-transform duration-200 ease-out hover:-translate-y-0.5"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 20 20"
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.9"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M11.4 4.2a3.4 3.4 0 0 0 4.4 4.4l-4 4-2.3-2.3-4.8 4.8a1.1 1.1 0 0 1-1.6-1.6l4.8-4.8-2.3-2.3z" />
                <path d="m12.8 5.7 1.5 1.5" />
              </svg>
              <span>Starter kit</span>
            </a>
            <p className="text-sm leading-6 text-[var(--muted)]">
              Join the Circles Builders channel on Telegram to go further.
            </p>
          </div>
        </div>
      ) : null}

      <div className="space-y-1">
        <p className="text-3xl font-semibold text-[var(--ink)]">{snapshot.selectedAmountCrc} CRC</p>
        <p className="text-sm text-[var(--muted)]">
          {awaitingPayment ? countdown : snapshot.paymentDetectedAt ? `Paid at ${formatDateTime(snapshot.paymentDetectedAt)}` : countdown}
        </p>
      </div>

      {awaitingPayment ? (
        <>
          <a
            href={snapshot.qrPayload}
            target="_blank"
            rel="noreferrer"
            className="primary-button inline-flex min-h-12 w-full items-center justify-center rounded-full px-5 text-sm font-semibold shadow-[0_16px_36px_rgba(67,53,223,0.24)] transition-transform duration-200 ease-out hover:-translate-y-0.5"
          >
            Open In Gnosis App
          </a>

          <button
            type="button"
            disabled={cancelling}
            onClick={() => void handleCancel()}
            className="secondary-button inline-flex min-h-12 w-full items-center justify-center rounded-full px-5 text-sm font-semibold transition-transform duration-200 ease-out hover:-translate-y-0.5"
          >
            {cancelling ? "Cancelling..." : "Cancel and go to store"}
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={() => {
            router.push("/");
            router.refresh();
          }}
          className="primary-button inline-flex min-h-12 w-full items-center justify-center rounded-full px-5 text-sm font-semibold shadow-[0_16px_36px_rgba(67,53,223,0.24)] transition-transform duration-200 ease-out hover:-translate-y-0.5"
        >
          Back to store
        </button>
      )}
    </Panel>
  );
}
