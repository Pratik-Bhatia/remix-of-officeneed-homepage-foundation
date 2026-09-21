import { Link } from "@tanstack/react-router";
import { Package, Bookmark, User, LogIn } from "lucide-react";
import { useCustomer } from "@/lib/customer";

/**
 * Compact account/navigation quick-links, shared by the cart drawer and the
 * full /cart page (Apple's Bag "My Profile" section is the inspiration for
 * the pattern, not the styling). Every entry points at a real, existing
 * route -- "/account/orders", "/account/saves", "/account/profile" -- and
 * "Sign in" opens the same existing auth modal the rest of the site uses.
 * No account/saved-products functionality is invented here.
 */
export function CartProfileLinks({ onNavigate }: { onNavigate?: () => void }) {
  const { customer, status } = useCustomer();

  const profileLinks = [
    { icon: Package, label: "Orders", to: "/account/orders" },
    { icon: Bookmark, label: "Your Saves", to: "/account/saves" },
    { icon: User, label: "Account", to: "/account/profile" },
  ] as const;

  return (
    <div>
      {status === "in" && (
        <p className="mb-3 px-2 text-[13px] text-muted-foreground">
          Signed in as {customer?.firstName ? customer.firstName : customer?.email}.
        </p>
      )}
      <h3 className="text-[11px] font-medium text-muted-foreground mb-3 px-2">My Profile</h3>
      <ul className="space-y-0.5">
        {profileLinks.map((link) => (
          <li key={link.label}>
            <Link
              to={link.to}
              onClick={onNavigate}
              className="group flex items-center rounded-md px-2 py-1.5 text-[13px] md:text-[14px] font-medium text-foreground/80 hover:bg-muted/50 hover:text-foreground transition-colors"
            >
              <link.icon className="mr-3 size-3.5 text-muted-foreground/40 transition-colors group-hover:text-foreground" strokeWidth={1.5} />
              <span>{link.label}</span>
            </Link>
          </li>
        ))}
        {status === "out" && (
          <li>
            <button
              type="button"
              onClick={() => {
                onNavigate?.();
                window.dispatchEvent(new CustomEvent("open-auth-modal"));
              }}
              className="w-full group flex items-center rounded-md px-2 py-1.5 text-[13px] md:text-[14px] font-medium text-foreground/80 hover:bg-muted/50 hover:text-foreground transition-colors"
            >
              <LogIn className="mr-3 size-3.5 text-muted-foreground/40 transition-colors group-hover:text-foreground" strokeWidth={1.5} />
              <span>Sign in</span>
            </button>
          </li>
        )}
      </ul>
    </div>
  );
}
