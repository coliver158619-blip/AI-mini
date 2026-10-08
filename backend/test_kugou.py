"""Offline contracts for the assistant adapter; all credentials are synthetic."""

import hashlib
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from urllib.parse import parse_qs, urlsplit

from backend.kugou import KugouClient, parse_sse, read_local_config


FIXTURE_CONFIG = """GATEWAY_PROD = 'https://assistant-prod.example.invalid'
HOST_PROD = 'assistant-prod.example.invalid'
SALT_PROD = 'test-only-prod-salt'
GATEWAY = 'https://assistant-test.example.invalid'
HOST = 'assistant-test.example.invalid'
SALT_TEST = 'test-only-test-salt'
CLIENTVER = 12500
DFID = 'test-dfid'
MID = 'test-mid'
SERVERID = 1596
USERID = 12345
"""


def sse(*events):
    return "\n\n".join("data: " + json.dumps(event, ensure_ascii=False) for event in events).encode("utf-8")


class KugouContractTest(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.directory = Path(directory.name)
        self.config_path = self.directory / "test.py"
        self.config_path.write_text(FIXTURE_CONFIG, encoding="utf-8")
        # Clear inherited PET_CHAT_* values so a local token or config cannot leak
        # into the test. Config discovery always resolves this temporary file.
        environment = patch.dict(os.environ, {
            "PET_CHAT_CONFIG_PATH": str(self.config_path),
            "PET_CHAT_ENV": "prod",
        }, clear=True)
        environment.start()
        self.addCleanup(environment.stop)
        network = patch("backend.kugou.build_opener", side_effect=AssertionError("Network is forbidden in adapter contract tests"))
        network.start()
        self.addCleanup(network.stop)

    def test_v2_signed_recommendation_preserves_chinese_context(self):
        client = KugouClient()
        self.assertTrue(client.enabled)
        self.assertEqual(client.protocol, "assistant-v2")
        self.assertEqual(client.config_source, "local-file")
        message = "推荐下班路上听的歌"
        history = [
            {"role": "user", "content": "我叫小雨，喜欢轻音乐。"},
            {"role": "assistant", "content": "记住啦，我们慢慢听。"},
            {"role": "system", "content": "这个角色不应进入请求上下文"},
        ]
        expected_body = {
            "query": "以下为本次对话最近的上下文，仅供理解当前问题：\n用户：我叫小雨，喜欢轻音乐。\n助手：记住啦，我们慢慢听。\n\n请回复用户当前问题：\n推荐下班路上听的歌",
            "role_name": message,
            "role_type": 1,
            "query_command": 10001,
            "query_command_extend": {"intention": "recommend"},
        }
        response = sse({"tag": "[TEXT]", "content": "小雨，带一首温柔的歌回家吧。"})
        with patch("backend.kugou.time.time", return_value=1900000000), patch.object(client, "request", return_value=response) as request:
            result = client.chat(message, history=history, session_id="synthetic-session", recommend=True)

        request.assert_called_once()
        url, body, headers, stage = request.call_args.args
        parsed_url = urlsplit(url)
        self.assertEqual(parsed_url.scheme, "https")
        self.assertEqual(parsed_url.netloc, "assistant-prod.example.invalid")
        self.assertEqual(parsed_url.path, "/v2/assistant/stream")
        params = {key: values[0] for key, values in parse_qs(parsed_url.query).items()}
        signature = params.pop("signature")
        self.assertEqual(params, {
            "appid": "1005", "business": "pet", "clienttime": "1900000000",
            "clientver": "12500", "dfid": "test-dfid", "mid": "test-mid",
            "serverid": "1596", "userid": "12345",
        })
        self.assertEqual(body, expected_body)
        # Independent protocol fixture: sorted query fields and compact UTF-8
        # JSON must be signed together, including the unescaped Chinese text.
        signed_query = "appid=1005business=petclienttime=1900000000clientver=12500dfid=test-dfidmid=test-midserverid=1596userid=12345"
        payload = json.dumps(expected_body, ensure_ascii=False, separators=(",", ":"))
        expected_signature = hashlib.md5(("test-only-prod-salt" + signed_query + payload + "test-only-prod-salt").encode("utf-8")).hexdigest()
        self.assertEqual(signature, expected_signature)
        self.assertEqual(headers["Host"], "assistant-prod.example.invalid")
        self.assertEqual(headers["KG-TID"], "10001")
        self.assertIn("text/event-stream", headers["Accept"])
        self.assertEqual(stage, "chat")
        self.assertEqual(result["reply"], "小雨，带一首温柔的歌回家吧。")
        self.assertEqual(client.state, "connected")

        with patch.object(client, "request", return_value=response) as request:
            client.chat("你好", recommend=False)
        self.assertEqual(request.call_args.args[1]["query"], "你好")
        self.assertNotIn("query_command_extend", request.call_args.args[1])

    def test_sse_only_exposes_final_text_songs_and_quick_commands(self):
        events = sse(
            {"tag": "[THINK]", "content": "不要展示的推理"},
            {"tag": "[INNER]", "content": "不要展示的内部事件"},
            {"tag": "[TEXT]", "content": "你好，"},
            {"tag": "[JSON]", "content": json.dumps({"msgtype": 9012, "song_list": [
                {"mixsongid": "song-1", "ori_song_name": "第一版歌名"},
                {"mixsongid": "song-2", "ori_song_name": "夜风"},
                {"ori_song_name": "缺少歌曲编号"}, "无效项",
            ]}, ensure_ascii=False)},
            {"tag": "[JSON]", "content": {"msgtype": 9012, "song_list": [{"mixsongid": "song-1", "ori_song_name": "晚霞"}]}},
            {"tag": "[JSON]", "content": {"msgtype": 9015, "quick_command": [
                {"content": "换一首"}, {"content": 123}, {"content": "再聊聊"},
                {"content": "想放松"}, {"content": "超过展示上限"},
            ]}},
            {"tag": "[DONE]", "content": "不能当作回复"},
        )
        raw = b": heartbeat\n\nevent: message\n\ndata: not-json\n\n" + events + b"\n\ndata: [DONE]\n\n" + sse(
            {"tag": "[TEXT]", "content": "一起听首歌吧。"},
            {"tag": "[END]", "content": ""},
            {"tag": "[TEXT]", "content": "结束之后的内容不可展示"},
        )
        result = parse_sse(raw)
        self.assertEqual(result["reply"], "你好，一起听首歌吧。")
        self.assertEqual(result["songs"], [
            {"mixsongid": "song-1", "ori_song_name": "晚霞"},
            {"mixsongid": "song-2", "ori_song_name": "夜风"},
        ])
        self.assertEqual(result["quickCommands"], ["换一首", "再聊聊", "想放松"])
        self.assertIsNone(result["errorCode"])

    def test_environment_selects_gateway_and_timestamp_field(self):
        for environment, gateway, salt, time_field in (
            ("prod", "https://assistant-prod.example.invalid", "test-only-prod-salt", "clienttime"),
            ("test", "https://assistant-test.example.invalid", "test-only-test-salt", "servertime"),
        ):
            with self.subTest(environment=environment), patch.dict(os.environ, {"PET_CHAT_ENV": environment}):
                config = read_local_config(self.config_path)
                self.assertEqual(config["base_url"], gateway)
                self.assertEqual(config["host"], urlsplit(gateway).netloc)
                self.assertEqual(config["appkey"], salt)
                self.assertEqual(config["time_field"], time_field)

    def test_script_expressions_are_never_executed_or_loaded_as_config(self):
        marker = self.directory / "must-not-exist.txt"
        expression = f"__import__('pathlib').Path({str(marker)!r}).write_text('executed')"
        cases = (
            (FIXTURE_CONFIG + f"\n{expression}\nMID = {expression}\n", {
                "protocol": "assistant-v2", "mid": "test-mid", "appkey": "test-only-prod-salt",
            }, ("password",)),
            (f"""{expression}
DEFAULT_CONFIG = {{
    'base_url': 'https://legacy.example.invalid',
    'appkey': 'test-only-legacy-key',
    'userid': 12345,
    'token': 'test-only-legacy-token',
    'password': {expression},
    'mid': 'not-' + 'a-literal',
    'unexpected_field': 'ignored',
}}
""", {"base_url": "https://legacy.example.invalid", "appkey": "test-only-legacy-key", "userid": 12345}, ("password", "mid", "unexpected_field")),
        )
        for source, expected, excluded in cases:
            with self.subTest(protocol=expected.get("protocol", "pet-v1")):
                self.config_path.write_text(source, encoding="utf-8")
                config = read_local_config(self.config_path)
                self.assertFalse(marker.exists())
                for key, value in expected.items():
                    self.assertEqual(config[key], value)
                for key in excluded:
                    self.assertNotIn(key, config)


if __name__ == "__main__":
    unittest.main()
