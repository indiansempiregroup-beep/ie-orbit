import React, { createContext, useContext, useMemo, useState } from 'react';
import { shopLinePayable } from './shopHelpers';

export type CartLine = {
  product: ShopProduct;
  quantity: number;
};

type CartContextValue = {
  lines: CartLine[];
  addItem: (product: ShopProduct, quantity?: number) => void;
  setQuantity: (productId: string, quantity: number) => void;
  quantityFor: (productId: string) => number;
  clear: () => void;
  total: number;
  itemCount: number;
};

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([]);

  const value = useMemo<CartContextValue>(() => {
    return {
      lines,
      addItem: (product, quantity = 1) => {
        setLines((current) => {
          const existing = current.find((line) => line.product.id === product.id);
          if (existing) {
            return current.map((line) =>
              line.product.id === product.id
                ? { ...line, quantity: line.quantity + quantity }
                : line,
            );
          }
          return [...current, { product, quantity }];
        });
      },
      setQuantity: (productId, quantity) => {
        setLines((current) =>
          quantity <= 0
            ? current.filter((line) => line.product.id !== productId)
            : current.map((line) =>
                line.product.id === productId ? { ...line, quantity } : line,
              ),
        );
      },
      quantityFor: (productId) => lines.find((line) => line.product.id === productId)?.quantity ?? 0,
      clear: () => setLines([]),
      total: lines.reduce((sum, line) => sum + shopLinePayable(line.product, line.quantity), 0),
      itemCount: lines.reduce((sum, line) => sum + line.quantity, 0),
    };
  }, [lines]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within CartProvider');
  return ctx;
}
