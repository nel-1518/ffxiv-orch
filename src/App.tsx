import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import HomePage from './components/home/HomePage'
import ScoresPage from './components/scores/ScoresPage'
import './styles/panel.css'
import './styles/home.css'
import './styles/scores.css'

function App() {
  return (
    /* HashRouter：部署到 GitHub Pages 子路径时可避免刷新/深链 404 */
    <HashRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/scores" element={<ScoresPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  )
}

export default App
