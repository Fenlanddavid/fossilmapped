import { beforeEach, describe, expect, it, vi } from 'vitest'

const supabaseMocks = vi.hoisted(() => ({
  from: vi.fn(),
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: supabaseMocks.from,
  })),
}))

function mockUpdateResult(result: { data: unknown[] | null; error: unknown }) {
  const select = vi.fn().mockResolvedValue(result)
  const eq = vi.fn(() => ({ select }))
  const update = vi.fn(() => ({ eq }))
  supabaseMocks.from.mockReturnValue({ update })
  return { update, eq, select }
}

describe('promoteVerification', () => {
  beforeEach(() => {
    vi.resetModules()
    supabaseMocks.from.mockReset()
  })

  it('throws when no row was updated', async () => {
    const chain = mockUpdateResult({ data: [], error: null })
    const { promoteVerification } = await import('./supabase')

    await expect(promoteVerification(' FM-2026-001 ', 'verified')).rejects.toThrow(/Promotion did not apply/)
    expect(supabaseMocks.from).toHaveBeenCalledWith('shared_finds')
    expect(chain.update).toHaveBeenCalledWith({ verification_status: 'verified' })
    expect(chain.eq).toHaveBeenCalledWith('hrid', 'FM-2026-001')
    expect(chain.select).toHaveBeenCalledWith('hrid')
  })

  it('resolves when exactly one row was updated', async () => {
    mockUpdateResult({ data: [{ hrid: 'FM-2026-001' }], error: null })
    const { promoteVerification } = await import('./supabase')

    await expect(promoteVerification('FM-2026-001', 'research_grade')).resolves.toBeUndefined()
  })

  it('can update coordinate release separately from verification status', async () => {
    const chain = mockUpdateResult({ data: [{ hrid: 'FM-2026-001' }], error: null })
    const { promoteVerification } = await import('./supabase')

    await expect(promoteVerification('FM-2026-001', 'research_grade', { coordinatesReleased: true })).resolves.toBeUndefined()
    expect(chain.update).toHaveBeenCalledWith({
      verification_status: 'research_grade',
      coordinates_released: true,
    })
  })

  it('rejects missing HRIDs before calling Supabase', async () => {
    mockUpdateResult({ data: [{ hrid: 'FM-2026-001' }], error: null })
    const { promoteVerification } = await import('./supabase')

    await expect(promoteVerification('   ', 'verified')).rejects.toThrow(/missing record HRID/)
    expect(supabaseMocks.from).not.toHaveBeenCalled()
  })
})

describe('deleteSharedFind', () => {
  beforeEach(() => {
    vi.resetModules()
    supabaseMocks.from.mockReset()
  })

  it('soft deletes exactly one matching row', async () => {
    const chain = mockUpdateResult({ data: [{ hrid: 'FM-2026-001' }], error: null })
    const { deleteSharedFind } = await import('./supabase')

    await expect(deleteSharedFind(' FM-2026-001 ')).resolves.toBeUndefined()
    expect(supabaseMocks.from).toHaveBeenCalledWith('shared_finds')
    expect(chain.update).toHaveBeenCalledWith(expect.objectContaining({ is_deleted: true }))
    expect(chain.update.mock.calls[0][0].deleted_at).toEqual(expect.any(String))
    expect(chain.eq).toHaveBeenCalledWith('hrid', 'FM-2026-001')
    expect(chain.select).toHaveBeenCalledWith('hrid')
  })

  it('throws when no row was deleted', async () => {
    mockUpdateResult({ data: [], error: null })
    const { deleteSharedFind } = await import('./supabase')

    await expect(deleteSharedFind('FM-2026-001')).rejects.toThrow(/Delete did not apply/)
  })

  it('rejects missing HRIDs before calling Supabase', async () => {
    mockUpdateResult({ data: [{ hrid: 'FM-2026-001' }], error: null })
    const { deleteSharedFind } = await import('./supabase')

    await expect(deleteSharedFind('   ')).rejects.toThrow(/missing record HRID/)
    expect(supabaseMocks.from).not.toHaveBeenCalled()
  })
})
