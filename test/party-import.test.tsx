import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const save = vi.fn(async (_: unknown) => ({ ok: true }));
vi.mock('@tanstack/react-start', () => ({ useServerFn: (f: unknown) => f, createServerFn: () => { throw new Error('not used'); } }));
vi.mock('@/lib/inventory.functions', () => ({ saveParty: (a: unknown) => save(a) }));
import { PartyImport } from '@/components/party-import';

const biz = '55555555-5555-4555-8555-555555555555';
const file = (text: string) => new File([text], 'parties.csv', { type: 'text/csv' });
beforeEach(() => save.mockClear());

describe('PartyImport', () => {
  it('previews, skips existing parties and imports the rest as the chosen type', async () => {
    const done = vi.fn();
    render(<PartyImport businessId={biz} kind="supplier" existing={[{ name: 'Old Co', phone: '9801' }]} onDone={done} />);
    fireEvent.change(screen.getByLabelText('Party CSV file'), { target: { files: [file('Party Name,Mobile\nOld Co,9801\nNew Co,9802\nAnother,9803')] } });
    expect(await screen.findByText(/2 new suppliers ready to import/)).toBeInTheDocument();
    expect(screen.getByText(/1 already exist/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Import 2' }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    expect((save.mock.calls[0]![0] as { data: Record<string, unknown> }).data).toMatchObject({ businessId: biz, kind: 'supplier', name: 'New Co', phone: '9802', is_active: true });
    expect(await screen.findByText('2 suppliers imported.')).toBeInTheDocument();
    expect(done).toHaveBeenCalled();
  });
  it('shows a clear error for a file without names', async () => {
    render(<PartyImport businessId={biz} kind="customer" existing={[]} onDone={() => {}} />);
    fireEvent.change(screen.getByLabelText('Party CSV file'), { target: { files: [file('phone\n1')] } });
    expect(await screen.findByText(/needs a "name"/)).toBeInTheDocument();
    expect(save).not.toHaveBeenCalled();
  });
  it('reports partial progress when the server rejects a row', async () => {
    save.mockResolvedValueOnce({ ok: true }).mockRejectedValueOnce(new Error('Administrator access is required.'));
    render(<PartyImport businessId={biz} kind="customer" existing={[]} onDone={() => {}} />);
    fireEvent.change(screen.getByLabelText('Party CSV file'), { target: { files: [file('name\nA\nB\nC')] } });
    fireEvent.click(await screen.findByRole('button', { name: 'Import 3' }));
    expect(await screen.findByText(/Administrator access is required\. 1 saved before stopping/)).toBeInTheDocument();
    expect(save).toHaveBeenCalledTimes(2);
  });
});
