import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudRain, CloudSun, Droplets, LoaderCircle, LocateFixed, MapPin, RefreshCw, Search, Snowflake, Sun, Thermometer } from 'lucide-react';
import WeatherScene, { getCityScene } from './WeatherScene';
import './weather.css';

export type WeatherData = {
  city: string;
  condition: string;
  temperature: number;
  code: number;
  greeting: string;
  updatedAt: string;
  latitude?: number;
  longitude?: number;
  cached?: boolean;
  notice?: string;
  isDay?: boolean;
  feelsLike?: number;
  humidity?: number;
  high?: number;
  low?: number;
  windSpeed?: number;
  precipitation?: number;
  weatherTime?: string;
  timezone?: string;
  severe?: boolean;
  locationNotice?: string;
};

type City = { id: number | string; name: string; city: string; country?: string; admin1?: string; latitude: number; longitude: number };
type WeatherLocation = { latitude: number; longitude: number; city: string };
type Props = { weather: WeatherData | null; onClose: () => void; onWeather: (weather: WeatherData) => void };

// WMO weather interpretation codes used by Open-Meteo.
export function WeatherIcon({ code, size = 22 }: { code: number; size?: number }) {
  const Icon = code === 0 ? Sun
    : code === 1 || code === 2 ? CloudSun
      : code === 3 ? Cloud
        : code === 45 || code === 48 ? CloudFog
          : [51, 53, 55, 56, 57].includes(code) ? CloudDrizzle
            : [61, 63, 65, 66, 67, 80, 81, 82].includes(code) ? CloudRain
              : [71, 73, 75, 77, 85, 86].includes(code) ? Snowflake
                : [95, 96, 99].includes(code) ? CloudLightning : Cloud;
  return <Icon size={size} aria-hidden="true" />;
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  let data;
  try { data = await response.json(); }
  catch { throw new Error('暂时连接不上天气服务，请稍后重试。'); }
  if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : data.error?.message || '暂时连接不上天气服务，请稍后重试。');
  return data as T;
}

function finite(value: number | undefined): value is number { return typeof value === 'number' && Number.isFinite(value); }

export default function Weather({ weather, onClose, onWeather }: Props) {
  const [selecting, setSelecting] = useState(!weather);
  const [query, setQuery] = useState('');
  const [cities, setCities] = useState<City[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [searchRetry, setSearchRetry] = useState(0);
  const [busy, setBusy] = useState<'locating' | 'weather' | null>(null);
  const [loadingCity, setLoadingCity] = useState('');
  const [weatherError, setWeatherError] = useState('');
  const [locationError, setLocationError] = useState('');
  const [lastLocation, setLastLocation] = useState<WeatherLocation | null>(null);
  const weatherRequest = useRef<AbortController | null>(null);
  const alive = useRef(true);
  const locationSequence = useRef(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      locationSequence.current += 1;
      weatherRequest.current?.abort();
    };
  }, []);

  useEffect(() => {
    const search = query.trim();
    setCities([]);
    setSearchError('');
    setSearched(false);
    if (!search) { setSearching(false); return; }
    setSearching(true);
    const controller = new AbortController();
    const timer = setTimeout(() => {
      request<{ results: City[] }>(`/api/location/search?q=${encodeURIComponent(search)}`, { signal: controller.signal })
        .then(data => { if (!controller.signal.aborted) { setCities(data.results); setSearched(true); } })
        .catch(error => { if (!controller.signal.aborted) setSearchError(error instanceof Error ? error.message : '城市搜索失败，请重试。'); })
        .finally(() => { if (!controller.signal.aborted) setSearching(false); });
    }, 350);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, searchRetry]);

  function close() {
    locationSequence.current += 1;
    weatherRequest.current?.abort();
    setBusy(null);
    if (weather && selecting) { setSelecting(false); setLocationError(''); setWeatherError(''); return; }
    onClose();
  }

  function changeCity() {
    locationSequence.current += 1;
    weatherRequest.current?.abort();
    setBusy(null);
    setSelecting(true);
    setWeatherError('');
    window.scrollTo({ top: 0 });
  }

  async function chooseLocation(location: WeatherLocation) {
    locationSequence.current += 1;
    weatherRequest.current?.abort();
    const controller = new AbortController();
    weatherRequest.current = controller;
    setBusy('weather');
    setLoadingCity(location.city);
    setLastLocation(location);
    setWeatherError('');
    setLocationError('');
    try {
      const weather = await request<WeatherData>('/api/weather', {
        method: 'POST', signal: controller.signal,
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(location),
      });
      if (!alive.current || controller.signal.aborted) return;
      onWeather(weather);
      setSelecting(false);
      setQuery('');
      window.scrollTo({ top: 0 });
    } catch (error) {
      if (!controller.signal.aborted && alive.current) setWeatherError(error instanceof Error ? error.message : '天气没有更新成功，请重试。');
    } finally {
      if (!controller.signal.aborted && alive.current) setBusy(null);
    }
  }

  function locate() {
    setLocationError('');
    setWeatherError('');
    if (!window.isSecureContext) {
      setLocationError('当前是 HTTP 局域网地址，浏览器不允许定位。电脑可使用本机入口；手机请手动选城，自动定位需要 HTTPS。');
      input.current?.focus();
      return;
    }
    if (!navigator.geolocation) {
      setLocationError('当前浏览器不支持定位，请在下方选择城市。');
      input.current?.focus();
      return;
    }
    const sequence = ++locationSequence.current;
    setBusy('locating');
    navigator.geolocation.getCurrentPosition(position => {
      if (!alive.current || sequence !== locationSequence.current) return;
      void chooseLocation({ latitude: position.coords.latitude, longitude: position.coords.longitude, city: '你所在的位置' });
    }, error => {
      if (!alive.current || sequence !== locationSequence.current) return;
      setBusy(null);
      const message = error.code === 1 ? '定位权限未开启，请在浏览器的网站设置中允许位置访问，或在下方手动选择城市。'
        : error.code === 3 ? '定位等待超时了，请重试或在下方选择城市。'
          : '暂时无法获取你的位置，请在下方选择城市。';
      setLocationError(message);
      input.current?.focus();
    }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 });
  }

  if (weather && !selecting) {
    const scene = getCityScene(weather.city, weather.latitude, weather.longitude);
    const period = weather.isDay === undefined ? 'unknown' : weather.isDay ? 'day' : 'night';
    const observation = weather.weatherTime?.replace('T', ' ').slice(5, 16);
    return <main className={`weather-page weather-details weather-details-period-${period}`} aria-labelledby="weather-title">
      <WeatherScene city={weather.city} latitude={weather.latitude} longitude={weather.longitude} code={weather.code} isDay={weather.isDay}/>
      <div className="weather-detail-content">
        <header className="weather-header"><button type="button" className="weather-back" aria-label="返回上一页" onClick={onClose}><ChevronLeft size={23}/></button><h1 id="weather-title">天气与位置</h1><button className="weather-switch-city" type="button" onClick={changeCity}><MapPin size={16}/>切换城市</button></header>
        <section className="weather-overview" aria-label={`${weather.city}天气`}>
          <h2>{weather.city}</h2>
          <p className="weather-temperature">{Math.round(weather.temperature)}<span>°</span></p>
          <p className="weather-condition"><WeatherIcon code={weather.code} size={20}/>{weather.condition}</p>
          {(finite(weather.high) || finite(weather.low)) && <p className="weather-high-low">{finite(weather.high) && <span>最高 {Math.round(weather.high)}°</span>}{finite(weather.low) && <span>最低 {Math.round(weather.low)}°</span>}</p>}
          <p className="weather-observed">{weather.cached ? '上次记录' : '最近更新'}{observation ? ` · ${observation}` : ''}</p>
        </section>
        <div className="weather-scene-caption"><span>{scene.label}</span><button type="button" onClick={() => { if (weather.latitude !== undefined && weather.longitude !== undefined) void chooseLocation({ latitude: weather.latitude, longitude: weather.longitude, city: weather.city }); }} disabled={busy !== null || weather.latitude === undefined || weather.longitude === undefined} aria-label="刷新天气"><RefreshCw size={15} className={busy === 'weather' ? 'weather-spin' : ''}/>{busy === 'weather' ? '更新中' : '刷新'}</button></div>
        <div className="weather-detail-cards">
          {weather.cached && <p className="weather-cache-notice" role="status">{weather.notice || '当前为上次获取的天气，请刷新查看最新情况。'}</p>}
          {weatherError && <div className="weather-detail-error" role="alert">{weatherError}<button type="button" onClick={() => { if (lastLocation) void chooseLocation(lastLocation); }}>重试</button></div>}
          {weather.locationNotice && <p className="weather-cache-notice">{weather.locationNotice}</p>}
          <section className={`weather-today-card${weather.severe ? ' weather-today-severe' : ''}`}><div><WeatherIcon code={weather.code} size={20}/><h3>{weather.severe ? '天气提醒' : '此刻，与你同在'}</h3></div><p>{weather.greeting}</p></section>
          <div className="weather-metrics">
            {finite(weather.feelsLike) && <section><span><Thermometer size={16}/>体感温度</span><strong>{Math.round(weather.feelsLike)}<small>°</small></strong></section>}
            {finite(weather.humidity) && <section><span><Droplets size={16}/>相对湿度</span><strong>{Math.round(weather.humidity)}<small>%</small></strong></section>}
          </div>
        </div>
      </div>
    </main>;
  }

  return <main className="weather-page weather-sheet" aria-labelledby="weather-title">
    <header className="weather-header"><button type="button" className="weather-back" aria-label="返回上一页" onClick={close}><ChevronLeft size={23} /></button><h1 id="weather-title">天气与位置</h1></header>
    <p className="weather-description">选一个城市，让问候和今天的音乐更合心意。</p>
      <button type="button" className="weather-locate" onClick={locate} disabled={busy !== null}><span className="weather-location-symbol">{busy === 'locating' ? <LoaderCircle className="weather-spin" size={21} /> : <LocateFixed size={21} />}</span><span><strong>{busy === 'locating' ? '正在获取你的位置…' : '使用当前位置'}</strong><small>由你授权后获取，随时可以切换城市</small></span><ChevronRight size={18} /></button>
      {locationError && <div className="weather-error" role="alert"><p>{locationError}</p>{!window.isSecureContext && <a href={`http://127.0.0.1${window.location.port ? `:${window.location.port}` : ''}/`}>在本机电脑打开</a>}</div>}
      <h2 className="weather-search-heading">搜索城市</h2>
      <label className="weather-search-field"><Search size={18} /><input ref={input} value={query} onChange={event => setQuery(event.target.value)} type="search" placeholder="输入城市名，如广州" aria-label="搜索城市" maxLength={80} autoComplete="off" />{searching && <LoaderCircle className="weather-spin" size={17} />}</label>
      <div className="weather-common-cities" aria-label="常用城市">{['广州', '北京', '上海', '深圳', '成都'].map(city => <button key={city} type="button" className={query.trim() === city ? 'is-selected' : ''} disabled={busy !== null} onClick={() => { if (query === city) setSearchRetry(value => value + 1); else setQuery(city); }}>{city}</button>)}</div>
      <div className="weather-results" aria-live="polite" aria-busy={searching}>
        {searching ? <div className="weather-search-status"><LoaderCircle size={18} className="weather-spin" /> 正在寻找这座城市…</div>
          : searchError ? <div className="weather-search-failure"><p>{searchError}</p><button type="button" onClick={() => setSearchRetry(value => value + 1)}>重新搜索</button></div>
            : searched && cities.length === 0 ? <p className="weather-search-status">没有找到这座城市，试试完整城市名或拼音。</p>
              : cities.map(city => <button key={`${city.id}-${city.latitude}-${city.longitude}`} type="button" className="weather-city-result" disabled={busy !== null} onClick={() => { void chooseLocation({ latitude: city.latitude, longitude: city.longitude, city: city.city || city.name }); }}><MapPin size={18} /><span><strong>{city.city || city.name}</strong><small>{[city.admin1, city.country].filter(Boolean).join(' · ') || city.name}</small></span><ChevronRight size={17} /></button>)}
      </div>
      {busy === 'weather' && <div className="weather-loading" role="status"><LoaderCircle size={19} className="weather-spin" /><span>正在查看{loadingCity}的天气…</span></div>}
      {weatherError && <div className="weather-fetch-failure" role="alert"><p>{weatherError}</p>{lastLocation && <button type="button" onClick={() => { void chooseLocation(lastLocation); }}>重新获取天气</button>}</div>}
  </main>;
}
