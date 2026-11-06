import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createMemoryHistory, createRootRoute, createRouter } from '@tanstack/react-router';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const BIZ = '55555555-5555-4555-8555-555555555555'; const ME = '66666666-6666-4666-8666-666666666666'; const OTHER = '77777777-7777-4777-8777-777777777777';
const ctx = vi.hoisted(() => ({ role: 'owner' }));
const fns = vi.hoisted(() => ({
  saveNote: vi.fn(async (_: unknown) => ({ id: 'x' })), deleteNote: vi.fn(async (_: unknown) => ({ id: 'x' })),
  registerBill: vi.fn(async (_: unknown) => ({ id: 'b' })), saveBillMeta: vi.fn(async (_: unknown) => ({ id: 'b' })), deleteBill: vi.fn(async (_: unknown) => ({ id: 'b' })),
  rename: vi.fn(async (_: unknown) => ({ changed: 2 })),
  upload: vi.fn(async (_p: string, _f: unknown, _o: unknown) => ({ error: null as unknown })), remove: vi.fn(async (_: unknown) => ({ error: null })),
}));
const notes = [
  { id: 'n1', title: 'Order saree stock', body: 'Call the supplier on Sunday', pinned: false, created_by: ME, created_at: '2026-11-01T05:00:00Z', updated_at: '2026-11-03T05:00:00Z' },
  { id: 'n2', title: 'Festival offers', body: 'Plan Tihar discounts', pinned: true, created_by: OTHER, created_at: '2026-11-01T05:00:00Z', updated_at: '2026-11-02T05:00:00Z' },
];
const bills = [{ id: 'b1', storage_path: `${BIZ}/a.jpg`, caption: 'Supplier bill', bill_date: '2026-11-02', mime_type: 'image/jpeg', size_bytes: 1000, created_by: ME, created_at: '2026-11-02T05:00:00Z', url: 'https://files.example/a.jpg' }];

vi.mock('@tanstack/react-start', () => ({ useServerFn: (f: unknown) => f, createServerFn: () => { throw new Error('not used'); } }));
vi.mock('@/lib/inventory-queries', () => ({ businessQuery: { queryKey: ['businesses'], queryFn: async () => [{ id: BIZ, name: 'Auraluxe', role: ctx.role }] } }));
vi.mock('@/lib/workspace.functions', () => ({
  listNotes: async () => ({ notes, userId: ME }), saveNote: (a: unknown) => fns.saveNote(a), deleteNote: (a: unknown) => fns.deleteNote(a),
  listBills: async () => ({ bills, userId: ME }), registerBill: (a: unknown) => fns.registerBill(a), saveBillMeta: (a: unknown) => fns.saveBillMeta(a), deleteBill: (a: unknown) => fns.deleteBill(a),
  listItemCategories: async () => ({ categories: [{ name: '', count: 1 }, { name: 'Accessories', count: 3 }, { name: 'Clothes', count: 5 }] }), renameItemCategory: (a: unknown) => fns.rename(a),
}));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { storage: { from: () => ({ upload: (p: string, f: unknown, o: unknown) => fns.upload(p, f, o), remove: (a: unknown) => fns.remove(a) }) } } }));

import { Notebook } from '@/components/notebook';
import { BillGallery } from '@/components/bill-gallery';
import { ItemCategories } from '@/components/item-categories';

function mount(ui: ReactNode) {
  const root = createRootRoute({ component: () => <>{ui}</> });
  const router = createRouter({ routeTree: root, history: createMemoryHistory({ initialEntries: ['/'] }) });
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><RouterProvider router={router} /></QueryClientProvider>);
}
beforeEach(() => { ctx.role = 'owner'; Object.values(fns).forEach(f => f.mockClear()); fns.upload.mockResolvedValue({ error: null }); fns.registerBill.mockResolvedValue({ id: 'b' }); });

describe('Notebook', () => {
  it('lists notes, searches, and saves a new note for the business', async () => {
    mount(<Notebook />);
    expect(await screen.findByText('Order saree stock')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Search notes'), { target: { value: 'tihar' } });
    expect(screen.queryByText('Order saree stock')).not.toBeInTheDocument();
    expect(screen.getByText('Festival offers')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Search notes'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: /New note/ }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Note title'), { target: { value: 'Rent due' } });
    fireEvent.change(within(dialog).getByLabelText('Note text'), { target: { value: 'Pay on the 5th' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(fns.saveNote).toHaveBeenCalledTimes(1));
    expect((fns.saveNote.mock.calls[0]![0] as { data: unknown }).data).toMatchObject({ businessId: BIZ, title: 'Rent due', body: 'Pay on the 5th', pinned: false });
  });
  it('a staff member can edit their own note but only read someone else\'s', async () => {
    ctx.role = 'staff';
    mount(<Notebook />);
    fireEvent.click(await screen.findByText('Festival offers'));
    expect(within(await screen.findByRole('dialog')).getByLabelText('Note title')).toBeDisabled();
  });
  it('a viewer can read notes but has no way to add one', async () => {
    ctx.role = 'viewer';
    mount(<Notebook />);
    expect(await screen.findByText('Order saree stock')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /New note/ })).not.toBeInTheDocument();
  });
});

describe('Bill Gallery', () => {
  const pick = (file: File) => fireEvent.change(screen.getByLabelText('Bill file'), { target: { files: [file] } });
  it('shows saved bills', async () => {
    mount(<BillGallery />);
    expect(await screen.findByText('Supplier bill')).toBeInTheDocument();
    expect(screen.getByAltText('Supplier bill')).toHaveAttribute('src', 'https://files.example/a.jpg');
  });
  it('rejects files that are not images or PDFs before uploading', async () => {
    mount(<BillGallery />); await screen.findByText('Supplier bill');
    pick(new File(['x'], 'virus.exe', { type: 'application/x-msdownload' }));
    expect(await screen.findByText(/Only JPG, PNG, WebP images or PDF/)).toBeInTheDocument();
    expect(fns.upload).not.toHaveBeenCalled();
  });
  it('uploads inside the business folder, then records the bill', async () => {
    mount(<BillGallery />); await screen.findByText('Supplier bill');
    pick(new File(['img'], 'bill 12.jpg', { type: 'image/jpeg' }));
    await waitFor(() => expect(fns.registerBill).toHaveBeenCalledTimes(1));
    expect(fns.upload.mock.calls[0]![0]).toMatch(new RegExp(`^${BIZ}/[0-9a-f-]{36}\\.jpg$`));
    expect((fns.registerBill.mock.calls[0]![0] as { data: Record<string, unknown> }).data).toMatchObject({ businessId: BIZ, mimeType: 'image/jpeg', caption: 'bill 12' });
    expect(await screen.findByText('Bill uploaded.')).toBeInTheDocument();
  });
  it('removes the file again if the bill could not be recorded', async () => {
    fns.registerBill.mockRejectedValueOnce(new Error('Bill could not be saved.'));
    mount(<BillGallery />); await screen.findByText('Supplier bill');
    pick(new File(['img'], 'a.png', { type: 'image/png' }));
    expect(await screen.findByText('Bill could not be saved.')).toBeInTheDocument();
    expect(fns.remove).toHaveBeenCalledTimes(1);
  });
  it('a viewer cannot upload', async () => {
    ctx.role = 'viewer';
    mount(<BillGallery />);
    expect(await screen.findByText('Supplier bill')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Add bill/ })).not.toBeInTheDocument();
  });
});

describe('Item Categories', () => {
  it('lists categories with counts and renames one', async () => {
    mount(<ItemCategories />);
    expect(await screen.findByText('Clothes')).toBeInTheDocument();
    expect(screen.getByText('Uncategorised')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Rename Clothes' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('New category name'), { target: { value: 'Apparel' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(fns.rename).toHaveBeenCalledTimes(1));
    expect((fns.rename.mock.calls[0]![0] as { data: unknown }).data).toEqual({ businessId: BIZ, from: 'Clothes', to: 'Apparel' });
  });
  it('warns before merging into an existing category', async () => {
    mount(<ItemCategories />);
    fireEvent.click(await screen.findByRole('button', { name: 'Rename Clothes' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('New category name'), { target: { value: 'Accessories' } });
    expect(within(dialog).getByText(/will be merged/)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Merge categories' })).toBeInTheDocument();
  });
  it('non-administrators cannot edit categories', async () => {
    ctx.role = 'staff';
    mount(<ItemCategories />);
    expect(await screen.findByText('Clothes')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Rename/ })).not.toBeInTheDocument();
  });
});
