// The cart on the top bar: how many items are in it, and a link to the Cart
// page ("a more real back end", phase 2).

// The data cache, the router's link, and the cart icon.
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ShoppingCart } from "lucide-react";
// The cart call, who is signed in, and links that keep the runKey.
import { getCart } from "../bankApi";
import { useRunKey } from "../useAppFlags";
import { useBankSession } from "../useBankSession";
import { bankPath } from "../useMoney";

// The cache key every cart change refreshes, so the count moves at once.
export const CART_KEY = ["bank", "shop", "cart"] as const;

// The signed-in customer's cart, shared by the button, the Cart page and the
// product page.
export function useCart(enabled: boolean) {
  return useQuery({
    queryKey: CART_KEY,
    queryFn: getCart,
    enabled,
  });
}

// The cart chip: nothing for a visitor who is not signed in, the item count
// once there is something in it.
export function CartButton() {
  // Who is signed in, their cart, and the runKey for the link.
  const { user } = useBankSession();
  const runKey = useRunKey();
  const cart = useCart(Boolean(user));
  if (!user) {
    return null;
  }
  const count = cart.data?.itemCount ?? 0;

  // The chip, with the count (99+ above 99).
  return (
    <Link
      to={bankPath("/shop/cart", runKey)}
      className="icon-chip"
      data-testid="cart-button"
      aria-label={count > 0 ? `Cart, ${count} items` : "Cart"}
    >
      <ShoppingCart aria-hidden="true" />
      {count > 0 && (
        <span className="notif-count" data-testid="cart-count">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}
