import { useId, type CSSProperties } from 'react';
import './weather-scene.css';

type SceneKey = 'guangzhou' | 'shanghai' | 'beijing' | 'shenzhen' | 'chengdu' | 'hangzhou' | 'chongqing' | 'wuhan' | 'xian' | 'nature';
type CityScene = { key: SceneKey; label: string };
type Props = { city: string; latitude?: number; longitude?: number; code: number; isDay?: boolean };

const cityScenes: { key: SceneKey; label: string; names: RegExp; latitude: number; longitude: number }[] = [
  { key: 'guangzhou', label: '广州 · 珠江与广州塔', names: /广州|廣州|\bguangzhou\b|\bcanton\b/i, latitude: 23.13, longitude: 113.26 },
  { key: 'shanghai', label: '上海 · 黄浦江与陆家嘴', names: /上海|\bshanghai\b/i, latitude: 31.23, longitude: 121.47 },
  { key: 'beijing', label: '北京 · 天坛', names: /北京|\bbeijing\b|\bpeking\b/i, latitude: 39.90, longitude: 116.41 },
  { key: 'shenzhen', label: '深圳 · 平安金融中心', names: /深圳|\bshenzhen\b/i, latitude: 22.55, longitude: 114.06 },
  { key: 'chengdu', label: '成都 · 锦江与安顺廊桥', names: /成都|\bchengdu\b/i, latitude: 30.66, longitude: 104.07 },
  { key: 'hangzhou', label: '杭州 · 西湖与雷峰塔', names: /杭州|\bhangzhou\b/i, latitude: 30.25, longitude: 120.15 },
  { key: 'chongqing', label: '重庆 · 江桥与山城', names: /重庆|重慶|\bchongqing\b/i, latitude: 29.56, longitude: 106.55 },
  { key: 'wuhan', label: '武汉 · 长江与黄鹤楼', names: /武汉|武漢|\bwuhan\b/i, latitude: 30.59, longitude: 114.31 },
  { key: 'xian', label: '西安 · 古城楼', names: /西安|\bxi['’\s-]?an\b/i, latitude: 34.26, longitude: 108.94 },
];

export function getCityScene(city: string, latitude?: number, longitude?: number): CityScene {
  const named = cityScenes.find(scene => scene.names.test(city));
  if (named) return { key: named.key, label: named.label };
  const unresolved = /^(?:当前位置|你所在的位置|我的位置|当前定位|current\s+location|your\s+location|unknown)?$/i.test(city.trim());
  if (unresolved && typeof latitude === 'number' && typeof longitude === 'number' && Number.isFinite(latitude) && Number.isFinite(longitude) && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180) {
    // A nearby coordinate can identify a city when geolocation only supplies “当前位置”.
    // Restrict the fallback to the urban area; distant cities keep their own neutral scenery.
    const nearby = cityScenes.find(scene => {
      const north = (latitude - scene.latitude) * 111.2;
      const east = (longitude - scene.longitude) * 111.2 * Math.cos(scene.latitude * Math.PI / 180);
      return Math.hypot(north, east) <= 40;
    });
    if (nearby) return { key: nearby.key, label: nearby.label.split(' · ')[1] };
  }
  return { key: 'nature', label: '远山与水岸' };
}

function weatherKind(code: number) {
  if (code === 0) return 'clear';
  if (code === 1 || code === 2) return 'partly-cloudy';
  if (code === 45 || code === 48) return 'fog';
  if ([71, 73, 75, 77, 85, 86].includes(code)) return 'snow';
  if ([95, 96, 99].includes(code)) return 'storm';
  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return 'rain';
  return 'overcast';
}

function Pagoda({ x, y, levels = 3, width = 70 }: { x: number; y: number; levels?: number; width?: number }) {
  return <g transform={`translate(${x} ${y})`}>
    <path className="scene-detail" d="M0 -13V0" />
    <circle className="scene-gold" cx="0" cy="-14" r="2" />
    {Array.from({ length: levels }, (_, index) => {
      const w = width * (.64 + .36 * index / Math.max(1, levels - 1));
      const top = index * 23;
      return <g key={index}>
        <path className="scene-structure" d={`M${-w * .34} ${top + 2}H${w * .34}V${top + 25}H${-w * .34}Z`} />
        <path className="scene-roof" d={`M${-w / 2} ${top + 8}Q${-w * .27} ${top + 9} 0 ${top - 8}Q${w * .27} ${top + 9} ${w / 2} ${top + 8}L${w * .42} ${top + 13}H${-w * .42}Z`} />
        <path className="scene-gold-stroke" d={`M${-w * .42} ${top + 13}H${w * .42}`} />
        {[-.22, 0, .22].map(pos => <path key={pos} className="scene-window" d={`M${w * pos} ${top + 17}v6`} />)}
      </g>;
    })}
  </g>;
}

function Landmark({ scene, windows }: { scene: SceneKey; windows: string }) {
  switch (scene) {
    case 'guangzhou': return <g>
      <path className="scene-structure" d="M144 234V122L164 111L183 123V234ZM365 234V150H396V234Z" />
      <path className="scene-glass" d="M144 126H183V233H144Z" fill={windows} />
      <path className="scene-detail" d="M155 123V231M169 120V231M375 158V231M384 158V231" />
      <path className="scene-gold-stroke" d="M303 55V90" />
      <path className="scene-tower" d="M293 90Q321 154 281 233H324Q286 153 314 90Z" />
      <path className="scene-tower-thread" d="M293 90Q282 155 324 233M300 90Q293 155 312 233M307 90Q307 155 293 233M314 90Q324 155 281 233M291 111H316M292 130H312M292 149H310M290 169H313M287 190H316M283 211H321" />
      <ellipse className="scene-gold" cx="303" cy="90" rx="12" ry="3" />
      <path className="scene-bank" d="M68 236Q140 213 217 234T450 235V247H68Z" />
    </g>;
    case 'shanghai': return <g>
      <path className="scene-structure" d="M273 232V128L287 90L305 119V232ZM322 232V86L346 74L361 86V232ZM378 232V117H410V232Z" />
      <path className="scene-detail" d="M286 101L287 232M298 121V232M330 94L352 83M328 116L355 105M328 141L355 130M328 168L355 157M328 194L355 184M387 129H401V151H387Z" />
      <path className="scene-glass" d="M273 157H305V232H273Z" fill={windows} />
      <path className="scene-tower" d="M191 234L207 142L219 234M202 135V102H211V135M205 86V60" />
      <ellipse className="scene-pearl" cx="207" cy="100" rx="9" ry="11" />
      <circle className="scene-pearl" cx="207" cy="144" r="19" />
      <path className="scene-gold-stroke" d="M189 142Q207 152 225 142M198 99H215M191 234H223" />
      <path className="scene-structure" d="M100 233V189H133V233M64 233V207H89V233" />
    </g>;
    case 'beijing': return <g>
      <path className="scene-garden" d="M0 228Q35 181 66 221Q104 181 143 227Q373 204 480 223V249H0Z" />
      <path className="scene-stone" d="M151 235H365V228H352V219H164V228H151ZM177 219H339V210H177Z" />
      <path className="scene-structure" d="M212 168H304V210H212Z" />
      <path className="scene-window" d="M224 177V205M240 177V205M258 177V205M276 177V205M292 177V205" />
      <path className="scene-temple-roof" d="M187 169Q211 164 258 139Q305 164 329 169L316 177H200ZM199 146Q221 139 258 119Q295 139 317 146L306 153H210ZM213 122Q236 111 258 96Q280 111 303 122L296 130H220Z" />
      <path className="scene-gold-stroke" d="M202 177H314M212 153H304M223 130H293M258 94V87" />
      <circle className="scene-gold" cx="258" cy="85" r="4" />
      <path className="scene-detail" d="M159 231H357M174 221H343M186 213H330" />
    </g>;
    case 'shenzhen': return <g>
      <path className="scene-structure" d="M133 232V152H171V232ZM190 232V186H222V232ZM267 232V126L281 76L296 126V232ZM322 232V166H357V232ZM374 232V188H412V232Z" />
      <path className="scene-facade" d="M269 126L281 77L294 126L288 232H276Z" />
      <path className="scene-detail" d="M281 79V232M267 142H296M267 165H296M269 189H294M271 212H292M144 160V232M158 160V232M335 171V232M346 171V232" />
      <path className="scene-glass" d="M133 155H170V230H133ZM323 170H356V230H323Z" fill={windows} />
      <path className="scene-bank" d="M0 233Q112 224 210 237Q350 218 480 231V254H0Z" />
    </g>;
    case 'chengdu': return <g>
      <path className="scene-garden" d="M0 236Q25 190 53 226Q74 188 106 231L390 237Q424 188 450 222L480 206V250H0Z" />
      <path className="scene-stone" fillRule="evenodd" d="M103 211H391V242H361Q346 209 331 242H275Q250 203 225 242H169Q154 209 139 242H103Z" />
      <path className="scene-structure" d="M128 179H368V212H128Z" />
      {[142, 165, 189, 213, 236, 259, 282, 307, 333, 355].map(x => <path key={x} className="scene-window" d={`M${x} 186V207`} />)}
      <path className="scene-roof" d="M112 180Q155 172 186 162L211 175H287L313 162Q343 172 382 180L373 187H122Z" />
      <Pagoda x={249} y={138} levels={2} width={86} />
      <path className="scene-gold-stroke" d="M117 186H381M108 212H388" />
    </g>;
    case 'hangzhou': return <g>
      <path className="scene-distant-hill" d="M0 236Q78 155 171 212Q267 175 358 218Q419 177 480 203V252H0Z" />
      <path className="scene-garden" d="M275 235Q324 192 380 218L480 225V247H275Z" />
      <Pagoda x={331} y={111} levels={5} width={60} />
      <path className="scene-bank" d="M0 249Q105 226 177 239Q91 239 0 264Z" />
      {[151, 201, 248].map((x, i) => <g key={x} transform={`translate(${x} ${253 + (i % 2) * 9})`}><path className="scene-stone" d="M-4 0V-13H4V0M-7 -12H7L0 -21Z" /><path className="scene-gold-stroke" d="M-5 -13H5" /></g>)}
    </g>;
    case 'chongqing': return <g>
      <path className="scene-distant-hill" d="M0 220Q77 114 177 181Q286 111 391 169L480 191V246H0Z" />
      <path className="scene-structure" d="M71 211V164H94V211M108 207V141H132V207M141 219V157H167V219M312 188V108H331V184M337 183V98H356V185M363 187V115H383V191M389 193V135H408V199" />
      <path className="scene-glass" d="M313 116H330V179H313ZM338 107H355V180H338ZM364 124H382V185H364Z" fill={windows} />
      <path className="scene-roof" d="M305 110L325 103H399V110Z" />
      <path className="scene-bridge" d="M42 240Q222 132 431 240M42 241H431M69 229V249M405 229V249" />
      <path className="scene-bridge-cables" d="M92 216V240M128 201V240M165 191V240M201 185V240M238 185V240M275 188V240M312 195V240M349 207V240M385 223V240" />
    </g>;
    case 'wuhan': return <g>
      <path className="scene-garden" d="M100 239Q205 199 332 214L452 245H100Z" />
      <path className="scene-stone" d="M213 230H347V221H213Z" />
      <Pagoda x={280} y={100} levels={5} width={95} />
      <path className="scene-bridge" d="M0 245L153 244M19 244V258M66 244V256M119 244V253" />
    </g>;
    case 'xian': return <g>
      <path className="scene-garden" d="M0 236Q23 204 65 226Q97 202 130 234L401 234Q442 195 480 222V251H0Z" />
      <path className="scene-stone" d="M100 237V195H144V202H158V195H176V202H192V195H324V202H340V195H357V202H373V195H415V237Z" />
      <path className="scene-structure" d="M190 199V160H330V199Z" />
      <path className="scene-roof" d="M168 163Q205 157 261 135Q310 156 351 163L336 173H184ZM193 137Q223 130 261 112Q298 130 329 137L317 146H204Z" />
      <path className="scene-gold-stroke" d="M184 173H335M204 146H318M261 112V105" />
      <path className="scene-window" d="M207 177V194M228 177V194M250 177V194M274 177V194M296 177V194M316 177V194" />
      <path className="scene-roof" d="M249 237V219Q261 199 273 219V237Z" />
    </g>;
    default: return <g>
      <path className="scene-distant-hill" d="M0 241L77 147L120 180L198 88L262 167L316 145L390 205L444 150L480 192V268H0Z" />
      <path className="scene-mountain-light" d="M198 88L162 158L184 146L202 155L214 146L233 157Z" />
      <path className="scene-garden" d="M0 208Q94 166 199 224Q102 213 0 260ZM480 209Q372 178 300 230Q420 210 480 255Z" />
      <path className="scene-bank" d="M0 234Q95 220 168 243L0 265ZM480 243Q402 221 338 248L480 267Z" />
      {[26, 49, 441, 462].map((x, i) => <path key={x} className="scene-tree" d={`M${x} ${210 - i % 2 * 12}l-12 24h7l-10 15h12v14h6v-14h12l-10-15h7Z`} />)}
    </g>;
  }
}

export default function WeatherScene({ city, latitude, longitude, code, isDay }: Props) {
  const scene = getCityScene(city, latitude, longitude);
  const kind = weatherKind(code);
  const hasPlaza = scene.key === 'beijing' || scene.key === 'xian';
  const id = `scene-${useId().replace(/:/g, '')}`;
  const precipitation = kind === 'snow' ? 'snow' : kind === 'rain' || kind === 'storm' ? 'rain' : null;
  return <div className="weather-scene" data-scene={scene.key} data-weather={kind} data-period={isDay === undefined ? 'unknown' : isDay ? 'day' : 'night'} aria-hidden="true">
    <div className="weather-scene-sky" />
    <div className="weather-scene-stars">{Array.from({ length: 26 }, (_, i) => <i key={i} style={{ left: `${(i * 37 + 9) % 97}%`, top: `${(i * 19 + 5) % 73}%`, opacity: .25 + i % 4 * .15, width: i % 5 === 0 ? 2 : 1, height: i % 5 === 0 ? 2 : 1 }} />)}</div>
    <div className="weather-scene-celestial" />
    <div className="weather-scene-cloud weather-scene-cloud-back" />
    <div className="weather-scene-cloud weather-scene-cloud-front" />
    <svg className="weather-scene-landscape" viewBox="0 0 480 320" preserveAspectRatio="xMidYMax slice" focusable="false">
      <defs>
        <linearGradient id={`${id}-water`} x1="0" y1="0" x2="0" y2="1"><stop stopColor="var(--scene-water)" /><stop offset="1" stopColor="var(--scene-bottom)" /></linearGradient>
        <linearGradient id={`${id}-light`} x1="0" y1="0" x2="0" y2="1"><stop stopColor="var(--scene-glow)" stopOpacity=".26" /><stop offset="1" stopColor="var(--scene-glow)" stopOpacity="0" /></linearGradient>
        <pattern id={`${id}-windows`} width="9" height="12" patternUnits="userSpaceOnUse"><path d="M3 4h2v3H3Z" fill="var(--scene-glow)" opacity=".48" /></pattern>
      </defs>
      <path className="scene-horizon" d="M0 232Q85 181 167 210T345 205T480 209V268H0Z" />
      {scene.key !== 'nature' && !['beijing', 'hangzhou', 'xian'].includes(scene.key) && <g className="scene-far-buildings">{Array.from({ length: 19 }, (_, i) => <rect key={i} x={i * 28 - 15} y={181 + (i * 17) % 37} width={17 + i % 3 * 4} height={64 - (i * 17) % 37} rx="1" />)}</g>}
      <path d="M0 236H480V320H0Z" fill={`url(#${id}-water)`} />
      <Landmark scene={scene.key} windows={`url(#${id}-windows)`} />
      {hasPlaza ? <path className="scene-plaza" d="M233 240L169 320M263 240V320M293 240L357 320M0 255H480M0 281H480M0 316H480" /> : <>
        <ellipse cx="274" cy="279" rx="76" ry="40" fill={`url(#${id}-light)`} className="weather-scene-reflection" />
        <g className="scene-water-lines"><path d="M238 248h55m-102 8h31m75 4h33m-90 5h48m-126 7h37m94 7h57m-128 5h49m-185 9h39m217 4h64m-155 10h57" /><path d="M21 260h33m35 18h44m226-27h27m14 23h41m-319 30h36" /></g>
      </>}
      <path className="scene-foreground" d="M0 300Q76 293 127 320H0ZM480 290Q419 285 361 320H480Z" />
    </svg>
    <div className="weather-scene-mist weather-scene-mist-back" />
    <div className="weather-scene-mist weather-scene-mist-front" />
    {precipitation && <div className={`weather-scene-precipitation weather-scene-${precipitation}`}>{Array.from({ length: precipitation === 'snow' ? 32 : 38 }, (_, i) => <i key={i} style={{ '--x': `${(i * 29 + 3) % 103}%`, '--y': `${(i * 23 + 9) % 98}%`, '--delay': `${-(i * 1.73) % 13}s`, '--duration': `${precipitation === 'snow' ? 7 + i % 7 : .8 + i % 4 * .14}s`, '--size': `${2 + i % 3}px`, '--opacity': .22 + i % 4 * .13 } as CSSProperties} />)}</div>}
    {kind === 'storm' && <div className="weather-scene-lightning"><svg viewBox="0 0 480 500" focusable="false"><path d="M368 108L346 165L365 160L339 223" /></svg></div>}
    <div className="weather-scene-bottom" />
  </div>;
}
