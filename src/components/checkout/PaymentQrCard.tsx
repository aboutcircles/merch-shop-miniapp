"use client";

import Image from "next/image";
import Link from "next/link";
import QRCode from "react-qr-code";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { merchCatalog } from "@/data/merch";
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
  developerPageUrl,
}: {
  snapshot: PurchaseSnapshot;
  pending: boolean;
  developerPageUrl: string;
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
  const displayMessage = awaitingPayment ? null : snapshot.statusMessage;
  const purchasedItem = merchCatalog.find((item) => item.id === snapshot.merchItemId) ?? null;

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

  const detailsRows = (
    <div className="grid gap-3 text-sm text-[var(--muted)]">
      <div className="flex items-center justify-between gap-4">
        <span>Amount</span>
        <span className="font-semibold text-[var(--ink)]">{snapshot.selectedAmountCrc} CRC</span>
      </div>
      {snapshot.payerAddress ? (
        <div className="flex items-center justify-between gap-4">
          <span>Payer</span>
          <span className="font-semibold text-[var(--ink)]">{snapshot.payerDisplayName ?? "Unnamed Circles user"}</span>
        </div>
      ) : null}
    </div>
  );

  const awaitingStatusSection = (
    <div className="flex flex-col items-center gap-3">
      <StatusBadge tone={statusTone}>{statusLabel}</StatusBadge>
      {displayMessage ? <p className="max-w-md text-sm text-[var(--muted)]">{displayMessage}</p> : null}
      <p className="text-xs uppercase tracking-[0.14em] text-[var(--muted)]">
        {pending ? "Checking for payment..." : "Watching for on-chain payment..."}
      </p>
    </div>
  );

  const purchasedItemCard = purchasedItem ? (
    <div className="rounded-[30px] border border-[var(--line)] bg-[radial-gradient(circle_at_top,rgba(234,232,255,0.9),rgba(255,255,255,0.98)_52%,rgba(250,245,241,0.92))] p-5 text-center shadow-[inset_0_1px_0_#fff] xl:min-h-[36rem]">
      <div className="flex h-full flex-col">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent)]">Purchased item</p>
        <div className="relative mx-auto mt-4 h-[17rem] w-full max-w-[18rem] overflow-hidden rounded-[24px]">
          <Image
            src={purchasedItem.image}
            alt={purchasedItem.name}
            fill
            className="object-contain p-3"
            sizes="(max-width: 1279px) 100vw, 18rem"
          />
        </div>
        <p className="mt-4 text-lg font-semibold text-[var(--ink)]">{purchasedItem.name}</p>
      </div>
    </div>
  ) : null;

  const developerCard = paymentComplete ? (
    <div className="rounded-[30px] border border-[rgba(67,53,223,0.18)] bg-[linear-gradient(180deg,rgba(244,242,255,0.95),rgba(255,255,255,0.98))] px-5 py-5 text-center shadow-[0_16px_40px_rgba(67,53,223,0.08)] xl:min-h-[36rem]">
      <div className="flex h-full flex-col justify-between gap-5">
        <div className="space-y-3">
          <div className="flex justify-center">
            <StatusBadge tone="accent">Built on Circles</StatusBadge>
          </div>
          <div className="space-y-2">
            <p className="text-xl font-semibold text-[var(--ink)]">This merch booth is a Circles mini app.</p>
            <p className="text-sm leading-6 text-[var(--muted)]">
              Learn how mini apps work, how to submit one, and where to find live examples.
            </p>
          </div>
          <Link
            href={developerPageUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-11 w-full items-center justify-center rounded-full border border-[var(--accent)] bg-white px-4 text-sm font-semibold text-[var(--accent)] transition-transform duration-200 ease-out hover:-translate-y-0.5"
          >
            Learn more about miniapps
          </Link>
        </div>

        <div className="rounded-[24px] border border-[rgba(67,53,223,0.12)] bg-white p-4 shadow-[inset_0_1px_0_#fff]">
          <div className="mx-auto w-fit rounded-[18px] bg-white p-2">
            <QRCode size={152} value={developerPageUrl} />
          </div>
          <p className="mt-3 text-center text-xs font-medium uppercase tracking-[0.12em] text-[var(--muted)]">
            Scan to open the developer page
          </p>
        </div>
      </div>
    </div>
  ) : null;

  const completedSummaryCard = paymentComplete ? (
    <div
      className={`rounded-[30px] border p-6 text-center shadow-[inset_0_1px_0_#fff] ${refundEligible
          ? "border-[rgba(240,165,49,0.34)] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(255,248,235,0.98))] shadow-[0_18px_40px_rgba(240,165,49,0.14)]"
          : "border-[var(--line)] bg-white/96"
        }`}
    >
      <div className="space-y-4">
        <div className="flex justify-center">
          <StatusBadge tone={refundEligible ? "accent" : "success"}>
            {refundEligible ? "Winner" : "Paid"}
          </StatusBadge>
        </div>
        <div className="flex justify-center">
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
        </div>
        <div className="space-y-3">
          <h3 className="text-4xl font-semibold tracking-tight text-[var(--ink)]">
            {refundEligible ? "Congratulations, you won this merch for free!" : "Payment Successful"}
          </h3>
          <p className="mx-auto max-w-lg text-lg leading-8 text-[var(--ink)]">
            {refundEligible
              ? "The payment you made will be automatically refunded."
              : "You did not receive this merch for free. Better luck on the next one!"}
          </p>
        </div>
      </div>

      <div className="mt-6 rounded-[24px] border border-[var(--line)] bg-white/92 px-5 py-4 text-left">
        {detailsRows}
      </div>

      <div className="mt-6 space-y-1">
        <p className="text-4xl font-semibold text-[var(--ink)]">{snapshot.selectedAmountCrc} CRC</p>
        <p className="text-sm text-[var(--muted)]">
          {snapshot.paymentDetectedAt ? `Paid at ${formatDateTime(snapshot.paymentDetectedAt)}` : countdown}
        </p>
      </div>

      <button
        type="button"
        onClick={() => {
          router.push("/");
          router.refresh();
        }}
        className="primary-button mt-6 inline-flex min-h-12 w-full items-center justify-center rounded-full px-5 text-sm font-semibold shadow-[0_16px_36px_rgba(67,53,223,0.24)] transition-transform duration-200 ease-out hover:-translate-y-0.5"
      >
        Back to store
      </button>
    </div>
  ) : null;

  return (
    <Panel
      className={`mx-auto flex w-full flex-col gap-6 p-5 text-center md:p-7 ${paymentComplete ? "max-w-6xl" : "max-w-[32rem] items-center"
        }`}
    >
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--accent)]">
          {snapshot.reference}
        </p>
        <h2 className="mt-2 text-3xl font-semibold text-[var(--ink)]">{snapshot.merchName}</h2>
      </div>

      {paymentComplete ? (
        <div className="grid w-full gap-6 xl:grid-cols-[0.95fr_1.4fr_0.95fr] xl:items-start">
          <div>{purchasedItemCard}</div>
          <div>{completedSummaryCard}</div>
          <div>{developerCard}</div>
        </div>
      ) : (
        <>
          {awaitingStatusSection}

          {awaitingPayment ? (
            <div className="w-full rounded-[28px] border border-[var(--line)] bg-white p-4 shadow-[inset_0_1px_0_#fff]">
              <div className="rounded-[22px] border border-[rgba(240,165,49,0.28)] bg-[rgba(255,248,235,0.92)] px-4 py-3 text-left">
                <p className="text-sm font-semibold text-[var(--ink)]">Do not scan this QR from inside Gnosis App.</p>
                <p className="mt-1 text-sm leading-6 text-[var(--muted)]">
                  Scan it with your phone camera or from a second device, then complete the payment in Gnosis App
                  after it opens.
                </p>
              </div>

              <div className="mx-auto mt-4 flex max-w-[340px] justify-center rounded-[24px] bg-white p-4 md:p-6">
                <QRCode size={280} value={snapshot.qrPayload} />
              </div>
            </div>
          ) : (
            <div className="w-full rounded-[28px] border border-[var(--line)] bg-white px-5 py-4 text-left shadow-[inset_0_1px_0_#fff]">
              {detailsRows}
            </div>
          )}

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
        </>
      )}
    </Panel>
  );
}
