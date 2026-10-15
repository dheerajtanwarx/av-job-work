import { USER_ROLE_HELP, USER_ROLE_LABEL, USER_ROLES, type UserRole, type UserRow } from "@av/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check } from "lucide-react-native";
import { Pressable, StyleSheet, View } from "react-native";
import { Text, toast } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { radius, space, useTheme } from "@/theme";

/** Settings → Users (owner only). Same key as the web, so either app's change refreshes the other's list. */
export const useUsers = () => useQuery({ queryKey: ["users"], queryFn: () => api.get<UserRow[]>("/users") });

/** Change one user's role, access or password. Toasts say what happened in words. */
export function useUpdateUser(onDone?: () => void) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; role?: UserRole; disabled?: boolean; password?: string }) => api.patch<UserRow>(`/users/${id}`, body),
    onSuccess: (u, v) => {
      qc.invalidateQueries({ queryKey: ["users"] });
      qc.invalidateQueries({ queryKey: ["change-log"] });
      if (v.role) toast.success(`${u.name} is now ${v.role === "OWNER" ? "an owner" : "a sub-owner"}`);
      else if (v.disabled !== undefined) toast.success(v.disabled ? `${u.name} can no longer log in` : `${u.name} can log in again`);
      else if (v.password) toast.success(`New password set for ${u.name}`);
      onDone?.();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
}

/** Owner / Sub-owner as two tappable rows, each with what that role can do. */
export function RolePicker({ value, onChange }: { value: UserRole; onChange: (r: UserRole) => void }) {
  const { c } = useTheme();
  return (
    <View style={{ gap: space.xs + 2 }}>
      <Text variant="label" tone="secondary">
        Role
      </Text>
      <View style={{ borderRadius: radius.md, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, overflow: "hidden" }}>
        {USER_ROLES.map((r, i) => {
          const on = r === value;
          return (
            <Pressable
              key={r}
              onPress={() => onChange(r)}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              android_ripple={{ color: c.surface3 }}
              style={{ flexDirection: "row", gap: space.md, padding: space.md + 2, backgroundColor: on ? c.accentSubtle : undefined, borderTopWidth: i ? StyleSheet.hairlineWidth : 0, borderColor: c.borderStrong }}
            >
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant={on ? "bodyStrong" : "body"}>{USER_ROLE_LABEL[r]}</Text>
                <Text variant="caption" tone="muted">
                  {USER_ROLE_HELP[r]}
                </Text>
              </View>
              {on ? <Check size={18} color={c.accent} /> : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
