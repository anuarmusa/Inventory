import Constants from 'expo-constants';
import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from 'react';
import { type Basket, emptyBasket, setLookup } from './basket';
import { createLookup } from './openFoodFacts';

interface BasketContext {
  basket: Basket;
  update(change: (basket: Basket) => Basket): void;
  /** Looks a new product up on Open Food Facts and stores the result on its line. */
  lookUp(code: string): void;
  clear(): void;
}

const Context = createContext<BasketContext | null>(null);
const lookup = createLookup(fetch, { appVersion: Constants.expoConfig?.version ?? '0.0.0' });

/** Holds the shopping basket while the scan screens are open. It lives in memory only. */
export function BasketProvider({ children }: { children: ReactNode }) {
  const [basket, setBasket] = useState<Basket>(emptyBasket);
  const update = useCallback((change: (b: Basket) => Basket) => setBasket(change), []);
  const lookUp = useCallback((code: string) => {
    void lookup(code).then((result) => {
      setBasket((b) => setLookup(b, code, result));
    });
  }, []);
  const clear = useCallback(() => setBasket(emptyBasket()), []);

  const value = useMemo(() => ({ basket, update, lookUp, clear }), [basket, update, lookUp, clear]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useBasket(): BasketContext {
  const value = useContext(Context);
  if (!value) throw new Error('useBasket must be used inside BasketProvider');
  return value;
}
