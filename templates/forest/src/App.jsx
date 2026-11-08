import { useCallback, useEffect, useState } from 'react'
import Forest from './scene/Forest.jsx'
import Overlay from './components/Overlay.jsx'
import { demoPosts, loadLibrary } from './data/content.js'

export default function App() {
  const [selected, setSelected] = useState(null)
  const [reader, setReader] = useState(null)
  const [library, setLibrary] = useState(null)

  // 成品模式下全量文章在静态 JSON 里，按需拉，不进首屏 bundle
  useEffect(() => {
    let alive = true
    loadLibrary().then((data) => {
      if (alive) setLibrary(data)
    })
    return () => {
      alive = false
    }
  }, [])

  const handleSelect = useCallback((id) => {
    setSelected(id)
    setReader(null)
  }, [])

  const posts = selected ? library?.sections?.[selected] ?? demoPosts[selected] ?? [] : []

  return (
    <main className="app">
      <div className="canvas-wrap">
        <Forest selected={selected} onSelect={handleSelect} />
      </div>
      <Overlay
        selected={selected}
        onSelect={handleSelect}
        posts={posts}
        library={library}
        reader={reader}
        onRead={setReader}
        onCloseReader={() => setReader(null)}
      />
    </main>
  )
}
