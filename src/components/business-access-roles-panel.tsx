import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { Pencil, Plus, ShieldCheck, Trash2, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  assignBusinessAccessRole,
  createBusinessAccessRole,
  getBusinessAccessRoles,
  getBusinessMemberAccessRoles,
  unassignBusinessAccessRole,
  updateBusinessAccessRole,
} from '@/lib/business.functions';
import { permissionGroups } from '@/lib/permissions';

type Member = {
  user_id: string;
  role_code: string;
  job_title: string | null;
  status: string;
  profiles?: { full_name: string | null } | null;
};
type Assignment = {
  userId: string;
  roleId: string;
  roleCode: string;
  roleName: string;
  isDefault: boolean;
  assignedAt: string;
};

export function BusinessAccessRolesPanel({ businessId, members, isOwner }: { businessId: string; members: Member[]; isOwner: boolean }) {
  const client = useQueryClient();
  const loadRoles = useServerFn(getBusinessAccessRoles);
  const loadAssignments = useServerFn(getBusinessMemberAccessRoles);
  const createRoleFn = useServerFn(createBusinessAccessRole);
  const updateRoleFn = useServerFn(updateBusinessAccessRole);
  const assignRoleFn = useServerFn(assignBusinessAccessRole);
  const unassignRoleFn = useServerFn(unassignBusinessAccessRole);

  const rolesQuery = useQuery({
    queryKey: ['business-access-roles', businessId],
    queryFn: () => loadRoles({ data: { businessId } }),
    enabled: Boolean(businessId),
  });
  const assignmentsQuery = useQuery({
    queryKey: ['business-member-access-roles', businessId],
    queryFn: () => loadAssignments({ data: { businessId } }),
    enabled: Boolean(businessId),
  });

  const roles = rolesQuery.data?.roles ?? [];
  const assignments = assignmentsQuery.data?.assignments ?? [];
  const [editingRoleId, setEditingRoleId] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [permissions, setPermissions] = useState<string[]>([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedRoleId, setSelectedRoleId] = useState('');
  const [message, setMessage] = useState('');

  const editingRole = roles.find((r) => r.id === editingRoleId);
  const availableRoles = useMemo(() => roles.filter((r) =>
    r.isActive && r.authorityRank < (isOwner ? 100 : 80) && !assignments.some((a) => a.userId === selectedUserId && a.roleId === r.id)
  ), [roles, assignments, selectedUserId]);

  useEffect(() => {
    if (editingRole) {
      setName(editingRole.name);
      setDescription(editingRole.description ?? '');
      setPermissions(editingRole.permissions);
    }
  }, [editingRole]);

  useEffect(() => {
    if (!selectedUserId && members.length) setSelectedUserId(members.find((m) => m.status === 'active')?.user_id ?? '');
  }, [members, selectedUserId]);

  useEffect(() => {
    if (!availableRoles.some((r) => r.id === selectedRoleId)) setSelectedRoleId(availableRoles[0]?.id ?? '');
  }, [availableRoles, selectedRoleId]);

  const refresh = async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: ['business-access-roles', businessId] }),
      client.invalidateQueries({ queryKey: ['business-member-access-roles', businessId] }),
      client.invalidateQueries({ queryKey: ['permissions', businessId] }),
    ]);
  };

  const saveRole = useMutation({
    mutationFn: () => editingRoleId
      ? updateRoleFn({ data: { businessId, roleId: editingRoleId, name, description, authorityRank: 1, permissions } })
      : createRoleFn({ data: { businessId, name, description, authorityRank: 1, permissions } }),
    onSuccess: async () => {
      setMessage(editingRoleId ? 'Custom role updated.' : 'Custom role created.');
      setEditingRoleId('');
      setName('');
      setDescription('');
      setPermissions([]);
      await refresh();
    },
    onError: (error) => setMessage(error instanceof Error ? error.message : 'Role could not be saved.'),
  });

  const assignRole = useMutation({
    mutationFn: () => assignRoleFn({ data: { businessId, userId: selectedUserId, roleId: selectedRoleId } }),
    onSuccess: async () => { setMessage('Role assigned. Its permissions are combined with the employee’s existing roles.'); await refresh(); },
    onError: (error) => setMessage(error instanceof Error ? error.message : 'Role could not be assigned.'),
  });

  const unassignRole = useMutation({
    mutationFn: (v: { userId: string; roleId: string }) => unassignRoleFn({ data: { businessId, ...v } }),
    onSuccess: async () => { setMessage('Additional role removed.'); await refresh(); },
    onError: (error) => setMessage(error instanceof Error ? error.message : 'Role could not be removed.'),
  });

  const togglePermission = (permission: string) => {
    setPermissions((current) => current.includes(permission)
      ? current.filter((p) => p !== permission)
      : [...current, permission]);
  };

  const startNewRole = () => {
    setEditingRoleId('');
    setName('');
    setDescription('');
    setPermissions([]);
    setMessage('');
  };

  return (
    <section className="space-y-6 border-b py-7" aria-labelledby="business-access-roles-heading">
      <div>
        <div className="mb-2 flex items-center gap-2"><ShieldCheck className="size-5 text-primary" /><h3 id="business-access-roles-heading" className="brand text-xl">Business access roles</h3></div>
        <p className="text-sm text-muted-foreground">Create reusable permission bundles and assign more than one to an employee. Assign built-in authority roles such as Accountant or Branch Manager alongside custom permission bundles. HR position remains separate; custom roles cannot elevate administrator authority. Explicit employee denials still win, and branch access is managed separately.</p>
      </div>

      {(rolesQuery.isPending || assignmentsQuery.isPending) && <p role="status" className="text-sm text-muted-foreground">Loading access roles…</p>}
      {(rolesQuery.error || assignmentsQuery.error) && <p role="alert" className="text-sm text-destructive">{rolesQuery.error?.message || assignmentsQuery.error?.message || 'Access roles could not be loaded.'}</p>}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <section className="rounded-xl border p-4 md:p-5">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h4 className="font-semibold">{editingRoleId ? 'Edit custom role' : 'Create custom role'}</h4>
            {editingRoleId && <Button size="sm" variant="ghost" onClick={startNewRole}>New role</Button>}
          </div>
          <label className="mb-3 block text-sm">Role name
            <Input className="mt-1" value={name} maxLength={80} placeholder="e.g. Sales + Inventory" onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="mb-4 block text-sm">Description
            <Input className="mt-1" value={description} maxLength={500} placeholder="What this role is responsible for" onChange={(e) => setDescription(e.target.value)} />
          </label>
          <div className="mb-3 flex items-center justify-between gap-2"><h5 className="text-sm font-semibold">Permissions included</h5><span className="text-xs text-muted-foreground">{permissions.length} selected</span></div>
          <div className="max-h-[560px] space-y-4 overflow-y-auto pr-2">
            {permissionGroups.map((group) => (
              <fieldset key={group.title} className="border-t pt-3">
                <legend className="px-1 text-sm font-semibold">{group.title}</legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  {group.items.map((item) => (
                    <label key={item.code} className="flex items-start gap-2 text-sm">
                      <input type="checkbox" className="mt-0.5" checked={permissions.includes(item.code)} onChange={() => togglePermission(item.code)} />
                      <span>{item.label}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button disabled={name.trim().length < 2 || saveRole.isPending || !permissions.length} onClick={() => saveRole.mutate()}>
              {editingRoleId ? <Pencil className="mr-2 size-4" /> : <Plus className="mr-2 size-4" />}
              {saveRole.isPending ? 'Saving…' : editingRoleId ? 'Save role' : 'Create role'}
            </Button>
            {editingRoleId && <Button variant="outline" onClick={startNewRole}>Cancel</Button>}
          </div>
        </section>

        <div className="space-y-5">
          <section className="rounded-xl border p-4 md:p-5">
            <div className="mb-3 flex items-center gap-2"><ShieldCheck className="size-4 text-primary" /><h4 className="font-semibold">Available roles</h4></div>
            {!roles.length ? <p className="text-sm text-muted-foreground">No access roles are available yet.</p> : <div className="divide-y">
              {roles.map((role) => (
                <article key={role.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="font-medium">{role.name} {role.isSystem && <span className="ml-1 rounded bg-muted px-2 py-0.5 text-xs font-normal text-muted-foreground">{role.code.startsWith('legacy_') ? 'Authority role' : 'Position template'}</span>}</p>
                    <p className="text-xs text-muted-foreground">{role.description || role.code} · {role.permissions.length} permissions</p>
                  </div>
                  {!role.isSystem && <Button size="sm" variant="outline" onClick={() => { setEditingRoleId(role.id); setMessage(''); }}><Pencil className="mr-1 size-3" />Edit</Button>}
                </article>
              ))}
            </div>}
          </section>

          <section className="rounded-xl border p-4 md:p-5">
            <div className="mb-3 flex items-center gap-2"><Users className="size-4 text-primary" /><h4 className="font-semibold">Assign multiple roles to employees</h4></div>
            <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
              <label className="text-sm">Employee
                <select className="mt-1 h-10 w-full rounded-md border bg-background px-3" value={selectedUserId} onChange={(e) => setSelectedUserId(e.target.value)}>
                  {members.filter((m) => m.status === 'active').map((m) => <option key={m.user_id} value={m.user_id}>{m.profiles?.full_name || m.user_id.slice(0, 8)}</option>)}
                </select>
              </label>
              <label className="text-sm">Additional role
                <select className="mt-1 h-10 w-full rounded-md border bg-background px-3" value={selectedRoleId} onChange={(e) => setSelectedRoleId(e.target.value)} disabled={!availableRoles.length}>
                  {availableRoles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </label>
              <div className="flex items-end"><Button disabled={!selectedUserId || !selectedRoleId || assignRole.isPending} onClick={() => assignRole.mutate()}><Plus className="mr-1 size-4" />Assign</Button></div>
            </div>
            <div className="mt-5 divide-y">
              {members.filter((m) => m.status === 'active').map((member) => {
                const memberRoles = assignments.filter((a) => a.userId === member.user_id);
                return <article key={member.user_id} className="py-3">
                  <p className="mb-2 text-sm font-medium">{member.profiles?.full_name || member.user_id.slice(0, 8)}</p>
                  <div className="flex flex-wrap gap-2">
                    {memberRoles.map((assignment) => (
                      <span key={assignment.roleId} className="inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs">
                        {assignment.roleName}{assignment.isDefault ? ' · default' : ''}
                        {!assignment.isDefault && <button type="button" aria-label={`Remove ${assignment.roleName} from ${member.profiles?.full_name || 'employee'}`} className="ml-1 text-destructive" disabled={unassignRole.isPending} onClick={() => unassignRole.mutate({ userId: member.user_id, roleId: assignment.roleId })}><Trash2 className="size-3" /></button>}
                      </span>
                    ))}
                    {!memberRoles.length && <span className="text-xs text-muted-foreground">No role assignment found.</span>}
                  </div>
                </article>;
              })}
            </div>
          </section>
        </div>
      </div>
      {message && <p role="status" className="border-l-2 border-primary pl-3 text-sm">{message}</p>}
    </section>
  );
}
