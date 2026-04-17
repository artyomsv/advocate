import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface ProductStore {
  selectedProductId: string | null;
  setSelectedProductId: (id: string | null) => void;
}

export const useProductStore = create<ProductStore>()(
  persist(
    (set) => ({
      selectedProductId: null,
      setSelectedProductId: (selectedProductId) => set({ selectedProductId }),
    }),
    { name: 'mynah-selected-product' },
  ),
);
