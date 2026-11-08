import { useEffect, useMemo, useState } from 'react'
import { marked } from 'marked'
import { about, profile, sections, stats } from '../data/content.js'

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// 内容来自自己的仓库，仍做一层最小消毒，避免模板表达式或脚本混进阅读器
function sanitize(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
    .replace(/\son\w+\s*=\s*(["']).*?\1/gi, '')
    .replace(/javascript:/gi, '')
}

function renderBody(post) {
  if (!post) return ''
  if (post.format === 'markdown') return sanitize(marked.parse(post.body || ''))
  if (post.format === 'html') return sanitize(post.body || '')
  return (post.paragraphs || []).map((p) => `<p>${escapeHtml(p)}</p>`).join('')
}

function formatDate(value) {
  const raw = String(value || '').slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw.replace(/-/g, '.') : raw || '未标日期'
}

export default function Overlay({
  selected,
  onSelect,
  posts,
  library,
  reader,
  onRead,
  onCloseReader,
}) {
  const section = sections.find((item) => item.id === selected)
  const aboutParagraphs = about.paragraphs || []
  const aboutLinks = about.links || []
  const [query, setQuery] = useState('')

  useEffect(() => {
    setQuery('')
  }, [selected])

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key !== 'Escape') return
      if (reader) onCloseReader()
      else if (selected) onSelect(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [reader, selected, onCloseReader, onSelect])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return posts
    return posts.filter((post) =>
      `${post.title} ${post.excerpt} ${(post.tags || []).join(' ')}`.toLowerCase().includes(q),
    )
  }, [posts, query])

  const grouped = useMemo(() => {
    const map = new Map()
    for (const post of filtered) {
      const year = String(post.date || '').slice(0, 4) || '未标日期'
      if (!map.has(year)) map.set(year, [])
      map.get(year).push(post)
    }
    return [...map.entries()]
  }, [filtered])

  const readerHtml = useMemo(() => renderBody(reader), [reader])
  const outsidePages = library?.outsidePages || []

  return (
    <div className="overlay">
      {/* 上下极淡的柔光遮罩：亮背景上白字仍可读，但不会把森林压暗 */}
      <div className="veil" aria-hidden="true" />

      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">{profile.brandMark || '林'}</span>
          <span className="brand-words">
            <strong>{profile.brand || profile.forestName || '林间'}</strong>
            <em>{profile.forestLatin || 'a walk in the woods'}</em>
          </span>
        </div>
        <div className="topbar-right">
          {profile.place && <span className="place">{profile.place}</span>}
          {profile.topLink?.url && (
            <a className="top-link" href={profile.topLink.url} target="_blank" rel="noreferrer">
              {profile.topLink.label} <span aria-hidden="true">↗</span>
            </a>
          )}
        </div>
      </header>

      {/* 身份收进左下角，不再用大标题压住森林 */}
      <div className="corner-title">
        <h1>{profile.forestName || '林 间'}</h1>
        <p className="corner-latin">{profile.forestLatin}</p>
        {profile.lede && <p className="corner-lede">{profile.lede}</p>}
      </div>

      {/* 入口常驻：底部一条细字小径，与 3D 路标一一对应 */}
      <nav className="trail" aria-label="栏目">
        {sections.map((item, i) => (
          <button
            key={item.id}
            className={`trail-item ${selected === item.id ? 'is-active' : ''}`}
            onClick={() => onSelect(selected === item.id ? null : item.id)}
            aria-pressed={selected === item.id}
          >
            <span className="trail-num">{String(i + 1).padStart(2, '0')}</span>
            <span className="trail-name">{item.label}</span>
            <span className="trail-en">{item.kicker}</span>
          </button>
        ))}
      </nav>

      <div className="corner-meta">
        {profile.hint && <p className="hint">{profile.hint}</p>}
        {profile.credit && <p className="credit">{profile.credit}</p>}
      </div>

      {/* 内容面板：一层薄雾，森林继续透出来 */}
      <aside className={`leaf-panel ${section ? 'is-open' : ''}`} aria-hidden={!section}>
        {section && (
          <>
            <button className="panel-close" onClick={() => onSelect(null)} aria-label="关闭">
              ×
            </button>
            <p className="panel-kicker">{String(section.kicker || '').toUpperCase()}</p>
            <h2>{section.title}</h2>
            <p className="panel-desc">{section.desc}</p>
            <div className="panel-rule" />

            {selected === 'about' ? (
              <div className="about-body">
                {aboutParagraphs.map((paragraph, index) => (
                  <p key={index}>{paragraph}</p>
                ))}
                {aboutLinks.length > 0 && (
                  <div className="about-links">
                    {aboutLinks.map((link) => (
                      <a key={link.label} href={link.url} target="_blank" rel="noreferrer">
                        {link.label} ↗
                      </a>
                    ))}
                  </div>
                )}
                {posts[0] && (
                  <button className="about-full" onClick={() => onRead({ ...posts[0], section })}>
                    读关于页整篇原文 <span aria-hidden="true">↗</span>
                  </button>
                )}
                {outsidePages.length > 0 && (
                  <div className="outside-pages">
                    <p className="outside-title">自己做的站 · 原站页面</p>
                    {outsidePages.map((page) => (
                      <a key={page.url} href={page.url} target="_blank" rel="noreferrer">
                        <b>{page.title}</b>
                        <span>{page.desc}</span>
                        <i aria-hidden="true">↗</i>
                      </a>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <>
                {posts.length > 3 && (
                  <input
                    className="panel-search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder={`在 ${posts.length} 篇里找…`}
                    aria-label="筛选文章"
                  />
                )}
                <div className="post-list">
                  {grouped.map(([year, list]) => (
                    <div className="year-group" key={year}>
                      <p className="year-head">
                        <span>{year}</span>
                        <i>{list.length} 篇</i>
                      </p>
                      {list.map((post) => (
                        <button
                          key={post.id}
                          className="post-row"
                          onClick={() => onRead({ ...post, section })}
                        >
                          <span className="post-date">
                            {formatDate(post.date)}
                            {post.variant && <em className="post-badge">{post.variant}</em>}
                            {post.minutes ? <em className="post-min">{post.minutes} min</em> : null}
                          </span>
                          <span className="post-title">{post.title}</span>
                          <span className="post-excerpt">{post.excerpt}</span>
                        </button>
                      ))}
                    </div>
                  ))}
                  {filtered.length === 0 && <p className="panel-empty">没有匹配的文章。</p>}
                </div>
              </>
            )}

            {stats && (
              <p className="panel-footer">
                全量镜像 · 共 {stats.total} 篇 · {stats.images} 张图
              </p>
            )}
          </>
        )}
      </aside>

      {reader && (
        <div className="reader" role="dialog" aria-modal="true" aria-label={reader.title}>
          <div className="reader-scrim" onClick={onCloseReader} />
          <article className="reader-paper">
            <button className="reader-back" onClick={onCloseReader}>
              ← 回到林子
            </button>
            <p className="reader-kicker">
              {reader.section?.kicker} · {formatDate(reader.date)}
              {reader.minutes ? ` · 约 ${reader.minutes} 分钟` : ''}
            </p>
            <h1>{reader.title}</h1>
            {(reader.tags || []).length > 0 && (
              <div className="reader-meta">
                {reader.tags.map((tag) => (
                  <span key={tag}>{tag}</span>
                ))}
              </div>
            )}
            <div className="reader-body" dangerouslySetInnerHTML={{ __html: readerHtml }} />
            {reader.sourceUrl && (
              <a className="reader-source" href={reader.sourceUrl} target="_blank" rel="noreferrer">
                原文：{reader.source} ↗
              </a>
            )}
            {profile.readerNote && <p className="reader-note">{profile.readerNote}</p>}
          </article>
        </div>
      )}
    </div>
  )
}
