import { Link } from 'react-router-dom'
import '../../styles/home.css'

function HomePage() {
  return (
    <div className="outer-frame home-frame">
      <div className="panel">
        {/* Orchestrion 艺术横幅 */}
        <div className="orchestrion-banner">
          <span className="orchestrion-text">Orchestrion</span>
        </div>

        {/* 标题 */}
        <div className="header">
          <div className="header-title-box">
            <h1>旋律的沉醉者</h1>
          </div>
        </div>

        {/* 简介 */}
        <div className="home-intro">
          <p className="home-slogan">在艾欧泽亚的旅途中，收藏每一段旋律。</p>
          <p className="home-desc">
            收录游戏内 12 个类别共数百首管弦乐琴乐谱的获得途径与场景信息。
            <br />
            支持标记已获得，并可按类别与关键词快速检索。
          </p>
        </div>

        {/* 入口 */}
        <div className="home-actions">
          <Link className="home-entry-btn" to="/scores">
            进入乐谱记录
          </Link>
        </div>
      </div>
    </div>
  )
}

export default HomePage
