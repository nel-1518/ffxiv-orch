/** 单条乐谱记录（来自 public/data/data.json） */
export interface ScoreItem {
  /** 分类内序号（三位数字符串，如 001、002、012） */
  num: string
  /** 乐谱名称，如「管弦乐琴乐谱：水车低鸣」 */
  name: string
  /** 场景（可为空字符串） */
  scene: string
  /** 获得方法 */
  src: string
  /** 分类，如「区域场景1」「任务相关」 */
  type: string
  /** Item.csv 中的物品 id（数字） */
  id: number
  /** 是否可交易，0 不可交易，1 可交易 */
  trade: number
}

/** 按类型分组后的结果 */
export interface TypeGroup {
  type: string
  items: ScoreItem[]
}

/** 筛选配置（本地持久化，进入页面自动应用） */
export interface FilterConfig {
  /** 已获得筛选：all=全部 / owned=仅已获得 / notOwned=仅未获得 */
  owned: 'all' | 'owned' | 'notOwned'
  /** 交易筛选：all=全部 / trade=仅可交易 / notTrade=仅不可交易 */
  trade: 'all' | 'trade' | 'notTrade'
  /** 在「全部」中不统计季节活动乐谱 */
  hideSeasonal: boolean
  /** 在「全部」中不统计商城与特典乐谱 */
  hideShop: boolean
  /** 在「全部」中不统计暂无获取方式的乐谱（src 为“暂无”） */
  hideNoSource: boolean
}
