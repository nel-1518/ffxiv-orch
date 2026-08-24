import { useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent, CSSProperties } from 'react'
import { NOTES_CONFIG, PAGE_SIZE, TYPE_ORDER } from '../../constants'
import type { FilterConfig, ScoreItem } from '../../types'
import {
  fetchScores,
  groupByType,
  loadFilter,
  loadOwned,
  saveFilter,
  saveOwned,
} from '../../utils/scores'
import '../../styles/scores.css'

const ALL = '全部'
const HIDE_NUMBER_TYPES = new Set(['季节活动', '商城与特典'])

/** 背景音符符号池 */
const NOTE_SYMBOLS = ['♪', '♫', '♩', '♬']

/** 单个漂浮音符 */
interface FloatingNote {
  id: number
  left: number
  top: number
  size: number
  rise: number
  duration: number
  symbol: string
}

/** 随机生成一个音符（每次出现位置都重新随机） */
function createNote(id: number): FloatingNote {
  return {
    id,
    // 随机出现位置（全屏范围内）
    left: Math.random() * 100,
    top: 5 + Math.random() * 90,
    size: 16 + Math.random() * 22,
    // 原地上升的随机距离（像素）
    rise: 50 + Math.random() * 30,
    // 单个音符从出现到消失的时长（毫秒）
    duration: 2000 + Math.random() * 1000,
    symbol: NOTE_SYMBOLS[Math.floor(Math.random() * NOTE_SYMBOLS.length)],
  }
}

/** 已获得标记的唯一标识：物品 id（Item.csv 中全局唯一，跨分类不重复） */
function ownedKey(item: ScoreItem): string {
  return String(item.id)
}

/** 编号展示：数据中已存为三位数（001、002…），直接返回 */
function formatId(id: string): string {
  return id
}

/** 复制文本：优先 Clipboard API，被拒绝或不可用时降级 execCommand */
async function copyText(text: string): Promise<void> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return
    }
  } catch {
    // Clipboard API 被拒绝（如权限不足），走降级路径
  }
  const ta = document.createElement('textarea')
  ta.value = text
  ta.style.position = 'fixed'
  ta.style.opacity = '0'
  document.body.appendChild(ta)
  ta.select()
  try {
    if (!document.execCommand('copy')) {
      throw new Error('execCommand copy failed')
    }
  } finally {
    document.body.removeChild(ta)
  }
}

/** 灰机 wiki 物品页地址（名称需 URL 编码） */
function wikiUrl(name: string): string {
  return `https://ff14.huijiwiki.com/wiki/物品:${encodeURIComponent(name)}`
}

/** 灰机 wiki 物品页地址（名称需 URL 编码） */
function priceUrl(id: number): string {
  return `https://universalis.app/market/${id}`
}

function ScoresPage() {
  const [scores, setScores] = useState<ScoreItem[]>([])
  const [loadError, setLoadError] = useState('')
  const [activeType, setActiveType] = useState(ALL)
  const [query, setQuery] = useState('')
  // 筛选配置（本地持久化，进入页面自动应用）：已获得 / 可交易 / 隐藏类型
  const [filter, setFilter] = useState<FilterConfig>(() => loadFilter())
  // 筛选弹窗开关
  const [filterOpen, setFilterOpen] = useState(false)
  const [owned, setOwned] = useState<Set<string>>(() => loadOwned())
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const [toast, setToast] = useState('')
  const [selected, setSelected] = useState<ScoreItem | null>(null)
  // 快速标记模式（仅具体分类下可用）：点击切换、按住拖动批量标记
  const [quickMark, setQuickMark] = useState(false)
  // 拖拽方向：按下时未标记→mark（划过全部标记），已标记→unmark（划过全部取消）
  const [dragMode, setDragMode] = useState<'mark' | 'unmark' | null>(null)
  // 一键标记确认弹窗（已标记/未标记混合时才弹出）
  const [confirmMarkAll, setConfirmMarkAll] = useState(false)
  const toastTimer = useRef<number | undefined>(undefined)
  // 已获得集合的实时引用：批量操作连续触发时避免闭包拿到过期值
  const ownedRef = useRef(owned)

  // 背景音符：定时随机生成，动画结束后移除
  const [notes, setNotes] = useState<FloatingNote[]>([])
  const noteIdRef = useRef(0)
  const activeCountRef = useRef(0)
  const timersRef = useRef<number[]>([])
  // 导入导出用的隐藏文件选择框
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    const spawn = () => {
      // 达到密度上限时跳过本次生成
      if (activeCountRef.current >= NOTES_CONFIG.density) return
      const id = ++noteIdRef.current
      activeCountRef.current += 1
      const note = createNote(id)
      setNotes((prev) => [...prev, note])
      // 动画结束后移除该音符
      const timer = window.setTimeout(() => {
        activeCountRef.current -= 1
        setNotes((prev) => prev.filter((n) => n.id !== id))
      }, note.duration)
      timersRef.current.push(timer)
    }
    // 立即生成一批，让背景不至于空白
    for (let i = 0; i < Math.min(6, NOTES_CONFIG.density); i++) spawn()
    const interval = window.setInterval(spawn, NOTES_CONFIG.frequency)
    return () => {
      window.clearInterval(interval)
      timersRef.current.forEach((t) => window.clearTimeout(t))
      timersRef.current = []
    }
  }, [])

  // 已获得集合与 ref 同步（拖拽批量操作使用实时引用）
  useEffect(() => {
    ownedRef.current = owned
  }, [owned])

  // 拖拽批量标记：松开鼠标即结束拖拽方向
  useEffect(() => {
    if (!dragMode) return
    const endDrag = () => setDragMode(null)
    window.addEventListener('mouseup', endDrag)
    return () => window.removeEventListener('mouseup', endDrag)
  }, [dragMode])

  // 弹窗打开时锁定页面滚动，Esc 关闭
  useEffect(() => {
    if (!selected && !confirmMarkAll && !filterOpen) return
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelected(null)
        setConfirmMarkAll(false)
        setFilterOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = ''
      window.removeEventListener('keydown', onKey)
    }
  }, [selected, confirmMarkAll, filterOpen])

  useEffect(() => {
    fetchScores()
      .then(setScores)
      .catch(() => setLoadError('乐谱数据加载失败，请刷新页面重试'))
  }, [])

  // 按类型分组（顺序遵循 TYPE_ORDER）
  const groups = useMemo(() => groupByType(scores, TYPE_ORDER), [scores])

  // 过滤：类型（全部下可隐藏指定类型）→ 关键词 → 已获得 → 可交易
  const filtered = useMemo(() => {
    const kw = query.trim().toLowerCase()
    let list = scores
    if (activeType === ALL) {
      // 「全部」下按配置隐藏指定类型，不参与统计与展示
      if (filter.hideSeasonal) {
        list = list.filter((s) => s.type !== '季节活动')
      }
      if (filter.hideShop) {
        list = list.filter((s) => s.type !== '商城与特典')
      }
    } else {
      list = list.filter((s) => s.type === activeType)
    }
    if (kw) {
      list = list.filter(
        (s) =>
          s.name.toLowerCase().includes(kw) ||
          s.scene.toLowerCase().includes(kw) ||
          s.src.toLowerCase().includes(kw),
      )
    }
    if (filter.owned === 'owned') {
      list = list.filter((s) => owned.has(ownedKey(s)))
    } else if (filter.owned === 'notOwned') {
      list = list.filter((s) => !owned.has(ownedKey(s)))
    }
    if (filter.trade === 'trade') {
      list = list.filter((s) => s.trade === 1)
    } else if (filter.trade === 'notTrade') {
      list = list.filter((s) => s.trade === 0)
    }
    return list
  }, [scores, activeType, query, filter, owned])

  // 每个类型的已收集/总数统计
  const typeStats = useMemo(() => {
    const map = new Map<string, { owned: number; total: number }>()
    for (const s of scores) {
      const stat = map.get(s.type) ?? { owned: 0, total: 0 }
      stat.total += 1
      if (owned.has(ownedKey(s))) stat.owned += 1
      map.set(s.type, stat)
    }
    return map
  }, [scores, owned])

  // 「全部」下的总数统计（受隐藏类型配置影响）
  const allStats = useMemo(() => {
    let total = 0
    let ownedCount = 0
    for (const s of scores) {
      if (filter.hideSeasonal && s.type === '季节活动') continue
      if (filter.hideShop && s.type === '商城与特典') continue
      total += 1
      if (owned.has(ownedKey(s))) ownedCount += 1
    }
    return { total, owned: ownedCount }
  }, [scores, filter, owned])

  // 是否有任一筛选条件生效（「筛选」按钮高亮提示）
  const isFilterActive = useMemo(
    () =>
      filter.owned !== 'all' ||
      filter.trade !== 'all',
    [filter],
  )

  const visible = filtered.slice(0, visibleCount)

  const showToast = (msg: string) => {
    setToast(msg)
    window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(''), 1600)
  }

  // 更新筛选配置：写入本地并重置渐进渲染
  const updateFilter = (patch: Partial<FilterConfig>) => {
    setFilter((prev) => {
      const next = { ...prev, ...patch }
      saveFilter(next)
      return next
    })
    setVisibleCount(PAGE_SIZE)
  }

  // 切换单个已获得标记（通过 ref 实时读写，拖拽批量触发时不会拿到过期状态）
  const toggleOwned = (key: string) => {
    const next = new Set(ownedRef.current)
    if (next.has(key)) {
      next.delete(key)
    } else {
      next.add(key)
    }
    ownedRef.current = next
    setOwned(next)
    saveOwned(next)
  }

  // 快速标记：按下时立即切换当前项，并按按下时的状态决定拖拽方向
  const handleSongMouseDown = (item: ScoreItem) => {
    if (!quickMark) return
    const key = ownedKey(item)
    const willMark = !ownedRef.current.has(key)
    toggleOwned(key)
    setDragMode(willMark ? 'mark' : 'unmark')
  }

  // 快速标记：拖拽划过时按方向批量标记/取消
  const handleSongMouseEnter = (item: ScoreItem) => {
    if (!dragMode) return
    const key = ownedKey(item)
    const target = dragMode === 'mark'
    if (ownedRef.current.has(key) !== target) {
      toggleOwned(key)
    }
  }

  // 当前结果是否全部已获得（决定「一键标记/取消」按钮的文案与行为）
  const allOwned = useMemo(
    () => filtered.length > 0 && filtered.every((s) => owned.has(ownedKey(s))),
    [filtered, owned],
  )

  // 当前结果中已标记数量（确认弹窗文案用）
  const ownedInFiltered = useMemo(
    () => filtered.filter((s) => owned.has(ownedKey(s))).length,
    [filtered, owned],
  )

  // 一键标记按钮：已标记/未标记同时存在时先弹出确认弹窗
  const handleMarkAllClick = () => {
    if (ownedInFiltered > 0 && !allOwned) {
      setConfirmMarkAll(true)
    } else {
      handleMarkAll()
    }
  }

  // 一键标记/取消当前分类下的全部结果
  const handleMarkAll = () => {
    const next = new Set(ownedRef.current)
    for (const s of filtered) {
      if (allOwned) {
        next.delete(ownedKey(s))
      } else {
        next.add(ownedKey(s))
      }
    }
    ownedRef.current = next
    setOwned(next)
    saveOwned(next)
  }

  // 点击行打开详情弹窗
  const handleOpenDetail = (item: ScoreItem) => {
    setSelected(item)
  }

  // 复制乐谱名称（弹窗内按钮）
  const handleCopyName = async (item: ScoreItem) => {
    try {
      await copyText(item.name)
      showToast(`已复制：${item.name}`)
    } catch {
      showToast('复制失败，请手动选择文本')
    }
  }

  // 导出已获得乐谱：按类型+编号排序，每行一个完整名称，方便阅读与再次导入
  const handleExport = () => {
    const ownedList = scores
      .filter((s) => owned.has(ownedKey(s)))
      .sort((a, b) => {
        const typeDiff = TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type)
        if (typeDiff !== 0) return typeDiff
        return Number(a.num) - Number(b.num)
      })
    if (ownedList.length === 0) {
      showToast('暂无可导出的已获得乐谱')
      return
    }
    const text = ownedList.map((s) => s.name).join('\n')
    // BOM 前缀：Windows 记事本按 UTF-8 打开不会乱码
    const blob = new Blob(['\uFEFF' + text], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'ffxiv-orch-已获得乐谱.txt'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
    showToast(`已导出 ${ownedList.length} 首乐谱`)
  }

  // 点击「导入」打开文件选择框
  const handleImportClick = () => {
    fileInputRef.current?.click()
  }

  // 导入 txt：每行一个乐谱名称，按完整名称精确匹配后标记为已获得
  const handleImportFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      const text = await file.text()
      const nameToScore = new Map(scores.map((s) => [s.name, s]))
      const next = new Set(ownedRef.current)
      let imported = 0
      let notFound = 0
      for (const raw of text.split(/\r?\n/)) {
        const name = raw.trim()
        if (!name) continue
        const item = nameToScore.get(name)
        if (!item) {
          notFound += 1
          continue
        }
        const key = ownedKey(item)
        if (!next.has(key)) {
          next.add(key)
          imported += 1
        }
      }
      ownedRef.current = next
      setOwned(next)
      saveOwned(next)
      const notFoundTip = notFound > 0 ? `，${notFound} 条未匹配` : ''
      if (imported > 0) {
        showToast(`已导入 ${imported} 首乐谱${notFoundTip}`)
      } else if (notFound > 0) {
        showToast(`未匹配到任何乐谱（${notFound} 条）`)
      } else {
        showToast('没有新的乐谱可导入')
      }
    } catch {
      showToast('导入失败，请检查文件内容')
    }
  }

  // 切换类型：重置渐进渲染；切回「全部」时退出快速标记（按钮只在具体分类下显示）
  const handleTypeChange = (type: string) => {
    setActiveType(type)
    setVisibleCount(PAGE_SIZE)
    if (type === ALL) setQuickMark(false)
  }

  return (
    <>
      {/* 网页棕色背景中的漂浮音符（位于相框之下，不遮挡内容） */}
      <div className="notes-layer" aria-hidden="true">
        {notes.map((n) => (
          <span
            key={n.id}
            className="floating-note"
            style={
              {
                left: `${n.left}%`,
                top: `${n.top}%`,
                fontSize: `${n.size}px`,
                animationDuration: `${n.duration}ms`,
                '--rise': `${n.rise}px`,
                '--note-opacity': NOTES_CONFIG.opacity,
              } as CSSProperties
            }
          >
            {n.symbol}
          </span>
        ))}
      </div>

      <div className="outer-frame scores-frame">
        <div className="panel">
        <div className="orchestrion-banner">
          <span className="orchestrion-text">Orchestrion</span>
        </div>

        {/* 标题 */}
        <div className="header">
          <div className="header-title-box">
            <h1>管弦乐琴乐谱集</h1>
          </div>
        </div>

        {loadError ? (
          <div className="scores-error">{loadError}</div>
        ) : (
          <>
            {/* 类型导航 */}
            <nav className="type-nav" aria-label="乐谱分类">
              <button
                type="button"
                className={`type-btn${activeType === ALL ? ' active' : ''}`}
                onClick={() => handleTypeChange(ALL)}
              >
                全部
                <span className="type-count">{allStats.total}</span>
              </button>
              {groups.map((g) => (
                <button
                  key={g.type}
                  type="button"
                  className={`type-btn${activeType === g.type ? ' active' : ''}`}
                  onClick={() => handleTypeChange(g.type)}
                >
                  {g.type}
                  <span className="type-count">{g.items.length}</span>
                </button>
              ))}
            </nav>

            {/* 搜索与筛选 */}
            <div className="filter-row">
              <input
                className="search-input"
                type="search"
                placeholder="搜索乐谱名称 / 场景 / 获得方法"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value)
                  setVisibleCount(PAGE_SIZE)
                }}
              />
              <button
                type="button"
                className={`filter-toggle${isFilterActive ? ' active' : ''}`}
                aria-label="打开筛选"
                onClick={() => setFilterOpen(true)}
              >
                筛选
              </button>
              {/* 导入导出：仅「全部」分类下显示 */}
              {activeType === ALL && (
                <div className="io-group">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".txt,text/plain"
                    style={{ display: 'none' }}
                    onChange={handleImportFile}
                  />
                  <button
                    type="button"
                    className="io-btn"
                    onClick={handleImportClick}
                  >
                    导入
                  </button>
                  <button
                    type="button"
                    className="io-btn"
                    onClick={handleExport}
                  >
                    导出
                  </button>
                </div>
              )}
              {/* 快速标记：仅具体分类下显示，点击进入批量标记模式 */}
              {activeType !== ALL && (
                <button
                  type="button"
                  className={`quick-mark-toggle${quickMark ? ' active' : ''}`}
                  aria-pressed={quickMark}
                  onClick={() => setQuickMark((q) => !q)}
                >
                  {quickMark ? '退出快速标记' : '快速标记'}
                </button>
              )}
            </div>

            {/* 快速标记提示条 */}
            {quickMark && (
              <div className="quick-mark-bar">
                <span className="quick-mark-hint">
                  点击切换标记 · 按住鼠标拖动可批量标记/取消
                </span>
                <button
                  type="button"
                  className="quick-mark-all"
                  disabled={filtered.length === 0}
                  onClick={handleMarkAllClick}
                >
                  {allOwned ? '一键取消标记' : '一键标记全部'}
                </button>
              </div>
            )}

            {/* 结果统计 */}
            <div className="result-row">
              <span className="area-label">
                {activeType === ALL ? '全部乐谱' : activeType} · {filtered.length} 首
              </span>
              <span className="result-hint">
                已收集{' '}
                {activeType === ALL
                  ? allStats.owned
                  : typeStats.get(activeType)?.owned ?? 0}
                /{activeType === ALL ? allStats.total : typeStats.get(activeType)?.total ?? 0}
              </span>
            </div>

            {/* 乐谱列表 */}
            {visible.length === 0 ? (
              <div className="scores-empty">没有符合条件的结果</div>
            ) : (
              <div className="song-grid">
                {visible.map((item) => {
                  const isOwned = owned.has(ownedKey(item))
                  const showNumber = !HIDE_NUMBER_TYPES.has(item.type)
                  const shortName = item.name.replace(/^管弦乐琴乐谱：/, '')
                  return (
                    <div
                      key={ownedKey(item)}
                      className={`song-item${isOwned ? ' owned' : ''}${quickMark ? ' quick-marking' : ''}`}
                      onClick={() => {
                        // 普通模式点击打开详情；快速标记模式下按下时已切换状态，这里不再重复处理
                        if (!quickMark) handleOpenDetail(item)
                      }}
                      onMouseDown={() => handleSongMouseDown(item)}
                      onMouseEnter={() => handleSongMouseEnter(item)}
                      title={quickMark ? '点击切换标记 · 按住拖动批量标记' : '点击查看详情'}
                    >
                      {showNumber && <span className="song-id">{formatId(item.num)}</span>}
                      <span className="song-main">
                        <span className="song-name">{shortName}</span>
                        {item.scene && <span className="song-scene">{item.scene}</span>}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}

            {/* 显示更多 */}
            {visible.length < filtered.length && (
              <div className="load-more-row">
                <button
                  type="button"
                  className="load-more-btn"
                  onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
                >
                  显示更多（剩余 {filtered.length - visible.length} 条）
                </button>
              </div>
            )}
          </>
        )}

        {/* 底部说明 */}
        <div className="footer-box">
          <div className="footer-title">使用说明</div>
          <div className="footer-content">
            点击乐谱可查看详情、跳转灰机WIKI，详情中可标记已获得；分类下还可使用「快速标记」点击/拖动批量操作，记录保存在本地，刷新后仍然有效。
            <br />
            乐谱相关数据来自
            <a
              href="https://ff14.huijiwiki.com/wiki/管弦乐琴乐谱集"
              target="_blank"
              rel="noreferrer"
            >
              最终幻想XIV中文维基-管弦乐琴乐谱集
            </a>
          </div>
        </div>
      </div>

      {/* 乐谱详情弹窗 */}
      {selected && (
        <div
          className="modal-overlay"
          onClick={() => setSelected(null)}
        >
          <div
            className="modal-card"
            role="dialog"
            aria-modal="true"
            aria-label={selected.name}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="modal-close"
              aria-label="关闭"
              onClick={() => setSelected(null)}
            >
              ×
            </button>
            <div className="modal-title">{selected.name}</div>
            <div className="modal-body">
              <div className="modal-row">
                <span className="modal-label">分类</span>
                <span className="modal-value">
                  {
                    HIDE_NUMBER_TYPES.has(selected.type) ? 
                    `${selected.type}`
                    :`${selected.type} - ${formatId(selected.num)}`
                  }</span>
              </div>
              {selected.scene && (
                <div className="modal-row">
                  <span className="modal-label">场景</span>
                  <span className="modal-value">{selected.scene}</span>
                </div>
              )}
              <div className="modal-row">
                <span className="modal-label">获得方法</span>
                <span className="modal-value">{selected.src}</span>
              </div>
              <div className="modal-row">
                <span className="modal-label">WIKI</span>
                <span className="modal-value">
                  <a
                    className="modal-text-link"
                    href={wikiUrl(selected.name)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    查看获取途径、试听等
                  </a>
                </span>
              </div>
              {selected.trade === 1 && (
                <div className="modal-row">
                  <span className="modal-label">可交易</span>
                  <a
                    className="modal-text-link"
                    href={priceUrl(selected.id)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    当前市场价格（Universalis）
                  </a>
                </div>
              )}
            </div>
            <div className="modal-actions">
              <button
                type="button"
                className={`modal-mark${owned.has(ownedKey(selected)) ? ' checked' : ''}`}
                onClick={() => toggleOwned(ownedKey(selected))}
              >
                {owned.has(ownedKey(selected)) ? '取消标记' : '标记为已获得'}
              </button>
              <button
                type="button"
                className="modal-copy"
                onClick={() => handleCopyName(selected)}
              >
                复制名称
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 一键标记确认弹窗 */}
      {confirmMarkAll && (
        <div
          className="modal-overlay"
          onClick={() => setConfirmMarkAll(false)}
        >
          <div
            className="modal-card"
            role="alertdialog"
            aria-modal="true"
            aria-label="确认一键标记全部"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-title">确认一键标记全部</div>
            <div className="modal-body">
              <p className="confirm-text">
                当前分类下已标记 {ownedInFiltered} 首、未标记 {filtered.length - ownedInFiltered}{' '}
                首。
                <br />
                确定将未标记的 {filtered.length - ownedInFiltered} 首全部标记为已获得吗？
              </p>
            </div>
            <div className="modal-actions">
              <button
                type="button"
                className="modal-copy"
                onClick={() => setConfirmMarkAll(false)}
              >
                取消
              </button>
              <button
                type="button"
                className="modal-confirm"
                onClick={() => {
                  handleMarkAll()
                  setConfirmMarkAll(false)
                }}
              >
                确认标记
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 筛选弹窗 */}
      {filterOpen && (
        <div
          className="modal-overlay"
          onClick={() => setFilterOpen(false)}
        >
          <div
            className="modal-card filter-modal"
            role="dialog"
            aria-modal="true"
            aria-label="筛选"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="modal-close"
              aria-label="关闭"
              onClick={() => setFilterOpen(false)}
            >
              ×
            </button>
            <div className="modal-title">筛选</div>
            <div className="modal-body">
              {/* 第一行：已获得 */}
              <div className="filter-option-row">
                <span className="filter-option-label">已获得</span>
                <div className="filter-option-group">
                  <button
                    type="button"
                    className={`filter-option-btn${filter.owned === 'all' ? ' active' : ''}`}
                    onClick={() => updateFilter({ owned: 'all' })}
                  >
                    全部
                  </button>
                  <button
                    type="button"
                    className={`filter-option-btn${filter.owned === 'owned' ? ' active' : ''}`}
                    onClick={() => updateFilter({ owned: 'owned' })}
                  >
                    已获得
                  </button>
                  <button
                    type="button"
                    className={`filter-option-btn${filter.owned === 'notOwned' ? ' active' : ''}`}
                    onClick={() => updateFilter({ owned: 'notOwned' })}
                  >
                    未获得
                  </button>
                </div>
              </div>
              {/* 第二行：可交易 */}
              <div className="filter-option-row">
                <span className="filter-option-label">可交易</span>
                <div className="filter-option-group">
                  <button
                    type="button"
                    className={`filter-option-btn${filter.trade === 'all' ? ' active' : ''}`}
                    onClick={() => updateFilter({ trade: 'all' })}
                  >
                    全部
                  </button>
                  <button
                    type="button"
                    className={`filter-option-btn${filter.trade === 'trade' ? ' active' : ''}`}
                    onClick={() => updateFilter({ trade: 'trade' })}
                  >
                    可交易
                  </button>
                  <button
                    type="button"
                    className={`filter-option-btn${filter.trade === 'notTrade' ? ' active' : ''}`}
                    onClick={() => updateFilter({ trade: 'notTrade' })}
                  >
                    不可交易
                  </button>
                </div>
              </div>
              {/* 第三行：隐藏季节活动 */}
              <label className="filter-check-row">
                <input
                  type="checkbox"
                  checked={filter.hideSeasonal}
                  onChange={(e) => updateFilter({ hideSeasonal: e.target.checked })}
                />
                <span>在「全部」中不统计「季节活动」乐谱</span>
              </label>
              {/* 第四行：隐藏商城与特典 */}
              <label className="filter-check-row">
                <input
                  type="checkbox"
                  checked={filter.hideShop}
                  onChange={(e) => updateFilter({ hideShop: e.target.checked })}
                />
                <span>在「全部」中不统计「商城与特典」乐谱</span>
              </label>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
      </div>
    </>
  )
}

export default ScoresPage
