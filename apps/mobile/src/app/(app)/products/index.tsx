import { Package } from "lucide-react-native";
import { challanCount, MasterList } from "@/components/domain/masters";
import { useProducts } from "@/lib/queries";

export default function Products() {
  const q = useProducts(false);
  return (
    <MasterList
      title="Products"
      query={q}
      icon={Package}
      emptyTitle="No products yet"
      emptyBody="Items you send to job workers, like Saree (PCS), Blouse (PCS) or Fabric (MTR)."
      newLabel="New product"
      newHref="/products/new"
      hrefFor={(p) => `/products/${p.id}`}
      renderMeta={(p) => [p.unit, p.code, challanCount(p.jobCount)].filter(Boolean).join(" · ")}
    />
  );
}
