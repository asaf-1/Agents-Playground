// One shop order, for staff: the order in full, and for an Admin the two
// actions -- move it to its next step, or refund it -- each confirmed first
// ("a more real back end", phase 3).

// React state, the router, Radix's dialog, and the data cache.
import { useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import * as Dialog from "@radix-ui/react-dialog";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
// The staff order calls, formats and step words.
import {
  advanceShopOrder,
  formatMoney,
  getStaffShopOrder,
  newIdempotencyKey,
  refundShopOrder,
  SHOP_STATUS_LABELS,
  type ShopOrder,
} from "../bankApi";
// The order view, the sign-in card and heading, who is signed in, the runKey.
import { ShopOrderView } from "../components/ShopOrderView";
import { SignInPrompt } from "../components/SignInPrompt";
import { PageHeader } from "../components/ui";
import { useRunKey } from "../useAppFlags";
import { useBankSession } from "../useBankSession";
import { bankPath } from "../useMoney";

// The action being confirmed, or none.
type Action = "advance" | "refund" | null;

// Why this person can't act on the order, shown instead of dead buttons; null
// when they can.
function blockedReason(order: ShopOrder, role: string, userId: string) {
  if (role !== "admin") return "Only an Admin can move or refund an order.";
  if (order.userId === userId) {
    return "This is your own order: another Admin has to handle it.";
  }
  if (order.status === "refunded") return "This order was refunded.";
  if (order.status === "delivered") {
    return "Delivered: nothing left to do, and it can't be refunded.";
  }
  return null;
}

export function StaffShopOrderPage() {
  // The order's id, who is signed in, the runKey, the cache, and the action
  // being confirmed.
  const { id = "" } = useParams();
  const { user, account, isLoading } = useBankSession();
  const settings = account?.settings;
  const staff = user?.role === "support" || user?.role === "admin";
  const runKey = useRunKey();
  const queryClient = useQueryClient();
  const [action, setAction] = useState<Action>(null);
  // One Idempotency-Key per refund attempt, so a double click refunds once.
  const refundKey = useRef(newIdempotencyKey());

  // The order.
  const key = ["bank", "shop", "staff-order", id];
  const { data, isPending, isError, error } = useQuery({
    queryKey: key,
    queryFn: () => getStaffShopOrder(id),
    enabled: Boolean(staff && id),
  });

  // Move it on, or refund it; either way refresh the order and the lists.
  const mutation = useMutation({
    mutationFn: (which: "advance" | "refund") => {
      const order = data!.order;
      return which === "advance"
        ? advanceShopOrder(order.id, order.nextStatus!, runKey)
        : refundShopOrder(order.id, refundKey.current, runKey);
    },
    onSuccess: async (result) => {
      queryClient.setQueryData(key, result);
      refundKey.current = newIdempotencyKey();
      await queryClient.invalidateQueries({
        queryKey: ["bank", "shop", "staff-orders"],
      });
      setAction(null);
    },
  });

  const order = data?.order;
  const reason =
    order && user ? blockedReason(order, user.role, user.id) : null;

  // The breadcrumb and heading, then access, the actions, and the order.
  return (
    <section data-testid="staff-shop-order-page" className="page">
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <Link
          to={bankPath("/admin/shop-orders", runKey)}
          data-testid="staff-shop-order-back"
        >
          Shop orders
        </Link>{" "}
        / <span className="mono">{order?.number ?? "Order"}</span>
      </nav>
      <PageHeader eyebrow="Back office" title="Shop order" />

      {/* Signed out, or a customer. */}
      {!isLoading && !user && (
        <SignInPrompt
          next={`/admin/shop-orders/${id}`}
          title="Log in as staff to see this"
        />
      )}
      {user && !staff && (
        <div className="card card-pad" data-testid="staff-shop-order-forbidden">
          <p className="account-title">You don't have access to this page.</p>
        </div>
      )}

      {/* Loading or an error. */}
      {staff && isPending && <p className="state">Loading the order…</p>}
      {isError && (
        <p role="alert" className="callout">
          {(error as Error).message}
        </p>
      )}

      {/* The actions, or why there are none, then the order. */}
      {order && user && (
        <>
          {reason ? (
            <p
              className="callout callout-info"
              data-testid="staff-shop-order-note"
            >
              {reason}
            </p>
          ) : (
            <div className="btn-row" data-testid="staff-shop-order-actions">
              {order.nextStatus && (
                <button
                  type="button"
                  className="btn btn-primary"
                  data-testid="staff-shop-order-advance"
                  onClick={() => setAction("advance")}
                >
                  Mark {SHOP_STATUS_LABELS[order.nextStatus].toLowerCase()}
                </button>
              )}
              <button
                type="button"
                className="btn"
                data-testid="staff-shop-order-refund"
                onClick={() => setAction("refund")}
              >
                Refund
              </button>
            </div>
          )}
          <ShopOrderView order={order} settings={settings} showCustomer />
        </>
      )}

      {/* The confirm dialog, while one is open. */}
      {order && action && (
        <Dialog.Root open onOpenChange={(open) => !open && setAction(null)}>
          <Dialog.Portal>
            <Dialog.Overlay className="dialog-overlay" />
            <Dialog.Content
              className="dialog-content"
              data-testid="staff-shop-order-dialog"
            >
              <Dialog.Title>
                {action === "advance"
                  ? `Mark ${order.number} ${SHOP_STATUS_LABELS[order.nextStatus!].toLowerCase()}?`
                  : `Refund ${formatMoney(order.totalCents, settings)} for ${order.number}?`}
              </Dialog.Title>
              <Dialog.Description>
                {action === "advance"
                  ? `${order.customer.fullName} gets a notification.`
                  : `The money goes back to ${order.accountNumber} and the items go back in stock.`}
              </Dialog.Description>
              {mutation.isError && (
                <p
                  role="alert"
                  className="callout"
                  data-testid="staff-shop-order-error"
                >
                  {(mutation.error as Error).message}
                </p>
              )}
              <div className="dialog-actions">
                <button
                  type="button"
                  className="btn btn-primary"
                  data-testid="staff-shop-order-confirm"
                  disabled={mutation.isPending}
                  onClick={() => mutation.mutate(action)}
                >
                  {mutation.isPending
                    ? "Saving…"
                    : action === "advance"
                      ? "Yes, move it on"
                      : "Yes, refund it"}
                </button>
                <Dialog.Close asChild>
                  <button type="button" data-testid="staff-shop-order-cancel">
                    Cancel
                  </button>
                </Dialog.Close>
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      )}
    </section>
  );
}
