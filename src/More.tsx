import { ChevronLeft, ChevronRight } from 'lucide-react'
import './more.css'
import type { Outfit, Personality, Profile } from './types'

export type MoreAction = 'reports' | 'scenes' | 'chat' | 'recommendations' | 'appearance' | 'personality'
type Props = { onBack: () => void; onAction: (action: MoreAction) => void; personality?: Personality; outfit?: Outfit; appearance?: Profile['appearance'] }

// Original reference artwork, kept unmodified. Coordinates use its 877 × 1793 canvas.
const artwork = {
  note: [255, 412, 137, 160],
  personality: [642, 414, 170, 160],
  chat: [499, 628, 280, 187],
  shirt: [560, 992, 208, 172],
  trophy: [259, 1372, 150, 164],
  gift: [651, 1368, 167, 170],
  paw: [44, 272, 63, 58],
  gamepad: [44, 898, 68, 57],
  heart: [44, 1239, 68, 58],
} as const

function MoreArt({ kind, className = '' }: { kind: keyof typeof artwork; className?: string }) {
  const [x, y, width, height] = artwork[kind]
  return <span className={`more-art ${className}`} style={{ aspectRatio: `${width} / ${height}` }} aria-hidden="true">
    <img src="/assets/more-reference.png" alt="" draggable={false} style={{
      width: `${877 / width * 100}%`,
      left: `${-x / width * 100}%`,
      top: `${-y / height * 100}%`,
    }} />
  </span>
}

type CardProps = {
  action?: MoreAction
  kind?: 'personality' | 'appearance' | 'ranking' | 'blindbox'
  label: string
  description: string
  art: keyof typeof artwork
  wide?: boolean
  imageUrl?: string
  onAction: Props['onAction']
}

function MoreCard({ action, kind, label, description, art, wide, imageUrl, onAction }: CardProps) {
  return <button className={`more-card more-card-${action ?? kind}${wide ? ' more-card-wide' : ''}`}
    aria-label={label} aria-description={!action ? '暂未开放' : undefined} disabled={!action}
    onClick={() => action && onAction(action)}>
    <span className="more-card-copy"><strong>{label === 'AI聊天' ? 'AI 聊天' : label}</strong><span>{description}</span></span>
    <ChevronRight className="more-card-arrow" strokeWidth={2.4} aria-hidden="true" />
    {imageUrl ? <span className="more-card-art more-character-art" aria-hidden="true"><img src={imageUrl} alt="" draggable={false}/></span> : <MoreArt kind={art} className="more-card-art" />}
  </button>
}

export default function More({ onBack, onAction, personality, outfit, appearance }: Props) {
  const characterUrl = personality?.imageUrl || '/assets/music-images/INFP.webp'
  return <main className="more-page"><div className="more-content">
    <header className="more-header">
      <button className="more-back" aria-label="返回首页" onClick={onBack}><ChevronLeft strokeWidth={1.8} /></button>
      <h1>更多玩法</h1>
    </header>
    <section className="more-section" aria-labelledby="more-ai-title">
      <h2 id="more-ai-title"><MoreArt kind="paw" className="more-section-art" />AI 陪伴</h2>
      <div className="more-grid">
        <MoreCard action="reports" label="音乐报告" description="查看听歌报告" art="note" onAction={onAction} />
        <MoreCard action="personality" label="音乐形象" description={`当前 ${personality?.name || '梦幻流行'}`} art="personality" imageUrl={characterUrl} onAction={onAction} />
        <MoreCard action="chat" label="AI聊天" description="和搭子聊聊心情" art="chat" imageUrl={appearance?.imageUrl || characterUrl} wide onAction={onAction} />
      </div>
    </section>
    <section className="more-section" aria-labelledby="more-play-title">
      <h2 id="more-play-title"><MoreArt kind="gamepad" className="more-section-art" />陪伴玩法</h2>
      <div className="more-grid">
        <MoreCard action="appearance" label="形象" description={outfit ? `${outfit.tag} · ${outfit.name}` : "选人物，再选装扮"} imageUrl={outfit?.imageUrl} art="shirt" wide onAction={onAction} />
      </div>
    </section>
    <section className="more-section" aria-labelledby="more-events-title">
      <h2 id="more-events-title"><MoreArt kind="heart" className="more-section-art" />运营活动</h2>
      <div className="more-grid">
        <MoreCard kind="ranking" label="打榜" description="粉丝应援" art="trophy" onAction={onAction} />
        <MoreCard kind="blindbox" label="盲盒" description="限定装扮" art="gift" onAction={onAction} />
      </div>
    </section>
    <section className="more-section more-music-section" aria-labelledby="more-music-title">
      <h2 id="more-music-title"><MoreArt kind="paw" className="more-section-art" />音乐推荐</h2>
      <div className="more-grid">
        <MoreCard action="scenes" label="心情选歌" description="听见此刻心情" art="chat" onAction={onAction} />
        <MoreCard action="recommendations" label="为你推荐" description="发现想听的歌" art="note" onAction={onAction} />
      </div>
    </section>
  </div></main>
}

