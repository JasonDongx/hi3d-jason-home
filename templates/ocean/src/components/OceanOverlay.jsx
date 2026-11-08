import { useEffect, useMemo } from 'react'
import { profile, sections, contentBySection, about } from '../data/content.js'

function formatDate(value) {
  if (!value) return ''
  return value.replace(/-/g, '.')
}

function Meta({ entry }) {
  return (
    <div className="o-entry-meta">
      <span>{formatDate(entry.date || entry.added || entry.published)}</span>
      {entry.minutes ? <span>{entry.minutes} 分钟</span> : null}
      {entry.author ? <span>{entry.author}</span> : null}
      {entry.tags?.length ? <span className="o-tags">{entry.tags.slice(0, 3).join(' / ')}</span> : null}
    </div>
  )
}

function AboutPanel() {
  return (
    <div className="o-about">
      <p className="o-about-lede">{about.lede}</p>
      {about.paragraphs.map((text) => (
        <p key={text}>{text}</p>
      ))}
      {about.groups.map((group) => (
        <section key={group.title} className="o-about-group">
          <h3>{group.title}</h3>
          {group.items.map((item) => (
            <div key={item.label} className="o-about-row">
              <span className="o-about-label">{item.label}</span>
              <span className="o-about-text">
                {item.text}
                {item.url ? (
                  <a href={item.url} target="_blank" rel="noreferrer">
                    打开 ↗
                  </a>
                ) : null}
              </span>
            </div>
          ))}
        </section>
      ))}
      <p className="o-about-tech">{about.tech}</p>
      <div className="o-about-links">
        {about.links.map((link) => (
          <a key={link.url} href={link.url} target="_blank" rel="noreferrer">
            {link.label} ↗
          </a>
        ))}
      </div>
    </div>
  )
}

function Reader({ entry, section, onClose }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="o-reader" style={{ '--o-accent': section.accent }}>
      <div className="o-reader-scrim" onClick={onClose} />
      <article className="o-reader-paper">
        <button className="o-reader-back" onClick={onClose}>
          ← 回到空地
        </button>
        <p className="o-reader-kicker">
          {section.kicker} · {formatDate(entry.date || entry.added || entry.published)}
        </p>
        <h1>{entry.title}</h1>
        {entry.originalTitle ? (
          <p className="o-reader-original">
            {entry.originalTitle}
            {entry.author ? ` · ${entry.author}` : ''}
          </p>
        ) : null}
        <div className="o-reader-meta">
          {entry.minutes ? <span>{entry.minutes} 分钟读完</span> : null}
          {entry.source ? <span>{entry.source}</span> : null}
          {entry.tags?.length ? <span>{entry.tags.join(' · ')}</span> : null}
        </div>
        <div className="o-reader-body" dangerouslySetInnerHTML={{ __html: entry.html }} />
        {entry.sourceUrl ? (
          <a className="o-reader-source" href={entry.sourceUrl} target="_blank" rel="noreferrer">
            原文：{entry.source || entry.sourceUrl} ↗
          </a>
        ) : null}
        <p className="o-reader-note">{profile.readerNote}</p>
      </article>
    </div>
  )
}

export default function OceanOverlay({
  selected,
  onSelect,
  reader,
  onRead,
  onCloseReader,
}) {
  const section = useMemo(() => sections.find((s) => s.id === selected), [selected])
  const readerSection = useMemo(
    () => (reader ? sections.find((s) => s.id === reader.sectionId) : null),
    [reader],
  )

  const entries = section && section.kind !== 'about' ? contentBySection[section.id] || [] : []
  const hidden = Boolean(reader)

  return (
    <div className="o-overlay">
      <header className={`o-topbar ${hidden ? 'is-dim' : ''}`}>
        <button className="o-brand" onClick={() => onSelect(null)}>
          <span className="o-brand-mark">{profile.brandMark}</span>
          <span className="o-brand-text">
            {profile.brand}
            <em>{profile.siteLatin}</em>
          </span>
        </button>
        <div className="o-top-right">
          <a className="o-top-link" href={profile.topLink.url} target="_blank" rel="noreferrer">
            {profile.topLink.label}
          </a>
        </div>
      </header>

      <nav className={`o-nav ${hidden ? 'is-dim' : ''}`}>
        {sections.map((item) => (
          <button
            key={item.id}
            className={selected === item.id ? 'is-active' : ''}
            onClick={() => onSelect(selected === item.id ? null : item.id)}
          >
            {item.label}
          </button>
        ))}
      </nav>

      <aside
        className={`o-panel ${!hidden && section ? 'is-open' : ''}`}
        style={section ? { '--o-accent': section.accent } : undefined}
      >
        {section ? (
          <>
            <button className="o-panel-close" onClick={() => onSelect(null)} aria-label="关闭">
              ×
            </button>
            <p className="o-panel-kicker">{section.kicker}</p>
            <h2>{section.title}</h2>
            <p className="o-panel-desc">{section.desc}</p>
            {section.kind === 'about' ? (
              <AboutPanel />
            ) : section.kind === 'links' ? (
              <div className="o-list">
                {entries.map((item) => (
                  <a
                    key={item.id}
                    className="o-row"
                    href={item.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <span className="o-row-title">{item.title}</span>
                    {item.note ? <span className="o-row-excerpt">{item.note}</span> : null}
                    <span className="o-row-link">{item.label} ↗</span>
                  </a>
                ))}
              </div>
            ) : (
              <div className="o-list">
                {entries.map((entry) => (
                  <button
                    key={entry.id}
                    className="o-row"
                    onClick={() => onRead({ sectionId: section.id, entry })}
                  >
                    <Meta entry={entry} />
                    <span className="o-row-title">{entry.title}</span>
                    {entry.excerpt ? <span className="o-row-excerpt">{entry.excerpt}</span> : null}
                  </button>
                ))}
              </div>
            )}
          </>
        ) : null}
      </aside>

      {reader && readerSection ? (
        <Reader entry={reader.entry} section={readerSection} onClose={onCloseReader} />
      ) : null}

      {!hidden ? <p className="o-hint">{profile.credit}</p> : null}
    </div>
  )
}
