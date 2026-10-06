"use client";

import { formatDate, USER_ROLE_HELP, USER_ROLE_LABEL, USER_ROLES, type UserRole, type UserRow } from "@av/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Power, PowerOff, UserPlus, Users } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, MobileList, MobileListItem, TableWrap } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/input";
import { Menu, MenuItem } from "@/components/ui/menu";
import { EmptyState, ErrorBlock, LoadingBlock } from "@/components/ui/misc";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

const useUsers = () => useQuery({ queryKey: ["users"], queryFn: () => api.get<UserRow[]>("/users") });

/** Settings → Users: who can log in, and whether they are an owner or a sub-owner. Owner only. */
export function UsersPanel() {
  const q = useUsers();
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [resetting, setResetting] = useState<UserRow | null>(null);
  const [toggling, setToggling] = useState<UserRow | null>(null);

  const update = useMutation({
    mutationFn: ({ id, ...body }: { id: string; role?: UserRole; disabled?: boolean; password?: string }) => api.patch<UserRow>(`/users/${id}`, body),
    onSuccess: (u, v) => {
      qc.invalidateQueries({ queryKey: ["users"] });
      qc.invalidateQueries({ queryKey: ["change-log"] });
      if (v.role) toast.success(`${u.name} is now ${v.role === "OWNER" ? "an owner" : "a sub-owner"}`);
      else if (v.disabled !== undefined) toast.success(v.disabled ? `${u.name} can no longer log in` : `${u.name} can log in again`);
      else if (v.password) toast.success(`New password set for ${u.name}`);
      setResetting(null);
      setToggling(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const roleSelect = (u: UserRow) => (
    <Select
      aria-label={`Role for ${u.name}`}
      value={u.role}
      disabled={u.disabled || update.isPending}
      onChange={(e) => update.mutate({ id: u.id, role: e.target.value as UserRole })}
      className="w-36"
    >
      {USER_ROLES.map((r) => (
        <option key={r} value={r}>
          {USER_ROLE_LABEL[r]}
        </option>
      ))}
    </Select>
  );
  const actions = (u: UserRow) => (
    <Menu label={`More actions for ${u.name}`}>
      <MenuItem icon={<KeyRound />} onSelect={() => setResetting(u)}>
        Set a new password
      </MenuItem>
      {!u.isYou && (
        <MenuItem icon={u.disabled ? <Power /> : <PowerOff />} danger={!u.disabled} onSelect={() => setToggling(u)}>
          {u.disabled ? "Turn access back on" : "Turn off access"}
        </MenuItem>
      )}
    </Menu>
  );
  const status = (u: UserRow) => (u.disabled ? <StatusBadge tone="neutral">No access</StatusBadge> : <StatusBadge tone="success">Active</StatusBadge>);

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="max-w-xl">
          <h2 className="text-[13px] font-semibold">Users</h2>
          <p className="mt-0.5 text-xs text-fg-muted">
            <span className="font-medium text-fg-2">Owner:</span> {USER_ROLE_HELP.OWNER} <span className="font-medium text-fg-2">Sub-owner:</span> {USER_ROLE_HELP.SUB_OWNER}
          </p>
        </div>
        <Button onClick={() => setAdding(true)}>
          <UserPlus /> Add user
        </Button>
      </div>
      <Card className="overflow-hidden">
        {q.isPending ? (
          <LoadingBlock rows={3} />
        ) : q.isError ? (
          <ErrorBlock error={q.error} onRetry={() => q.refetch()} />
        ) : q.data.length === 0 ? (
          <EmptyState icon={Users} title="No users" />
        ) : (
          <>
            <TableWrap className="max-sm:hidden">
              <table className="ledger">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Role</th>
                    <th>Status</th>
                    <th>Added</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody>
                  {q.data.map((u) => (
                    <tr key={u.id} className={cn(u.disabled && "text-fg-muted")}>
                      <td>
                        <div className="font-medium">
                          {u.name}
                          {u.isYou && <span className="ml-1.5 text-xs font-normal text-fg-muted">(you)</span>}
                        </div>
                        <div className="text-xs text-fg-muted">{u.email}</div>
                      </td>
                      <td>{roleSelect(u)}</td>
                      <td>{status(u)}</td>
                      <td className="num whitespace-nowrap text-fg-2">{formatDate(u.createdAt)}</td>
                      <td>{actions(u)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
            <MobileList className="sm:hidden">
              {q.data.map((u) => (
                <MobileListItem key={u.id} className={cn(u.disabled && "text-fg-muted")}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-[13px] font-semibold">
                        {u.name}
                        {u.isYou && <span className="ml-1.5 text-xs font-normal text-fg-muted">(you)</span>}
                      </div>
                      <div className="truncate text-xs text-fg-muted">{u.email}</div>
                    </div>
                    {actions(u)}
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-3">
                    {roleSelect(u)}
                    {status(u)}
                  </div>
                </MobileListItem>
              ))}
            </MobileList>
          </>
        )}
      </Card>

      <AddUserDialog open={adding} onOpenChange={setAdding} />
      <PasswordDialog user={resetting} onClose={() => setResetting(null)} loading={update.isPending} onSave={(password) => resetting && update.mutate({ id: resetting.id, password })} />
      <ConfirmDialog
        open={!!toggling}
        onOpenChange={(o) => !o && setToggling(null)}
        title={toggling?.disabled ? `Let ${toggling?.name} log in again?` : `Turn off access for ${toggling?.name}?`}
        description={
          toggling?.disabled
            ? "They can log in with their old password."
            : "They are logged out straight away and can't log in. Everything they recorded stays, with their name on it."
        }
        confirmLabel={toggling?.disabled ? "Turn access on" : "Turn off access"}
        danger={!toggling?.disabled}
        loading={update.isPending}
        onConfirm={() => toggling && update.mutate({ id: toggling.id, disabled: !toggling.disabled })}
      />
    </section>
  );
}

function AddUserDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const blank = { name: "", email: "", password: "", role: "SUB_OWNER" as UserRole };
  const [f, setF] = useState(blank);
  const [touched, setTouched] = useState(false);
  const errors = {
    name: f.name.trim() ? undefined : "Enter a name",
    email: /^\S+@\S+\.\S+$/.test(f.email.trim()) ? undefined : "Enter a valid email",
    password: f.password.length >= 8 ? undefined : "Use at least 8 characters",
  };
  const close = (o: boolean) => {
    if (!o) {
      setF(blank);
      setTouched(false);
    }
    onOpenChange(o);
  };
  const add = useMutation({
    mutationFn: () => api.post<UserRow>("/users", { ...f, name: f.name.trim(), email: f.email.trim() }),
    onSuccess: (u) => {
      qc.invalidateQueries({ queryKey: ["users"] });
      qc.invalidateQueries({ queryKey: ["change-log"] });
      toast.success(`${u.name} added as ${USER_ROLE_LABEL[u.role].toLowerCase()}. Share the email and password with them.`);
      close(false);
    },
    onError: (e) => toast.error(e.message),
  });
  const submit = () => {
    setTouched(true);
    if (!Object.values(errors).some(Boolean)) add.mutate();
  };
  return (
    <Dialog
      open={open}
      onOpenChange={close}
      title="Add a user"
      description="They log in with this email and password."
      footer={
        <>
          <Button variant="secondary" onClick={() => close(false)}>
            Cancel
          </Button>
          <Button loading={add.isPending} onClick={submit}>
            Add user
          </Button>
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <Field label="Name" required error={touched ? errors.name : undefined}>
          <Input autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        </Field>
        <Field label="Email" required error={touched ? errors.email : undefined}>
          <Input type="email" inputMode="email" autoComplete="off" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
        </Field>
        <Field label="Password" required error={touched ? errors.password : undefined} hint="At least 8 characters. They can't change it themselves yet – you can set a new one here.">
          <Input type="text" autoComplete="new-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
        </Field>
        <fieldset>
          <legend className="mb-1.5 text-[13px] font-medium text-fg-2">Role</legend>
          <div className="overflow-hidden rounded-lg border border-border">
            {USER_ROLES.map((r, i) => (
              <label key={r} className={cn("flex cursor-pointer gap-3 px-3 py-2.5", i > 0 && "border-t border-border", f.role === r ? "bg-accent-subtle" : "hover:bg-surface-2")}>
                <input type="radio" name="role" className="mt-0.5 size-4 shrink-0 accent-[var(--accent-solid)]" checked={f.role === r} onChange={() => setF({ ...f, role: r })} />
                <span>
                  <span className="block text-[13px] font-medium">{USER_ROLE_LABEL[r]}</span>
                  <span className="text-xs text-fg-muted">{USER_ROLE_HELP[r]}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}

function PasswordDialog({ user, onClose, onSave, loading }: { user: UserRow | null; onClose: () => void; onSave: (password: string) => void; loading: boolean }) {
  const [password, setPassword] = useState("");
  const [touched, setTouched] = useState(false);
  const invalid = password.length < 8;
  const close = () => {
    setPassword("");
    setTouched(false);
    onClose();
  };
  return (
    <Dialog
      open={!!user}
      onOpenChange={(o) => !o && close()}
      title={`New password for ${user?.name ?? ""}`}
      description="Their current sessions stay logged in. Share the new password with them."
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            Cancel
          </Button>
          <Button
            loading={loading}
            onClick={() => {
              setTouched(true);
              if (!invalid) onSave(password);
            }}
          >
            Set password
          </Button>
        </>
      }
    >
      <Field label="New password" required error={touched && invalid ? "Use at least 8 characters" : undefined}>
        <Input autoFocus type="text" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </Field>
    </Dialog>
  );
}
