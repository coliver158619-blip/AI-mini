"""Public Open-Meteo geocoding and forecast adapter, no API key required."""

import json
import math
import os
from threading import Lock
import time
from urllib.parse import urlencode
from urllib.request import Request, urlopen


def fetch_json(base_url, params, timeout=10):
    req = Request(base_url + "?" + urlencode(params), headers={"Accept": "application/json", "User-Agent": "MusicCompanion-H5/1.0"})
    with urlopen(req, timeout=timeout) as response:
        return json.loads(response.read(1_000_000))


_reverse_lock = Lock()
_reverse_cache = {}
_reverse_next_request = 0.0


def reverse_location(latitude, longitude):
    """User-triggered Photon lookup: bounded cache, one request/second at most.

    Public instance usage: https://github.com/komoot/photon#demo-server
    Set PHOTON_REVERSE_URL to switch to a private instance when needed.
    """
    global _reverse_next_request
    key = (round(latitude, 4), round(longitude, 4))
    with _reverse_lock:
        cached = _reverse_cache.get(key)
        if cached and time.monotonic() - cached[0] < 86400:
            return dict(cached[1])
        time.sleep(max(0, _reverse_next_request - time.monotonic()))
        _reverse_next_request = time.monotonic() + 1.0
        data = fetch_json(os.getenv("PHOTON_REVERSE_URL", "https://photon.komoot.io/reverse"), {"lat": latitude, "lon": longitude, "limit": 1}, timeout=6)
        features = data.get("features", [])
        if not isinstance(features, list) or not features:
            raise ValueError("No city at these coordinates")
        properties = features[0].get("properties", {})
        city = properties.get("city")
        if not city and properties.get("osm_value") in ("city", "town", "village", "municipality"):
            city = properties.get("name")
        if not isinstance(city, str) or not city.strip():
            raise ValueError("No city at these coordinates")
        result = {"city": city.strip()[:80], "locationSource": "Photon / OpenStreetMap"}
        if len(_reverse_cache) >= 128:
            _reverse_cache.pop(next(iter(_reverse_cache)))
        _reverse_cache[key] = (time.monotonic(), result)
        return dict(result)


def search_locations(query):
    data = fetch_json("https://geocoding-api.open-meteo.com/v1/search", {"name": query, "count": 6, "language": "zh", "format": "json"})
    return [{"id": item["id"], "name": item["name"], "city": item["name"], "country": item.get("country", ""), "admin1": item.get("admin1", ""), "latitude": item["latitude"], "longitude": item["longitude"]} for item in data.get("results", [])]


def describe(code):
    if code == 0:
        return "晴天"
    if code in (1, 2):
        return "多云"
    if code == 3:
        return "阴天"
    if code in (45, 48):
        return "雾天"
    if code in (51, 53, 55, 56, 57):
        return "细雨"
    if code in (61, 63, 80, 81):
        return "雨天"
    if code in (65, 66, 67, 82):
        return "大雨"
    if code in (71, 73, 77, 85):
        return "雪天"
    if code in (75, 86):
        return "大雪"
    if code in (95, 96, 99):
        return "雷雨"
    return "天气变化中"


def weather_greeting(city, condition, temperature, severe=False):
    if severe:
        return f"{city}现在是{condition}，外面的天气有点不乖。出门多留意天气提醒，别着急，我用几首温柔的歌陪着你。"
    if "雨" in condition:
        return f"{city}正在下雨，出门记得带伞。听听雨声也听听歌，让今天慢下来，我陪你。"
    if "雪" in condition:
        return f"{city}下雪啦，记得穿暖一点。给你选了几首温柔的旋律，把暖意留在耳边。"
    if temperature >= 33:
        return f"{city}今天有 {temperature:g}°C，天气热热的。给自己倒杯水，让清爽的旋律陪你休息一会儿。"
    if temperature <= 5:
        return f"{city}现在 {temperature:g}°C，有点冷呢。多添一件衣服，我给你挑几首暖暖的歌。"
    if condition == "晴天":
        return f"{city}今天晴朗，阳光正好。把好天气装进耳机，和我一起听首轻快的歌吧。"
    return f"{city}现在是{condition}，{temperature:g}°C。不管窗外是什么颜色，我都在这里陪你听歌。"


def finite_number(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def get_weather(latitude, longitude, city):
    location = {}
    if city in ("你所在的位置", "当前位置", ""):
        try:
            location = reverse_location(latitude, longitude)
            city = location.pop("city")
        except (OSError, ValueError, KeyError, TypeError, AttributeError):
            city = "当前位置"
            location["locationNotice"] = "已获取坐标，但暂时无法识别城市；天气仍来自此坐标，可手动选择城市。"
    data = fetch_json("https://api.open-meteo.com/v1/forecast", {"latitude": latitude, "longitude": longitude, "current": "temperature_2m,weather_code,precipitation,wind_speed_10m,is_day,apparent_temperature,relative_humidity_2m", "daily": "temperature_2m_max,temperature_2m_min", "forecast_days": 1, "timezone": "auto"})
    current = data.get("current", {})
    code, temperature = int(current["weather_code"]), float(current["temperature_2m"])
    if not math.isfinite(temperature):
        raise ValueError("Invalid weather temperature")
    condition = describe(code)
    wind = current.get("wind_speed_10m")
    windy = finite_number(wind) and wind >= 50
    severe = code in (65, 67, 75, 82, 86, 95, 96, 99) or windy
    if windy and code not in (65, 67, 75, 82, 86, 95, 96, 99):
        condition = "大风"
    result = {"city": city, "condition": condition, "temperature": round(temperature, 1), "code": code, "greeting": weather_greeting(city, condition, temperature, severe), "latitude": latitude, "longitude": longitude, "weatherTime": current.get("time"), "severe": severe, "source": "Open-Meteo", "cached": False, **location}
    if current.get("is_day") in (0, 1):
        result["isDay"] = bool(current["is_day"])
    for key, source in (("feelsLike", "apparent_temperature"), ("humidity", "relative_humidity_2m"), ("windSpeed", "wind_speed_10m"), ("precipitation", "precipitation")):
        value = current.get(source)
        if finite_number(value) and (key != "humidity" or 0 <= value <= 100):
            result[key] = round(value, 1)
    daily = data.get("daily") if isinstance(data.get("daily"), dict) else {}
    dates = daily.get("time", [])
    observed_day = str(current.get("time", ""))[:10]
    for key, source in (("high", "temperature_2m_max"), ("low", "temperature_2m_min")):
        values = daily.get(source)
        if isinstance(dates, list) and dates and dates[0] == observed_day and isinstance(values, list) and values and finite_number(values[0]):
            result[key] = round(values[0], 1)
    if isinstance(data.get("timezone"), str) and data["timezone"]:
        result["timezone"] = data["timezone"]
    if isinstance(data.get("utc_offset_seconds"), int) and not isinstance(data["utc_offset_seconds"], bool):
        result["utcOffsetSeconds"] = data["utc_offset_seconds"]
    return result
