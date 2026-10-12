import { useLocalSearchParams } from "expo-router";
import { ChallanForm } from "@/components/domain/challan-form";
import { ListSkeleton } from "@/components/ui";
import { useJob } from "@/lib/queries";

export default function EditChallan() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useJob(id);
  return q.data ? <ChallanForm job={q.data} /> : <ListSkeleton rows={4} />;
}
