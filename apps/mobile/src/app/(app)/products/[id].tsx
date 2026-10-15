import { useLocalSearchParams } from "expo-router";
import { MissingMaster, ProductForm } from "@/components/domain/masters";
import { useProducts } from "@/lib/queries";

export default function EditProduct() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useProducts(false);
  const product = q.data?.find((p) => p.id === id);
  return product ? <ProductForm product={product} /> : <MissingMaster loading={q.isPending} noun="Product" />;
}
