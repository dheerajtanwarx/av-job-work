import type { JobWorkType } from "@av/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Brush } from "lucide-react-native";
import { Switch } from "react-native";
import { challanCount, MasterList } from "@/components/domain/masters";
import { toast } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { useJobWorkTypes } from "@/lib/queries";
import { useTheme } from "@/theme";

export default function JobWorkTypes() {
  const q = useJobWorkTypes(false);
  return (
    <MasterList
      title="Job work types"
      query={q}
      icon={Brush}
      emptyTitle="No job work types yet"
      emptyBody="Add Embroidery, Printing, Stitching or any other work you send out."
      newLabel="New type"
      newHref="/job-work-types/new"
      hrefFor={(t) => `/job-work-types/${t.id}`}
      renderMeta={(t) => [t.code, challanCount(t.jobCount), t.description].filter(Boolean).join(" · ")}
      renderAside={(t) => <ActiveSwitch t={t} />}
    />
  );
}

/** Turn a type on or off without opening it, like the switch on the web list. */
function ActiveSwitch({ t }: { t: JobWorkType }) {
  const { c } = useTheme();
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: (isActive: boolean) => api.put(`/job-work-types/${t.id}`, { isActive }),
    onSuccess: (_d, isActive) => {
      qc.invalidateQueries({ queryKey: ["job-work-types"] });
      toast.success(`${t.name} ${isActive ? "activated" : "deactivated"}`);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Switch
      value={m.isPending ? m.variables : t.isActive}
      onValueChange={(v) => m.mutate(v)}
      disabled={m.isPending}
      accessibilityLabel={`${t.name} active`}
      trackColor={{ true: c.accentSolid, false: c.surface3 }}
      thumbColor="#fff"
    />
  );
}
