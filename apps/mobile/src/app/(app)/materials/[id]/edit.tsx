import { useLocalSearchParams } from "expo-router";
import { MissingMaster } from "@/components/domain/masters";
import { MaterialForm, useMaterial } from "@/components/domain/materials";

export default function EditMaterial() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useMaterial(id);
  return q.data ? <MaterialForm material={q.data} /> : <MissingMaster loading={q.isPending} noun="Material" />;
}
