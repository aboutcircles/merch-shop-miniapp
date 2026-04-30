"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";

import type { AdminTransactionSnapshot, MerchItem, PurchaseSnapshot } from "@/types";
import { Button } from "@/components/ui/Button";
import { Panel } from "@/components/ui/Panel";
import { StatusBadge } from "@/components/status/StatusBadge";
import { cn, formatCrc, formatDateTime, shortenAddress } from "@/lib/utils";

type AdminTab = "purchases" | "products" | "transactions";
type TransactionKindFilter = "all" | "payment" | "refund";
type TransactionStatusFilter = "all" | "pending" | "confirmed" | "failed";

type AdminResponse = {
  purchases: PurchaseSnapshot[];
  page: number;
  pageSize: number;
  summary: {
    orgBalanceCircles: string | null;
    freeMerchGiven: number;
  };
  totalCount: number;
  error?: string;
};

type AdminMerchResponse = {
  items: MerchItem[];
  error?: string;
};

type ImageUploadResponse = {
  imageUrl?: string;
  error?: string;
};

type AdminTransactionsResponse = {
  transactions: AdminTransactionSnapshot[];
  page: number;
  pageSize: number;
  totalCount: number;
  error?: string;
};

type ProductDraft = {
  id: string;
  name: string;
  image: string;
  tag: string;
  stock: string;
  isActive: boolean;
  minPriceCrc: string;
  priceCrc: string;
  maxPriceCrc: string;
};

const pageSize = 20;
const maxImageBytes = 10 * 1024 * 1024;
const inputClass =
  "h-10 w-full rounded-[12px] border border-[var(--line)] bg-white px-3 text-sm text-[var(--ink)] outline-none transition focus:border-[var(--accent)]";
const checkboxClass = "h-4 w-4 accent-[var(--accent)]";

function toDraft(item: MerchItem): ProductDraft {
  return {
    id: item.id,
    name: item.name,
    image: item.image,
    tag: item.tag,
    stock: String(item.stock),
    isActive: item.isActive,
    minPriceCrc: item.minPriceCrc,
    priceCrc: item.priceCrc,
    maxPriceCrc: item.maxPriceCrc,
  };
}

function createEmptyProductDraft(): ProductDraft {
  return {
    id: "",
    name: "",
    image: "",
    tag: "Limited",
    stock: "0",
    isActive: false,
    minPriceCrc: "1",
    priceCrc: "1",
    maxPriceCrc: "5",
  };
}

function isCrcValue(value: string) {
  return /^\d+(\.\d{1,4})?$/.test(value);
}

function isImageReference(value: string) {
  if (value.startsWith("/") && !value.startsWith("//") && value.length > 1) {
    return true;
  }

  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function validateProductDraft(
  draft: ProductDraft,
) {
  if (!draft.name.trim()) {
    return "Name is required.";
  }

  if (!isImageReference(draft.image)) {
    return "Upload an image or use a local /path or https:// image URL.";
  }

  if (!draft.tag.trim()) {
    return "Tag is required.";
  }

  const stock = Number(draft.stock);
  const min = Number(draft.minPriceCrc);
  const price = Number(draft.priceCrc);
  const max = Number(draft.maxPriceCrc);

  if (!Number.isInteger(stock) || stock < 0) {
    return "Stock must be a whole number greater than or equal to 0.";
  }

  if (
    !isCrcValue(draft.minPriceCrc) ||
    !isCrcValue(draft.priceCrc) ||
    !isCrcValue(draft.maxPriceCrc) ||
    min <= 0 ||
    price <= 0 ||
    max <= 0
  ) {
    return "Prices must be positive CRC values with up to 4 decimals.";
  }

  if (min > price || price > max) {
    return "Expected min <= default <= max.";
  }

  return null;
}

function buildProductPayload(draft: ProductDraft) {
  return {
    ...(draft.id ? { id: draft.id } : {}),
    name: draft.name.trim(),
    image: draft.image.trim(),
    tag: draft.tag.trim(),
    stock: Number(draft.stock),
    isActive: draft.isActive,
    minPriceCrc: draft.minPriceCrc.trim(),
    priceCrc: draft.priceCrc.trim(),
    maxPriceCrc: draft.maxPriceCrc.trim(),
  };
}

type BadgeTone = "neutral" | "success" | "warn" | "error" | "accent";

function purchaseTone(purchase: PurchaseSnapshot): BadgeTone {
  if (purchase.payoutStatus === "refunded") {
    return "success";
  }

  if (purchase.paymentStatus === "cancelled" || purchase.paymentStatus === "expired") {
    return "warn";
  }

  if (purchase.paymentStatus === "failed") {
    return "error";
  }

  if (purchase.paymentStatus === "paid") {
    return "accent";
  }

  return "neutral";
}

function transactionTone(transaction: AdminTransactionSnapshot): BadgeTone {
  if (transaction.status === "confirmed") {
    return "success";
  }

  if (transaction.status === "failed") {
    return "error";
  }

  return "neutral";
}

function formatTxHash(txHash: string | null) {
  return txHash ? shortenAddress(txHash, 6) : "Pending";
}

export function AdminDashboard() {
  const [activeTab, setActiveTab] = useState<AdminTab>("purchases");
  const [purchases, setPurchases] = useState<PurchaseSnapshot[]>([]);
  const [purchaseSummary, setPurchaseSummary] = useState<AdminResponse["summary"]>({
    orgBalanceCircles: null,
    freeMerchGiven: 0,
  });
  const [purchasePage, setPurchasePage] = useState(1);
  const [purchaseTotalCount, setPurchaseTotalCount] = useState(0);
  const [purchasesLoading, setPurchasesLoading] = useState(true);
  const [purchasesError, setPurchasesError] = useState<string | null>(null);

  const [merchItems, setMerchItems] = useState<MerchItem[]>([]);
  const [productDrafts, setProductDrafts] = useState<Record<string, ProductDraft>>({});
  const [newProductDraft, setNewProductDraft] = useState<ProductDraft>(() => createEmptyProductDraft());
  const [productsLoaded, setProductsLoaded] = useState(false);
  const [productsLoading, setProductsLoading] = useState(false);
  const [productsError, setProductsError] = useState<string | null>(null);
  const [savingProductId, setSavingProductId] = useState<string | null>(null);
  const [uploadingImageFor, setUploadingImageFor] = useState<string | null>(null);
  const [deletingProductId, setDeletingProductId] = useState<string | null>(null);

  const [transactions, setTransactions] = useState<AdminTransactionSnapshot[]>([]);
  const [transactionPage, setTransactionPage] = useState(1);
  const [transactionTotalCount, setTransactionTotalCount] = useState(0);
  const [transactionKind, setTransactionKind] = useState<TransactionKindFilter>("all");
  const [transactionStatus, setTransactionStatus] = useState<TransactionStatusFilter>("all");
  const [transactionSearch, setTransactionSearch] = useState("");
  const [transactionsLoading, setTransactionsLoading] = useState(false);
  const [transactionsError, setTransactionsError] = useState<string | null>(null);

  const loadPurchases = useCallback(async (page: number) => {
    try {
      setPurchasesLoading(true);
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      });
      const response = await fetch(`/api/admin/purchases?${params.toString()}`, { cache: "no-store" });
      const data = (await response.json()) as AdminResponse;

      if (!response.ok) {
        throw new Error(data.error ?? "Unable to load purchases.");
      }

      setPurchases(data.purchases);
      setPurchaseSummary(data.summary);
      setPurchaseTotalCount(data.totalCount);
      setPurchasePage(data.page);
      setPurchasesError(null);
    } catch (loadError) {
      setPurchasesError(loadError instanceof Error ? loadError.message : "Unable to load purchases.");
    } finally {
      setPurchasesLoading(false);
    }
  }, []);

  const loadMerchItems = useCallback(async () => {
    try {
      setProductsLoading(true);
      const response = await fetch("/api/admin/merch", { cache: "no-store" });
      const data = (await response.json()) as AdminMerchResponse;

      if (!response.ok) {
        throw new Error(data.error ?? "Unable to load products.");
      }

      setMerchItems(data.items);
      setProductDrafts(Object.fromEntries(data.items.map((item) => [item.id, toDraft(item)])));
      setNewProductDraft((current) => (current.name || current.image ? current : createEmptyProductDraft()));
      setProductsLoaded(true);
      setProductsError(null);
    } catch (loadError) {
      setProductsError(loadError instanceof Error ? loadError.message : "Unable to load products.");
    } finally {
      setProductsLoading(false);
    }
  }, []);

  const loadTransactions = useCallback(async (page: number) => {
    try {
      setTransactionsLoading(true);
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
        kind: transactionKind,
        status: transactionStatus,
        ...(transactionSearch.trim() ? { search: transactionSearch.trim() } : {}),
      });
      const response = await fetch(`/api/admin/transactions?${params.toString()}`, { cache: "no-store" });
      const data = (await response.json()) as AdminTransactionsResponse;

      if (!response.ok) {
        throw new Error(data.error ?? "Unable to load transactions.");
      }

      setTransactions(data.transactions);
      setTransactionTotalCount(data.totalCount);
      setTransactionPage(data.page);
      setTransactionsError(null);
    } catch (loadError) {
      setTransactionsError(loadError instanceof Error ? loadError.message : "Unable to load transactions.");
    } finally {
      setTransactionsLoading(false);
    }
  }, [transactionKind, transactionSearch, transactionStatus]);

  useEffect(() => {
    if (activeTab !== "purchases") {
      return;
    }

    void loadPurchases(purchasePage);
    const interval = window.setInterval(() => {
      void loadPurchases(purchasePage);
    }, 8000);

    return () => window.clearInterval(interval);
  }, [activeTab, loadPurchases, purchasePage]);

  useEffect(() => {
    if (activeTab !== "products" || productsLoaded) {
      return;
    }

    void loadMerchItems();
  }, [activeTab, loadMerchItems, productsLoaded]);

  useEffect(() => {
    if (activeTab !== "transactions") {
      return;
    }

    void loadTransactions(transactionPage);
    const interval = window.setInterval(() => {
      void loadTransactions(transactionPage);
    }, 8000);

    return () => window.clearInterval(interval);
  }, [activeTab, loadTransactions, transactionPage]);

  useEffect(() => {
    setTransactionPage(1);
  }, [transactionKind, transactionSearch, transactionStatus]);

  async function refreshActiveTab() {
    if (activeTab === "purchases") {
      await loadPurchases(purchasePage);
      return;
    }

    if (activeTab === "products") {
      await loadMerchItems();
      return;
    }

    await loadTransactions(transactionPage);
  }

  function updateProductDraft(
    itemId: string,
    field: keyof ProductDraft,
    value: string | boolean,
  ) {
    setProductDrafts((current) => ({
      ...current,
      [itemId]: {
        ...current[itemId],
        [field]: value,
      },
    }));
  }

  function updateNewProductDraft(field: keyof ProductDraft, value: string | boolean) {
    setNewProductDraft((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function applyMerchResponse(items: MerchItem[]) {
    setMerchItems(items);
    setProductDrafts(Object.fromEntries(items.map((item) => [item.id, toDraft(item)])));
    setProductsLoaded(true);
  }

  async function uploadProductImage(file: File, saveId: string) {
    if (!file.type.startsWith("image/")) {
      setProductsError("Upload an image file.");
      return;
    }

    if (file.size > maxImageBytes) {
      setProductsError("Image must be 10MB or smaller.");
      return;
    }

    setUploadingImageFor(saveId);
    setProductsError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/admin/merch/image", {
        method: "POST",
        body: formData,
      });
      const data = (await response.json()) as ImageUploadResponse;

      if (!response.ok || !data.imageUrl) {
        throw new Error(data.error ?? "Unable to upload image.");
      }

      if (saveId === "new") {
        updateNewProductDraft("image", data.imageUrl);
      } else {
        updateProductDraft(saveId, "image", data.imageUrl);
      }
    } catch (uploadError) {
      setProductsError(uploadError instanceof Error ? uploadError.message : "Unable to upload image.");
    } finally {
      setUploadingImageFor(null);
    }
  }

  async function saveProduct(draft: ProductDraft, saveId: string) {
    const validationError = validateProductDraft(draft);

    if (validationError) {
      setProductsError(validationError);
      return;
    }

    setSavingProductId(saveId);
    setProductsError(null);

    try {
      const response = await fetch("/api/admin/merch", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(buildProductPayload(draft)),
      });
      const data = (await response.json()) as AdminMerchResponse;

      if (!response.ok) {
        throw new Error(data.error ?? "Unable to save product.");
      }

      applyMerchResponse(data.items);

      if (saveId === "new") {
        setNewProductDraft(createEmptyProductDraft());
      }
    } catch (actionError) {
      setProductsError(actionError instanceof Error ? actionError.message : "Unable to save product.");
    } finally {
      setSavingProductId(null);
    }
  }

  async function deleteProduct(item: MerchItem) {
    const confirmed = window.confirm(`Delete "${item.name}" from the storefront and database?`);

    if (!confirmed) {
      return;
    }

    setDeletingProductId(item.id);
    setProductsError(null);

    try {
      const response = await fetch("/api/admin/merch", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: item.id,
        }),
      });
      const data = (await response.json()) as AdminMerchResponse;

      if (!response.ok) {
        throw new Error(data.error ?? "Unable to delete product.");
      }

      applyMerchResponse(data.items);
    } catch (deleteError) {
      setProductsError(deleteError instanceof Error ? deleteError.message : "Unable to delete product.");
    } finally {
      setDeletingProductId(null);
    }
  }

  const purchaseTotalPages = Math.max(1, Math.ceil(purchaseTotalCount / pageSize));
  const safePurchasePage = Math.min(purchasePage, purchaseTotalPages);
  const transactionTotalPages = Math.max(1, Math.ceil(transactionTotalCount / pageSize));
  const safeTransactionPage = Math.min(transactionPage, transactionTotalPages);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--accent)]">Admin</p>
          <h1 className="mt-1 text-3xl font-semibold text-[var(--ink)]">Operations console</h1>
        </div>
        <Button
          variant="secondary"
          disabled={purchasesLoading || productsLoading || transactionsLoading}
          onClick={() => void refreshActiveTab()}
        >
          Refresh
        </Button>
      </div>

      <div className="flex flex-wrap gap-2 rounded-[18px] border border-[var(--line)] bg-white/70 p-2 shadow-[0_8px_24px_rgba(5,6,26,0.05)]">
        {[
          { id: "purchases", label: "Purchases" },
          { id: "products", label: "Products" },
          { id: "transactions", label: "Transactions" },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={cn(
              "min-h-11 rounded-full px-5 text-sm font-semibold transition",
              activeTab === tab.id
                ? "primary-button shadow-[0_12px_28px_rgba(67,53,223,0.18)]"
                : "text-[var(--muted)] hover:bg-white",
            )}
            onClick={() => setActiveTab(tab.id as AdminTab)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "purchases" ? (
        <PurchasesTab
          purchases={purchases}
          summary={purchaseSummary}
          loading={purchasesLoading}
          error={purchasesError}
          page={safePurchasePage}
          totalPages={purchaseTotalPages}
          totalCount={purchaseTotalCount}
          setPage={setPurchasePage}
        />
      ) : null}

      {activeTab === "products" ? (
        <ProductsTab
          items={merchItems}
          drafts={productDrafts}
          newDraft={newProductDraft}
          loading={productsLoading}
          error={productsError}
          savingProductId={savingProductId}
          uploadingImageFor={uploadingImageFor}
          deletingProductId={deletingProductId}
          onUpdateDraft={updateProductDraft}
          onUpdateNewDraft={updateNewProductDraft}
          onUploadImage={(file, saveId) => void uploadProductImage(file, saveId)}
          onResetDraft={(item) => {
            setProductDrafts((current) => ({
              ...current,
              [item.id]: toDraft(item),
            }));
          }}
          onSave={(draft) => void saveProduct(draft, draft.id)}
          onCreate={() => void saveProduct(newProductDraft, "new")}
          onDelete={(item) => void deleteProduct(item)}
          onResetNew={() => setNewProductDraft(createEmptyProductDraft())}
        />
      ) : null}

      {activeTab === "transactions" ? (
        <TransactionsTab
          transactions={transactions}
          loading={transactionsLoading}
          error={transactionsError}
          page={safeTransactionPage}
          totalPages={transactionTotalPages}
          totalCount={transactionTotalCount}
          kind={transactionKind}
          status={transactionStatus}
          search={transactionSearch}
          setPage={setTransactionPage}
          setKind={setTransactionKind}
          setStatus={setTransactionStatus}
          setSearch={setTransactionSearch}
        />
      ) : null}
    </div>
  );
}

function PurchasesTab({
  purchases,
  summary,
  loading,
  error,
  page,
  totalPages,
  totalCount,
  setPage,
}: {
  purchases: PurchaseSnapshot[];
  summary: AdminResponse["summary"];
  loading: boolean;
  error: string | null;
  page: number;
  totalPages: number;
  totalCount: number;
  setPage: (value: number | ((current: number) => number)) => void;
}) {
  return (
    <div className="space-y-4">
      {error ? <ErrorBanner>{error}</ErrorBanner> : null}

      <div className="grid gap-4 md:grid-cols-2">
        <Panel className="space-y-2 p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--accent)]">Org balance</p>
          <p className="text-3xl font-semibold text-[var(--ink)]">
            {summary.orgBalanceCircles ? `${formatCrc(summary.orgBalanceCircles, 2)} Circles` : "Unavailable"}
          </p>
        </Panel>
        <Panel className="space-y-2 p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--accent)]">Free merch given</p>
          <p className="text-3xl font-semibold text-[var(--ink)]">{summary.freeMerchGiven}</p>
        </Panel>
      </div>

      {loading && purchases.length === 0 ? (
        <Panel className="p-8 text-sm text-[var(--muted)]">Loading purchase stream...</Panel>
      ) : null}

      {!loading && purchases.length === 0 ? (
        <Panel className="p-8 text-sm text-[var(--muted)]">
          No purchases have been created since this app instance started.
        </Panel>
      ) : null}

      {purchases.length ? (
        <Panel className="overflow-hidden p-0">
          <div className="flex items-center justify-between gap-3 border-b border-[var(--line)] px-5 py-4">
            <div>
              <h2 className="text-lg font-semibold text-[var(--ink)]">Purchase ledger</h2>
              <p className="mt-1 text-sm text-[var(--muted)]">Live checkout and payout status.</p>
            </div>
            <p className="text-sm text-[var(--muted)]">
              Page {page} of {totalPages}
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-left">
              <thead className="bg-[rgba(250,245,241,0.92)]">
                <tr className="border-b border-[var(--line)]">
                  <TableHeader>Reference</TableHeader>
                  <TableHeader>Item</TableHeader>
                  <TableHeader>Amount</TableHeader>
                  <TableHeader>Status</TableHeader>
                  <TableHeader>Outcome</TableHeader>
                  <TableHeader>Payer</TableHeader>
                  <TableHeader>Created</TableHeader>
                  <TableHeader>Payment tx</TableHeader>
                  <TableHeader>Refund</TableHeader>
                </tr>
              </thead>
              <tbody>
                {purchases.map((purchase) => (
                  <tr key={purchase.purchaseId} className="border-b border-[var(--line)] align-top last:border-b-0">
                    <TableCell className="text-xs text-[var(--ink)]">{purchase.reference}</TableCell>
                    <TableCell className="text-sm font-medium text-[var(--ink)]">{purchase.merchName}</TableCell>
                    <TableCell className="text-sm text-[var(--ink)]">{purchase.expectedAmountCrc} CRC</TableCell>
                    <TableCell>
                      <StatusBadge tone={purchaseTone(purchase)}>{purchase.paymentStatus}</StatusBadge>
                    </TableCell>
                    <TableCell className="text-sm text-[var(--muted)]">{purchase.outcomeStatus}</TableCell>
                    <TableCell className="text-sm font-medium text-[var(--ink)]">
                      {purchase.payerAddress ? purchase.payerDisplayName ?? "Unnamed Circles user" : "Pending"}
                    </TableCell>
                    <TableCell className="text-sm text-[var(--muted)]">{formatDateTime(purchase.createdAt)}</TableCell>
                    <TableCell className="text-xs text-[var(--muted)]">{formatTxHash(purchase.paymentTxHash)}</TableCell>
                    <TableCell className="text-sm text-[var(--muted)]">{purchase.payoutStatus}</TableCell>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            page={page}
            totalPages={totalPages}
            totalCount={totalCount}
            setPage={setPage}
          />
        </Panel>
      ) : null}
    </div>
  );
}

function ProductsTab({
  items,
  drafts,
  newDraft,
  loading,
  error,
  savingProductId,
  uploadingImageFor,
  deletingProductId,
  onUpdateDraft,
  onUpdateNewDraft,
  onUploadImage,
  onResetDraft,
  onSave,
  onCreate,
  onDelete,
  onResetNew,
}: {
  items: MerchItem[];
  drafts: Record<string, ProductDraft>;
  newDraft: ProductDraft;
  loading: boolean;
  error: string | null;
  savingProductId: string | null;
  uploadingImageFor: string | null;
  deletingProductId: string | null;
  onUpdateDraft: (itemId: string, field: keyof ProductDraft, value: string | boolean) => void;
  onUpdateNewDraft: (field: keyof ProductDraft, value: string | boolean) => void;
  onUploadImage: (file: File, saveId: string) => void;
  onResetDraft: (item: MerchItem) => void;
  onSave: (draft: ProductDraft) => void;
  onCreate: () => void;
  onDelete: (item: MerchItem) => void;
  onResetNew: () => void;
}) {
  const newDraftError = validateProductDraft(newDraft);

  return (
    <div className="space-y-4">
      {error ? <ErrorBanner>{error}</ErrorBanner> : null}

      <Panel className="space-y-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-[var(--ink)]">New product</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">Create products without deploying a catalog change.</p>
          </div>
          <StatusBadge tone={newDraft.isActive ? "accent" : "neutral"}>
            {newDraft.isActive ? "Active" : "Draft"}
          </StatusBadge>
        </div>
        <ProductFields
          draft={newDraft}
          saveId="new"
          uploadingImageFor={uploadingImageFor}
          onChange={onUpdateNewDraft}
          onUploadImage={onUploadImage}
        />
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={onResetNew} disabled={savingProductId === "new"}>
            Reset
          </Button>
          <Button onClick={onCreate} disabled={Boolean(newDraftError) || savingProductId === "new"}>
            {savingProductId === "new" ? "Creating..." : "Create product"}
          </Button>
        </div>
      </Panel>

      {loading && items.length === 0 ? (
        <Panel className="p-8 text-sm text-[var(--muted)]">Loading product catalog...</Panel>
      ) : null}

      {!loading && items.length === 0 ? (
        <Panel className="p-8 text-sm text-[var(--muted)]">No products found.</Panel>
      ) : null}

      {items.length ? (
        <Panel className="overflow-hidden p-0">
          <div className="flex items-center justify-between gap-3 border-b border-[var(--line)] px-5 py-4">
            <div>
              <h2 className="text-lg font-semibold text-[var(--ink)]">Products</h2>
              <p className="mt-1 text-sm text-[var(--muted)]">Edit catalog metadata and CRC price ranges together.</p>
            </div>
            <p className="text-sm text-[var(--muted)]">{items.length} total</p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-left">
              <thead className="bg-[rgba(250,245,241,0.92)]">
                <tr className="border-b border-[var(--line)]">
                  <TableHeader>Product</TableHeader>
                  <TableHeader>Availability</TableHeader>
                  <TableHeader>Price range</TableHeader>
                  <TableHeader>Actions</TableHeader>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const draft = drafts[item.id] ?? toDraft(item);
                  const original = toDraft(item);
                  const dirty = JSON.stringify(draft) !== JSON.stringify(original);
                  const validationError = validateProductDraft(draft);
                  const busy = savingProductId === item.id || deletingProductId === item.id;

                  return (
                    <tr key={item.id} className="border-b border-[var(--line)] align-top last:border-b-0">
                      <TableCell className="min-w-[28rem]">
                        <div className="grid gap-4 md:grid-cols-[5.5rem_minmax(0,1fr)]">
                          <ProductPreview draft={draft} />
                          <div className="grid gap-3 sm:grid-cols-2">
                            <Field label="Name">
                              <input
                                className={inputClass}
                                value={draft.name}
                                onChange={(event) => onUpdateDraft(item.id, "name", event.target.value)}
                              />
                            </Field>
                            <ImageUploadControl
                              saveId={item.id}
                              uploadingImageFor={uploadingImageFor}
                              onUploadImage={onUploadImage}
                            />
                            <Field label="Tag">
                              <input
                                className={inputClass}
                                value={draft.tag}
                                onChange={(event) => onUpdateDraft(item.id, "tag", event.target.value)}
                              />
                            </Field>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="min-w-[14rem]">
                        <div className="grid gap-3">
                          <label className="inline-flex items-center gap-2 text-sm font-medium text-[var(--ink)]">
                            <input
                              type="checkbox"
                              className={checkboxClass}
                              checked={draft.isActive}
                              disabled={busy}
                              onChange={(event) => {
                                const nextDraft = {
                                  ...draft,
                                  isActive: event.target.checked,
                                };

                                onUpdateDraft(item.id, "isActive", nextDraft.isActive);
                                onSave(nextDraft);
                              }}
                            />
                            Active
                          </label>
                          <Field label="Stock">
                            <input
                              type="number"
                              min="0"
                              step="1"
                              className={inputClass}
                              value={draft.stock}
                              onChange={(event) => onUpdateDraft(item.id, "stock", event.target.value)}
                            />
                          </Field>
                        </div>
                      </TableCell>
                      <TableCell className="min-w-[16rem]">
                        <div className="grid gap-3 sm:grid-cols-3">
                          <Field label="Min">
                            <input
                              type="number"
                              min="0.01"
                              step="0.1"
                              className={inputClass}
                              value={draft.minPriceCrc}
                              onChange={(event) => onUpdateDraft(item.id, "minPriceCrc", event.target.value)}
                            />
                          </Field>
                          <Field label="Default">
                            <input
                              type="number"
                              min="0.01"
                              step="0.1"
                              className={inputClass}
                              value={draft.priceCrc}
                              onChange={(event) => onUpdateDraft(item.id, "priceCrc", event.target.value)}
                            />
                          </Field>
                          <Field label="Max">
                            <input
                              type="number"
                              min="0.01"
                              step="0.1"
                              className={inputClass}
                              value={draft.maxPriceCrc}
                              onChange={(event) => onUpdateDraft(item.id, "maxPriceCrc", event.target.value)}
                            />
                          </Field>
                        </div>
                      </TableCell>
                      <TableCell className="min-w-[11rem]">
                        <div className="flex flex-col gap-2">
                          <Button
                            variant="secondary"
                            className="min-h-10 px-4"
                            disabled={!dirty || busy}
                            onClick={() => onResetDraft(item)}
                          >
                            Reset
                          </Button>
                          <Button
                            className="min-h-10 px-4"
                            disabled={!dirty || Boolean(validationError) || busy}
                            onClick={() => onSave(draft)}
                          >
                            {savingProductId === item.id ? "Saving..." : "Save"}
                          </Button>
                          <Button
                            variant="secondary"
                            className="min-h-10 border-red-700 bg-red-700 px-4 text-white shadow-none hover:bg-red-800"
                            disabled={busy}
                            onClick={() => onDelete(item)}
                          >
                            {deletingProductId === item.id ? "Deleting..." : "Delete"}
                          </Button>
                        </div>
                      </TableCell>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>
      ) : null}
    </div>
  );
}

function ProductFields({
  draft,
  saveId,
  uploadingImageFor,
  onChange,
  onUploadImage,
}: {
  draft: ProductDraft;
  saveId: string;
  uploadingImageFor: string | null;
  onChange: (field: keyof ProductDraft, value: string | boolean) => void;
  onUploadImage: (file: File, saveId: string) => void;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-[5.5rem_minmax(0,1fr)]">
      <ProductPreview draft={draft} />
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Field label="Name">
          <input className={inputClass} value={draft.name} onChange={(event) => onChange("name", event.target.value)} />
        </Field>
        <ImageUploadControl
          saveId={saveId}
          uploadingImageFor={uploadingImageFor}
          onUploadImage={onUploadImage}
        />
        <Field label="Tag">
          <input className={inputClass} value={draft.tag} onChange={(event) => onChange("tag", event.target.value)} />
        </Field>
        <Field label="Stock">
          <input
            type="number"
            min="0"
            step="1"
            className={inputClass}
            value={draft.stock}
            onChange={(event) => onChange("stock", event.target.value)}
          />
        </Field>
        <Field label="Min CRC">
          <input
            type="number"
            min="0.01"
            step="0.1"
            className={inputClass}
            value={draft.minPriceCrc}
            onChange={(event) => onChange("minPriceCrc", event.target.value)}
          />
        </Field>
        <Field label="Default CRC">
          <input
            type="number"
            min="0.01"
            step="0.1"
            className={inputClass}
            value={draft.priceCrc}
            onChange={(event) => onChange("priceCrc", event.target.value)}
          />
        </Field>
        <Field label="Max CRC">
          <input
            type="number"
            min="0.01"
            step="0.1"
            className={inputClass}
            value={draft.maxPriceCrc}
            onChange={(event) => onChange("maxPriceCrc", event.target.value)}
          />
        </Field>
        <label className="flex items-end gap-2 pb-2 text-sm font-medium text-[var(--ink)]">
          <input
            type="checkbox"
            className={checkboxClass}
            checked={draft.isActive}
            onChange={(event) => onChange("isActive", event.target.checked)}
          />
          Active
        </label>
      </div>
    </div>
  );
}

function ProductPreview({ draft }: { draft: ProductDraft }) {
  return (
    <div className="flex h-[5.5rem] w-[5.5rem] items-center justify-center overflow-hidden rounded-[16px] border border-[var(--line)] bg-[var(--line-soft)]">
      {isImageReference(draft.image) ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={draft.image} alt="" className="h-full w-full object-contain p-2" />
      ) : (
        <span className="px-2 text-center text-xs text-[var(--muted)]">No image</span>
      )}
    </div>
  );
}

function ImageUploadControl({
  saveId,
  uploadingImageFor,
  onUploadImage,
}: {
  saveId: string;
  uploadingImageFor: string | null;
  onUploadImage: (file: File, saveId: string) => void;
}) {
  const uploading = uploadingImageFor === saveId;

  return (
    <Field label="Upload image">
      <label
        className={cn(
          "inline-flex h-10 w-full cursor-pointer items-center justify-center rounded-[12px] border border-[var(--line)] bg-white px-3 text-sm font-semibold text-[var(--ink)] transition hover:bg-white/90",
          uploading && "cursor-wait opacity-60",
        )}
      >
        <input
          type="file"
          accept="image/avif,image/gif,image/jpeg,image/png,image/webp"
          className="sr-only"
          disabled={uploading}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";

            if (file) {
              onUploadImage(file, saveId);
            }
          }}
        />
        {uploading ? "Uploading..." : "Choose file"}
      </label>
      <span className="block text-xs leading-5 text-[var(--muted)]">Max 10MB.</span>
    </Field>
  );
}

function TransactionsTab({
  transactions,
  loading,
  error,
  page,
  totalPages,
  totalCount,
  kind,
  status,
  search,
  setPage,
  setKind,
  setStatus,
  setSearch,
}: {
  transactions: AdminTransactionSnapshot[];
  loading: boolean;
  error: string | null;
  page: number;
  totalPages: number;
  totalCount: number;
  kind: TransactionKindFilter;
  status: TransactionStatusFilter;
  search: string;
  setPage: (value: number | ((current: number) => number)) => void;
  setKind: (value: TransactionKindFilter) => void;
  setStatus: (value: TransactionStatusFilter) => void;
  setSearch: (value: string) => void;
}) {
  return (
    <div className="space-y-4">
      {error ? <ErrorBanner>{error}</ErrorBanner> : null}

      <Panel className="space-y-4 p-5">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Kind">
            <select
              className={inputClass}
              value={kind}
              onChange={(event) => setKind(event.target.value as TransactionKindFilter)}
            >
              <option value="all">All</option>
              <option value="payment">Payments</option>
              <option value="refund">Refunds</option>
            </select>
          </Field>
          <Field label="Status">
            <select
              className={inputClass}
              value={status}
              onChange={(event) => setStatus(event.target.value as TransactionStatusFilter)}
            >
              <option value="all">All</option>
              <option value="pending">Pending</option>
              <option value="confirmed">Confirmed</option>
              <option value="failed">Failed</option>
            </select>
          </Field>
          <div className="min-w-[18rem] flex-1">
            <Field label="Search">
              <input
                className={inputClass}
                value={search}
                placeholder="Reference, tx hash, payer, item"
                onChange={(event) => setSearch(event.target.value)}
              />
            </Field>
          </div>
        </div>
      </Panel>

      {loading && transactions.length === 0 ? (
        <Panel className="p-8 text-sm text-[var(--muted)]">Loading transactions...</Panel>
      ) : null}

      {!loading && transactions.length === 0 ? (
        <Panel className="p-8 text-sm text-[var(--muted)]">No transactions match these filters.</Panel>
      ) : null}

      {transactions.length ? (
        <Panel className="overflow-hidden p-0">
          <div className="flex items-center justify-between gap-3 border-b border-[var(--line)] px-5 py-4">
            <div>
              <h2 className="text-lg font-semibold text-[var(--ink)]">Transactions</h2>
              <p className="mt-1 text-sm text-[var(--muted)]">Payment and refund rows linked to purchases.</p>
            </div>
            <p className="text-sm text-[var(--muted)]">
              Page {page} of {totalPages}
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-left">
              <thead className="bg-[rgba(250,245,241,0.92)]">
                <tr className="border-b border-[var(--line)]">
                  <TableHeader>Reference</TableHeader>
                  <TableHeader>Kind</TableHeader>
                  <TableHeader>Status</TableHeader>
                  <TableHeader>Item</TableHeader>
                  <TableHeader>Amount</TableHeader>
                  <TableHeader>Actor</TableHeader>
                  <TableHeader>Detected</TableHeader>
                  <TableHeader>Tx hash</TableHeader>
                </tr>
              </thead>
              <tbody>
                {transactions.map((transaction) => (
                  <tr key={transaction.id} className="border-b border-[var(--line)] align-top last:border-b-0">
                    <TableCell className="text-xs font-medium text-[var(--ink)]">{transaction.reference}</TableCell>
                    <TableCell>
                      <StatusBadge tone={transaction.kind === "refund" ? "accent" : "neutral"}>
                        {transaction.kind}
                      </StatusBadge>
                    </TableCell>
                    <TableCell>
                      <StatusBadge tone={transactionTone(transaction)}>{transaction.status}</StatusBadge>
                    </TableCell>
                    <TableCell className="text-sm font-medium text-[var(--ink)]">{transaction.merchName}</TableCell>
                    <TableCell className="text-sm text-[var(--ink)]">{formatCrc(transaction.amountCrc, 4)} CRC</TableCell>
                    <TableCell className="text-sm text-[var(--muted)]">
                      {transaction.actorAddress
                        ? transaction.actorDisplayName ?? shortenAddress(transaction.actorAddress)
                        : "Pending"}
                    </TableCell>
                    <TableCell className="text-sm text-[var(--muted)]">
                      {formatDateTime(transaction.detectedAt ?? transaction.createdAt)}
                    </TableCell>
                    <TableCell className="text-xs text-[var(--muted)]">{formatTxHash(transaction.txHash)}</TableCell>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            page={page}
            totalPages={totalPages}
            totalCount={totalCount}
            setPage={setPage}
          />
        </Panel>
      ) : null}
    </div>
  );
}

function Pagination({
  page,
  totalPages,
  totalCount,
  setPage,
}: {
  page: number;
  totalPages: number;
  totalCount: number;
  setPage: (value: number | ((current: number) => number)) => void;
}) {
  if (totalCount <= pageSize) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--line)] px-5 py-4">
      <p className="text-sm text-[var(--muted)]">
        Showing {(page - 1) * pageSize + 1}-{Math.min(page * pageSize, totalCount)} of {totalCount}
      </p>
      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          disabled={page === 1}
          onClick={() => setPage((current) => Math.max(1, current - 1))}
        >
          Previous
        </Button>
        <Button
          variant="secondary"
          disabled={page === totalPages}
          onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
        >
          More
        </Button>
      </div>
    </div>
  );
}

function ErrorBanner({ children }: { children: string }) {
  return (
    <div className="rounded-[20px] bg-[var(--error-bg)] px-4 py-3 text-sm text-[var(--error-ink)]">
      {children}
    </div>
  );
}

function TableHeader({ children }: { children: string }) {
  return (
    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
      {children}
    </th>
  );
}

function TableCell({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <td className={cn("px-4 py-4", className)}>{children}</td>;
}

function Field({
  children,
  label,
  required = true,
}: {
  children: ReactNode;
  label: string;
  required?: boolean;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
        {label}
        {required ? <span className="ml-0.5 text-[var(--orange-600)]">*</span> : null}
      </span>
      {children}
    </label>
  );
}
