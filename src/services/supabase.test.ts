import { beforeEach, describe, expect, it, vi } from 'vitest'

const supabaseMocks = vi.hoisted(() => ({
  from: vi.fn(),
  invoke: vi.fn(),
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: supabaseMocks.from,
    functions: {
      invoke: supabaseMocks.invoke,
    },
  })),
}))

describe('trusted moderation writes', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.unstubAllEnvs()
    supabaseMocks.from.mockReset()
    supabaseMocks.invoke.mockReset()
  })

  it('rejects moderation writes when no trusted function is configured', async () => {
    const { canModerateSharedFinds, promoteVerification } = await import('./supabase')

    expect(canModerateSharedFinds()).toBe(false)
    await expect(promoteVerification('FM-2026-001', 'verified')).rejects.toThrow(/trusted Supabase Edge Function/)
    expect(supabaseMocks.from).not.toHaveBeenCalled()
    expect(supabaseMocks.invoke).not.toHaveBeenCalled()
  })

  it('routes promotions through the configured trusted function', async () => {
    vi.stubEnv('VITE_SHARED_FINDS_ADMIN_FUNCTION', 'shared-finds-admin')
    supabaseMocks.invoke.mockResolvedValue({ data: { ok: true }, error: null })

    const { canModerateSharedFinds, promoteVerification } = await import('./supabase')

    expect(canModerateSharedFinds()).toBe(true)
    await expect(promoteVerification(' FM-2026-001 ', 'research_grade', { coordinatesReleased: true })).resolves.toBeUndefined()
    expect(supabaseMocks.from).not.toHaveBeenCalled()
    expect(supabaseMocks.invoke).toHaveBeenCalledWith('shared-finds-admin', {
      body: {
        action: 'promoteVerification',
        hrid: 'FM-2026-001',
        update: {
          verification_status: 'research_grade',
          coordinates_released: true,
        },
      },
    })
  })

  it('routes deletes through the configured trusted function', async () => {
    vi.stubEnv('VITE_SHARED_FINDS_ADMIN_FUNCTION', 'shared-finds-admin')
    supabaseMocks.invoke.mockResolvedValue({ data: { ok: true }, error: null })

    const { deleteSharedFind } = await import('./supabase')

    await expect(deleteSharedFind(' FM-2026-001 ')).resolves.toBeUndefined()
    expect(supabaseMocks.invoke).toHaveBeenCalledWith('shared-finds-admin', {
      body: {
        action: 'deleteSharedFind',
        hrid: 'FM-2026-001',
      },
    })
  })

  it('rejects missing HRIDs before invoking the function', async () => {
    vi.stubEnv('VITE_SHARED_FINDS_ADMIN_FUNCTION', 'shared-finds-admin')
    const { deleteSharedFind, promoteVerification } = await import('./supabase')

    await expect(promoteVerification('   ', 'verified')).rejects.toThrow(/missing record HRID/)
    await expect(deleteSharedFind('   ')).rejects.toThrow(/missing record HRID/)
    expect(supabaseMocks.invoke).not.toHaveBeenCalled()
  })
})
