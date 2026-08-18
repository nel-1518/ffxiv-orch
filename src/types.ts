/** 单条乐谱记录（来自 public/data/data.json） */
export interface ScoreItem {
  /** 序号（字符串） */
  id: string
  /** 乐谱名称，如「管弦乐琴乐谱：水车低鸣」 */
  name: string
  /** 场景（可为空字符串） */
  scene: string
  /** 获得方法 */
  src: string
  /** 灰机 wiki 页面地址 */
  url: string
  /** 分类，如「区域场景1」「任务相关」 */
  type: string
}

/** 按类型分组后的结果 */
export interface TypeGroup {
  type: string
  items: ScoreItem[]
}
