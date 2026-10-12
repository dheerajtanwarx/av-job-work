import { useLocalSearchParams } from "expo-router";
import { ChallanForm } from "@/components/domain/challan-form";

export default function NewChallan() {
  const { clientId } = useLocalSearchParams<{ clientId?: string }>();
  return <ChallanForm defaultClientId={clientId} />;
}
