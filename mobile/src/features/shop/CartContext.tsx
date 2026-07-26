import React, { createContext, useContext, useMemo, useState } from 'react';
import type { ShopProduct } from '@ie-platform/sdk';

export type CartLine = {
  product: ShopProduct;
  quantity: number;
};

type CartContextValue = {
  lines: CartLine[];
  addItem: (product: ShopProduct, quantity?: number) => void;
  setQuantity: (productId: string, quantity: number) => void;
  clear: () => void;
  total: number;
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
      clear: () => setLines([]),
      total: lines.reduce((sum, line) => sum + Number(line.product.price) * line.quantity, 0),
    };
  }, [lines]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within CartProvider');
  return ctx;
}
