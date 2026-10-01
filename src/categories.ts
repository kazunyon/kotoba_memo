import { isCloudConfigured } from './google-auth'
import type { MemoCategory } from './types'
import { loadCloudData, queueCloudCategories } from './cloud-sync'

const LOCAL_CATEGORY_KEY = 'kotoba-memo-categories'

export const MAX_CATEGORIES = 10
export const DEFAULT_CATEGORIES: MemoCategory[] = []

const isCategory = (value: unknown): value is MemoCategory => {
  if (typeof value !== 'object' || value === null) return false
  const category = value as Record<string, unknown>
  return Number.isInteger(category.number)
    && (category.number as number) > 0
    && (category.number as number) <= 9999
    && typeof category.name === 'string'
    && category.name.trim().length > 0
    && category.name.trim().length <= 20
}

const normalizedCategories = (items: MemoCategory[]) => items
  .filter(isCategory)
  .map((item) => ({ number: item.number, name: item.name.trim() }))
  .sort((a, b) => a.number - b.number)
  .slice(0, MAX_CATEGORIES)

function localCategories(): MemoCategory[] {
  const saved = localStorage.getItem(LOCAL_CATEGORY_KEY)
  if (!saved) {
    localStorage.setItem(LOCAL_CATEGORY_KEY, JSON.stringify(DEFAULT_CATEGORIES))
    return DEFAULT_CATEGORIES.map((item) => ({ ...item }))
  }
  try {
    const parsed = JSON.parse(saved) as MemoCategory[]
    return normalizedCategories(parsed)
  } catch {
    const defaults = DEFAULT_CATEGORIES.map((item) => ({ ...item }))
    localStorage.setItem(LOCAL_CATEGORY_KEY, JSON.stringify(defaults))
    return defaults
  }
}

export async function loadCategories(): Promise<MemoCategory[]> {
  if (!isCloudConfigured) return localCategories()

  return normalizedCategories((await loadCloudData()).categories)
}

export async function saveCategories(items: MemoCategory[], expectedRevision?: number): Promise<MemoCategory[]> {
  if (items.length > MAX_CATEGORIES) throw new Error(`エラー：カテゴリは${MAX_CATEGORIES}件までです。11件目は追加できません。`)
  const normalized = normalizedCategories(items)
  if (normalized.length !== items.length) throw new Error('カテゴリ名は20文字以内で入力してください。')

  if (!isCloudConfigured) {
    localStorage.setItem(LOCAL_CATEGORY_KEY, JSON.stringify(normalized))
    return normalized
  }

  return queueCloudCategories(normalized, expectedRevision)
}
