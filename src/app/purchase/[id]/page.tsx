import { notFound } from "next/navigation";

import { PurchaseStatusClient } from "@/components/checkout/PurchaseStatusClient";
import { getMerchItemById } from "@/lib/merch-store";
import { MINIAPP_DOCS_URL } from "@/lib/site";
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

  const purchasedItem = await getMerchItemById(snapshot.merchItemId);

  return (
    <PurchaseStatusClient
      purchaseId={id}
      ticket={ticket}
      initialSnapshot={snapshot}
      purchasedItem={purchasedItem ? { image: purchasedItem.image, name: purchasedItem.name } : null}
      developerPageUrl={MINIAPP_DOCS_URL}
    />
  );
}
