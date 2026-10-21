import { USER_ROLE_LABEL, userCreateSchema, type UserRole, type UserRow } from "@av/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState } from "react";
import { RolePicker } from "@/components/domain/users";
import { Button, Field, FormScreen, toast } from "@/components/ui";
import { api, ApiError, errorMessage } from "@/lib/api";

export default function NewUser() {
  const qc = useQueryClient();
  const [f, setF] = useState({ name: "", email: "", password: "", role: "SUB_OWNER" as UserRole });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const add = useMutation({
    mutationFn: async () => {
      const body = { ...f, name: f.name.trim(), email: f.email.trim() };
      const parsed = userCreateSchema.safeParse(body);
      if (!parsed.success) throw new ApiError(422, parsed.error.issues[0].message, { fieldErrors: Object.fromEntries(parsed.error.issues.map((i) => [i.path.join("."), i.message])) });
      return api.post<UserRow>("/users", body);
    },
    onSuccess: (u) => {
      qc.invalidateQueries({ queryKey: ["users"] });
      qc.invalidateQueries({ queryKey: ["activity"] });
      toast.success(`${u.name} added as ${USER_ROLE_LABEL[u.role].toLowerCase()}. Share the email and password with them.`);
      router.back();
    },
    onError: (e) => {
      if (e instanceof ApiError) setErrors(e.fieldErrors);
      toast.error(errorMessage(e));
    },
  });
  return (
    <FormScreen title="Add a user" subtitle="They log in with this email and password." footer={<Button title="Add user" size="lg" block loading={add.isPending} onPress={() => add.mutate()} style={{ flex: 1 }} />}>
      <Field label="Name *" value={f.name} onChangeText={(name) => setF({ ...f, name })} error={errors.name} autoCapitalize="words" autoFocus />
      <Field label="Email *" value={f.email} onChangeText={(email) => setF({ ...f, email })} error={errors.email} keyboardType="email-address" autoCapitalize="none" autoComplete="off" />
      <Field
        label="Password *"
        value={f.password}
        onChangeText={(password) => setF({ ...f, password })}
        error={errors.password}
        autoCapitalize="none"
        autoComplete="new-password"
        hint="At least 8 characters. They can't change it themselves yet; you can set a new one later."
      />
      <RolePicker value={f.role} onChange={(role) => setF({ ...f, role })} />
    </FormScreen>
  );
}
