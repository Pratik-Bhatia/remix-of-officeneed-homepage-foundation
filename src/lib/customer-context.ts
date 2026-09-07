import { createContext, useContext } from "react";
import type { Customer } from "@/lib/customer";

export interface CustomerContextValue {
  customer: Customer | null;
  token: string | null;
  reload: () => Promise<void>;
}

export const CustomerContext = createContext<CustomerContextValue>({
  customer: null,
  token: null,
  reload: async () => {},
});

export function useCustomerContext() {
  return useContext(CustomerContext);
}
