import { formatINR } from "@av/shared";
import { Shapes } from "lucide-react-native";
import { challanCount, MasterList } from "@/components/domain/masters";
import { Text } from "@/components/ui";
import { useDesigns } from "@/lib/queries";

export default function Designs() {
  const q = useDesigns(false);
  return (
    <MasterList
      title="Designs"
      query={q}
      icon={Shapes}
      emptyTitle="No designs yet"
      emptyBody="Designs you pay for, like Floral Design at ₹20 a piece. The rate prefills new challans."
      newLabel="New design"
      newHref="/designs/new"
      hrefFor={(d) => `/designs/${d.id}`}
      renderMeta={(d) => [d.code, d.jobWorkType?.name, challanCount(d.jobCount)].filter(Boolean).join(" · ")}
      renderAside={(d) => (
        <Text variant="bodyStrong" num>
          {formatINR(d.defaultRatePaise)}
        </Text>
      )}
    />
  );
}
