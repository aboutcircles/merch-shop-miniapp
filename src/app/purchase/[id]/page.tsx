import { notFound } from "next/navigation";

import { PurchaseStatusClient } from "@/components/checkout/PurchaseStatusClient";
import { getPurchaseSnapshot } from "@/server/services/payment-service";

type PurchasePageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ticket?: string }>;
};

export default async function PurchasePage({ params, searchParams }: PurchasePageProps) {
  const [{ id }, { ticket }] = await Promise.all([params, searchParams]);

  if (!ticket) {
    notFound();
  }

  const snapshot = await getPurchaseSnapshot(ticket);

  if (snapshot.purchaseId !== id) {
    notFound();
  }

  return <PurchaseStatusClient purchaseId={id} ticket={ticket} initialSnapshot={snapshot} />;
}
