/**
 * 乐谱类型展示顺序：区域场景 → 迷宫挑战 → 讨伐歼灭战 → 大型任务 → 环境音 → 任务相关 → 其他 → 季节活动 → 商城与特典
 */
export const TYPE_ORDER: string[] = [
  '区域场景1',
  '区域场景2',
  '迷宫挑战1',
  '迷宫挑战2',
  '讨伐歼灭战',
  '大型任务1',
  '大型任务2',
  '环境音',
  '任务相关',
  '其他',
  '季节活动',
  '商城与特典',
]

/** 已获得标记的 localStorage key */
export const OWNED_KEY = 'ffxiv-orch-owned'

/** 筛选配置的 localStorage key */
export const FILTER_KEY = 'ffxiv-orch-filter'

/** 每批渲染的乐谱条数 */
export const PAGE_SIZE = 50

/** 背景漂浮音符动画参数（可在此调节） */
export const NOTES_CONFIG = {
  /** 密度：同时存在的最大音符数量 */
  density: 20,
  /** 频率：每隔多少毫秒随机生成一个新音符 */
  frequency: 500,
  /** 透明度：音符最大不透明度（0~1） */
  opacity: 0.35,
}