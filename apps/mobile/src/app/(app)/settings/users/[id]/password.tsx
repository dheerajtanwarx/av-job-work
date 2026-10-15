import { router, Stack, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { useUpdateUser, useUsers } from "@/components/domain/users";
import { Button, ErrorBlock, Field, FormScreen, ListSkeleton } from "@/components/ui";
import { useTheme } from "@/theme";

export default function SetPassword() {
  const { c } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const users = useUsers();
  const user = users.data?.find((u) => u.id === id);
  const [password, setPassword] = useState("");
  const [touched, setTouched] = useState(false);
  const update = useUpdateUser(() => router.back());
  const invalid = password.length < 8;

  if (!user)
    return (
      <View style={{ flex: 1, backgroundColor: c.bg }}>
        <Stack.Screen options={{ title: "Set password" }} />
        {users.isPending ? <ListSkeleton rows={2} /> : <ErrorBlock error={users.error ?? new Error("This user wasn't found.")} onRetry={users.refetch} />}
      </View>
    );

  return (
    <FormScreen
      title="Set a new password"
      subtitle={`${user.name} · ${user.email}`}
      footer={
        <Button
          title="Set password"
          size="lg"
          block
          loading={update.isPending}
          onPress={() => {
            setTouched(true);
            if (!invalid) update.mutate({ id: user.id, password });
          }}
          style={{ flex: 1 }}
        />
      }
    >
      <Field
        label="New password *"
        value={password}
        onChangeText={setPassword}
        autoCapitalize="none"
        autoComplete="new-password"
        autoFocus
        error={touched && invalid ? "Use at least 8 characters" : undefined}
        hint="Share it with them. Their old password stops working."
      />
    </FormScreen>
  );
}
