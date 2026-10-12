import { useLocalSearchParams } from "expo-router";
import { ClientForm } from "@/components/domain/client-form";
import { ListSkeleton } from "@/components/ui";
import { useClientSummary } from "@/lib/queries";

export default function EditClient() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useClientSummary(id);
  return q.data ? <ClientForm client={q.data.client} /> : <ListSkeleton rows={4} />;
}
