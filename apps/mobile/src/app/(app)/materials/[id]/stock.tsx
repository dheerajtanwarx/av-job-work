import { useLocalSearchParams } from "expo-router";
import { MissingMaster } from "@/components/domain/masters";
import { StockForm, useMaterial, type StockAction } from "@/components/domain/materials";

/** Receive stock (?action=RECEIPT) or adjust it up/down (?action=ADJUSTMENT). */
export default function MaterialStock() {
  const { id, action } = useLocalSearchParams<{ id: string; action?: StockAction }>();
  const q = useMaterial(id);
  return q.data ? <StockForm material={q.data} action={action === "ADJUSTMENT" ? "ADJUSTMENT" : "RECEIPT"} /> : <MissingMaster loading={q.isPending} noun="Material" />;
}
