import { parseProductCode } from "./product-label";

type Product = { id: string; barcode: string; name: string; stock: number };
type CartItem = { id: string; qty: number };

export function prepareBarcodeBatch(codes: string[], products: Product[], cart: CartItem[]) {
  const next = cart.map((line) => ({ ...line })), missing: string[] = [],
    requested = new Map<string, number>();
  for (const raw of codes) {
    try {
      const barcode = parseProductCode(raw).barcode;
      const product = barcode && products.find((item) => item.barcode === barcode);
      if (!product) { missing.push(raw); continue; }
      requested.set(product.id, (requested.get(product.id) || 0) + 1);
    } catch { missing.push(raw); }
  }
  let added = 0;
  for (const [id, quantity] of requested) {
    const product = products.find((item) => item.id === id)!;
    const index = next.findIndex((item) => item.id === id);
    const current = index === -1 ? 0 : next[index].qty;
    const accepted = Math.max(0, Math.min(quantity, product.stock - current));
    added += accepted;
    if (accepted && index === -1) next.push({ id, qty: accepted });
    else if (accepted) next[index] = { ...next[index], qty: current + accepted };
    if (accepted < quantity) missing.push(product.name + " (insufficient stock)");
  }
  return { cart: next, missing, added, types: requested.size };
}
