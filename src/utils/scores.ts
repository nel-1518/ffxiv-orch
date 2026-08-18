import { OWNED_KEY } from '../constants'
import type { ScoreItem, TypeGroup } from '../types'
import { assetUrl } from './path'

let cache: ScoreItem[] | null = null

/** 拉取全部乐谱数据（带模块级缓存） */
export async function fetchScores(): Promise<ScoreItem[]> {
  if (cache) return cache
  const response = await fetch(assetUrl('/data/data.json'))
  if (!response.ok) {
    throw new Error(`加载乐谱数据失败: ${response.status}`)
  }
  cache = (await response.json()) as ScoreItem[]
  return cache
}

/** 按 type 分组，顺序遵循 TYPE_ORDER */
export function groupByType(items: ScoreItem[], order: string[]): TypeGroup[] {
  const map = new Map<string, ScoreItem[]>()
  for (const item of items) {
    const list = map.get(item.type)
    if (list) {
      list.push(item)
    } else {
      map.set(item.type, [item])
    }
  }
  const types = [...new Set([...order, ...map.keys()])]
  const groups: TypeGroup[] = []
  for (const type of types) {
    const list = map.get(type)
    if (list) {
      groups.push({ type, items: list })
    }
  }
  return groups
}

/** 读取已获得标记（id 集合） */
export function loadOwned(): Set<string> {
  try {
    const raw = localStorage.getItem(OWNED_KEY)
    if (!raw) return new Set()
    const arr = JSON.parse(raw) as string[]
    return new Set(Array.isArray(arr) ? arr : [])
  } catch {
    return new Set()
  }
}

/** 保存已获得标记 */
export function saveOwned(owned: Set<string>): void {
  localStorage.setItem(OWNED_KEY, JSON.stringify([...owned]))
}
