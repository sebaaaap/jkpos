import useSWR from "swr";
import { apiService } from "@/services/apiService";

export function usePaymentMethods() {
  const { data, error, isLoading, mutate } = useSWR("/payment-methods/", () => apiService.getPaymentMethods());

  // Adapt backend data to frontend PaymentMethod interface
  const mappedMethods = data?.map((m: any) => {
    const keyLower = (m.key || "").toLowerCase();
    return {
    id: m.id,
    name: m.name,
    key: keyLower,
    icon: m.icon,
    type: keyLower === "efectivo" ? "cash" : (keyLower === "tarjeta" ? "card" : (keyLower === "transferencia" ? "transfer" : "custom"))
    }
  });

  return {
    data: mappedMethods,
    error,
    isLoading,
    mutate
  };
}
