import { useLocalSearchParams } from "expo-router";
import { DesignForm, MissingMaster } from "@/components/domain/masters";
import { useDesigns } from "@/lib/queries";

export default function EditDesign() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useDesigns(false);
  const design = q.data?.find((d) => d.id === id);
  return design ? <DesignForm design={design} /> : <MissingMaster loading={q.isPending} noun="Design" />;
}
