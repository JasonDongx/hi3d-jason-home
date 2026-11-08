import { useCallback, useState } from 'react'
import Ocean from './scene/Ocean.jsx'
import OceanOverlay from './components/OceanOverlay.jsx'

export default function OceanApp() {
  const [selected, setSelected] = useState(null)
  const [reader, setReader] = useState(null)

  const handleSelect = useCallback((id) => {
    setSelected(id)
    setReader(null)
  }, [])

  const handleRead = useCallback((payload) => {
    setReader(payload)
  }, [])

  return (
    <main className="o-app">
      <div className="o-canvas">
        <Ocean selected={selected} onSelect={handleSelect} />
      </div>
      <OceanOverlay
        selected={selected}
        onSelect={handleSelect}
        reader={reader}
        onRead={handleRead}
        onCloseReader={() => setReader(null)}
      />
    </main>
  )
}
