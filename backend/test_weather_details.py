"""Real-field weather parsing and GPS city resolution contracts."""

import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from backend.app import create_app
from backend import weather


FORECAST = {
    "timezone": "Asia/Shanghai", "utc_offset_seconds": 28800,
    "current": {"weather_code": 0, "temperature_2m": 24.2, "is_day": 0,
                "apparent_temperature": 25.6, "relative_humidity_2m": 73,
                "wind_speed_10m": 7.8, "precipitation": 0, "time": "2026-10-01T20:00"},
    "daily": {"time": ["2026-10-01"], "temperature_2m_max": [30.1], "temperature_2m_min": [21.4]},
}
REVERSE = {"features": [{"properties": {"city": "广州市", "district": "天河区", "country": "中国"}}]}


class WeatherDetailsTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.config = {"TESTING": True, "DATABASE": str(Path(self.temp.name) / "weather.sqlite3"), "SEED_DEMO": False, "PET_CHAT_MODE": "local"}
        self.client = create_app(self.config).test_client()
        weather._reverse_cache.clear()
        weather._reverse_next_request = 0
        sleep = patch("backend.weather.time.sleep")
        sleep.start()
        self.addCleanup(sleep.stop)

    def test_extended_fields_follow_provider_and_survive_restart(self):
        with patch("backend.weather.fetch_json", return_value=FORECAST) as fetch:
            response = self.client.post("/api/weather", json={"city": "广州", "latitude": 23.129, "longitude": 113.264})
        self.assertEqual(response.status_code, 200)
        data = response.json
        for key, value in {"isDay": False, "feelsLike": 25.6, "humidity": 73, "high": 30.1, "low": 21.4, "timezone": "Asia/Shanghai", "utcOffsetSeconds": 28800, "precipitation": 0}.items():
            self.assertEqual(data[key], value)
        params = fetch.call_args.args[1]
        self.assertIn("is_day", params["current"])
        self.assertIn("relative_humidity_2m", params["current"])
        self.assertEqual(params["daily"], "temperature_2m_max,temperature_2m_min")
        self.assertEqual(params["forecast_days"], 1)
        self.assertEqual(create_app(self.config).test_client().get("/api/bootstrap").json["weather"], data)

    def test_optional_unknown_or_invalid_values_are_not_invented(self):
        invalid = {"current": {"weather_code": 3, "temperature_2m": 18, "is_day": None, "apparent_temperature": None, "relative_humidity_2m": 120, "wind_speed_10m": None, "precipitation": None}, "daily": {"temperature_2m_max": [None], "temperature_2m_min": []}}
        with patch("backend.weather.fetch_json", return_value=invalid):
            result = weather.get_weather(23.129, 113.264, "广州")
        for key in ("isDay", "feelsLike", "humidity", "high", "low", "timezone", "utcOffsetSeconds", "windSpeed", "precipitation"):
            self.assertNotIn(key, result)
        mismatch = {**FORECAST, "daily": {"time": ["2026-10-02"], "temperature_2m_max": [33], "temperature_2m_min": [22]}}
        with patch("backend.weather.fetch_json", return_value=mismatch):
            result = weather.get_weather(23.129, 113.264, "广州")
        self.assertNotIn("high", result)
        self.assertNotIn("low", result)

    def test_gps_resolves_real_city_and_reuses_bounded_coordinate_cache(self):
        with patch("backend.weather.fetch_json", side_effect=[REVERSE, FORECAST, FORECAST]) as fetch:
            first = self.client.post("/api/weather", json={"city": "你所在的位置", "latitude": 23.129, "longitude": 113.264})
            second = self.client.post("/api/weather", json={"latitude": 23.129, "longitude": 113.264})
        self.assertEqual(first.status_code, 200)
        self.assertEqual(first.json["city"], "广州市")
        self.assertEqual(second.json["city"], "广州市")
        self.assertEqual(first.json["locationSource"], "Photon / OpenStreetMap")
        self.assertIn("广州市", first.json["greeting"])
        self.assertEqual(fetch.call_count, 3)
        self.assertEqual(fetch.call_args_list[0].kwargs["timeout"], 6)
        self.assertEqual(fetch.call_args_list[0].args[1], {"lat": 23.129, "lon": 113.264, "limit": 1})
        self.assertEqual(first.json["latitude"], 23.129)

    def test_failed_city_lookup_still_returns_actual_coordinate_weather(self):
        with patch("backend.weather.fetch_json", side_effect=[OSError("offline"), FORECAST]):
            response = self.client.post("/api/weather", json={"latitude": 23.129, "longitude": 113.264})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json["city"], "当前位置")
        self.assertIn("无法识别城市", response.json["locationNotice"])
        self.assertEqual(response.json["temperature"], 24.2)
        self.assertNotIn("locationSource", response.json)

    def test_no_address_result_cannot_be_invented_from_district(self):
        with patch("backend.weather.fetch_json", return_value={"features": [{"properties": {"district": "未知地区", "name": "某商店", "osm_value": "shop"}}]}):
            with self.assertRaises(ValueError):
                weather.reverse_location(0, 0)

    def test_old_snapshot_survives_weather_outage_without_new_fields(self):
        with patch("backend.weather.fetch_json", return_value={"current": {"weather_code": 61, "temperature_2m": 19}}):
            original = self.client.post("/api/weather", json={"city": "广州", "latitude": 23.129, "longitude": 113.264}).json
        with patch("backend.weather.fetch_json", side_effect=OSError("offline")):
            response = self.client.post("/api/weather", json={"latitude": 23.129, "longitude": 113.264})
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json["cached"])
        self.assertEqual(response.json["city"], original["city"])
        self.assertEqual(response.json["updatedAt"], original["updatedAt"])
        self.assertNotIn("high", response.json)
        self.assertEqual(create_app(self.config).test_client().get("/api/bootstrap").json["weather"]["temperature"], 19)


if __name__ == "__main__":
    unittest.main()
