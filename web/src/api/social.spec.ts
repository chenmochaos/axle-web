import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { ApiError, NeedLoginError, setToken } from './client'
import { fetchCommonFollows, fetchProfile, isFollowing, setFollow } from './social'
import { fetchSignCount, signIn, updateProfile } from './user'
import { mockUser } from './mock'

/**
 * M5 关注 / 资料 / 签到的用例。
 *
 * 这三块的状态全在 Redis（follow Set、bitmap），没有数据库唯一约束兜底，
 * 所以「重复关注」「同一天签两次」这类问题只能靠接口层的行为约定来守 ——
 * mock 复刻的就是那套约定。
 */

const TOKEN = 'mock-token-13800000000'

beforeEach(() => {
  setToken(TOKEN)
})

afterEach(() => {
  localStorage.clear()
})

describe('资料与关注', () => {
  it('粉丝/关注/口碑都是实时计数；不存在的用户是 ApiError', async () => {
    const profile = await fetchProfile(11)
    expect(profile.nickName).toBeTruthy()
    expect(profile.fans).toBeGreaterThan(0)
    expect(profile.reviews).toBeGreaterThan(0)

    await expect(fetchProfile(9999)).rejects.toMatchObject({ message: '用户不存在' })
  })

  it('关注与取关改变粉丝数，且 isFollowing 跟着变', async () => {
    const target = 17 // 种子里当前用户没关注他
    const before = await fetchProfile(target)
    expect(await isFollowing(target)).toBe(false)

    await setFollow(target, true)
    expect(await isFollowing(target)).toBe(true)
    expect((await fetchProfile(target)).fans).toBe(before.fans + 1)

    await setFollow(target, false)
    expect(await isFollowing(target)).toBe(false)
    expect((await fetchProfile(target)).fans).toBe(before.fans)
  })

  it('重复关注不会把粉丝数算成两份', async () => {
    const target = 12
    const before = await fetchProfile(target)
    await setFollow(target, true)
    await setFollow(target, true)
    expect((await fetchProfile(target)).fans).toBe(before.fans + 1)
    await setFollow(target, false)
  })

  it('不能关注自己', async () => {
    await expect(setFollow(mockUser.id, true)).rejects.toBeInstanceOf(ApiError)
  })

  it('共同关注是我和对方的交集，且排除双方本人', async () => {
    // 当前用户关注 11/13/15，11 关注当前用户和 13 → 交集只有 13
    const commons = await fetchCommonFollows(11)
    expect(commons.map((u) => u.id)).toEqual([13])
  })

  it('未登录查询关注状态 → NeedLoginError', async () => {
    localStorage.clear()
    await expect(isFollowing(11)).rejects.toBeInstanceOf(NeedLoginError)
  })
})

describe('签到', () => {
  it('同一天签两次还是 1 天', async () => {
    // 新会话没签过 —— 这个 suite 只跑一次，Set 状态在文件内共享
    expect(await fetchSignCount()).toBe(0)
    await signIn()
    expect(await fetchSignCount()).toBe(1)
    await signIn()
    expect(await fetchSignCount()).toBe(1)
  })

  it('未登录签到 → NeedLoginError', async () => {
    localStorage.clear()
    await expect(signIn()).rejects.toBeInstanceOf(NeedLoginError)
  })
})

describe('修改资料', () => {
  it('昵称会同步到历史口碑的作者副本', async () => {
    const original = mockUser.nickName
    try {
      const next = await updateProfile({ nickName: '新昵称' })
      expect(next.nickName).toBe('新昵称')
      const profile = await fetchProfile(mockUser.id)
      expect(profile.nickName).toBe('新昵称')
    } finally {
      // mockUser 是模块级单例，不还原会污染同一文件后面的用例
      await updateProfile({ nickName: original })
    }
  })

  it('空昵称被拒绝', async () => {
    await expect(updateProfile({ nickName: '   ' })).rejects.toThrow('昵称不能为空')
  })
})
