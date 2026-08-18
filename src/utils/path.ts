/**
 * 将相对于站点根目录的路径转换为正确的完整路径，
 * 自动适配 Vite 的 base 配置（如 GitHub Pages 子路径部署）。
 *
 * @example
 * assetUrl('/data/data.json') → '/data/data.json'
 */
export function assetUrl(path: string): string {
  const base = import.meta.env.BASE_URL
  const clean = path.startsWith('/') ? path.slice(1) : path
  return `${base}${clean}`
}
