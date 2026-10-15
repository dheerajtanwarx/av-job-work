import { useLocalSearchParams } from "expo-router";
import { JobWorkTypeForm, MissingMaster } from "@/components/domain/masters";
import { useJobWorkTypes } from "@/lib/queries";

export default function EditJobWorkType() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useJobWorkTypes(false);
  const type = q.data?.find((t) => t.id === id);
  return type ? <JobWorkTypeForm type={type} /> : <MissingMaster loading={q.isPending} noun="Job work type" />;
}
