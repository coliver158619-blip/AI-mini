"""Use the user's local Kugou config without executing it or logging secrets."""

import ast
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
from threading import RLock
import time
from urllib.error import HTTPError
from urllib.parse import urlencode, unquote, urlparse
from urllib.request import Request, build_opener, ProxyHandler


CONFIG_KEYS = ("base_url", "token_url", "appid", "area_code", "clientver", "dfid", "mid", "pet_name", "token", "userid", "password", "serverid", "clientip", "uuid", "kg_tid", "appkey", "host", "kmr_url", "protocol", "time_field")


def compact_json(value):
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def sign(params, body, key):
    """Match the supplied sign.py, including its backslash normalization."""
    params = dict(params)
    if "_NOR" in key:
        key = key.replace("_NOR", "")
        params.pop("r", None)
    if "reg_time" in params:
        params["reg_time"] = unquote(str(params["reg_time"]))
    query = "".join(f"{name}={params[name]}" for name in sorted(params))
    payload = compact_json(body)
    if "_NOBODY" in key:
        key = key.replace("_NOBODY", "")
        payload = ""
    elif "_256" in key:
        key = key.replace("_256", "")
        payload = payload.replace("\\\\\\", "\\")[:256]
    else:
        payload = payload.replace("\\\\\\", "\\").replace("\\\\", "\\")
    return hashlib.md5((key + query + payload + key).encode("utf-8")).hexdigest()


def read_local_config(path):
    """Read literal DEFAULT_CONFIG values only; never execute supplied code."""
    path = Path(path)
    if path.stat().st_size > 1_000_000:
        raise ValueError("Configuration file too large")
    source = path.read_text(encoding="utf-8-sig")
    if path.suffix.lower() == ".json":
        config = json.loads(source)
        if not isinstance(config, dict):
            raise ValueError("Configuration must be an object")
        return {key: value for key, value in config.items() if key in CONFIG_KEYS and isinstance(value, (str, int, float, bool))}
    nodes = ast.parse(source).body
    constants = {}
    for node in nodes:
        if isinstance(node, ast.Assign):
            try:
                value = ast.literal_eval(node.value)
            except (ValueError, TypeError):
                continue
            for target in node.targets:
                if isinstance(target, ast.Name) and isinstance(value, (str, int, float, bool)):
                    constants[target.id] = value
    if all(key in constants for key in ("GATEWAY_PROD", "HOST_PROD", "SALT_PROD", "USERID")):
        prod = os.getenv("PET_CHAT_ENV", "prod").lower() != "test"
        return {"protocol": "assistant-v2", "base_url": constants["GATEWAY_PROD" if prod else "GATEWAY"],
                "host": constants["HOST_PROD" if prod else "HOST"], "appkey": constants["SALT_PROD" if prod else "SALT_TEST"],
                "time_field": "clienttime" if prod else "servertime", "appid": "1005", "kg_tid": "10001", "kmr_url": "",
                **{key.lower(): constants[key] for key in ("CLIENTVER", "DFID", "MID", "SERVERID", "USERID")}}
    for node in nodes:
        if isinstance(node, ast.Assign) and any(isinstance(target, ast.Name) and target.id == "DEFAULT_CONFIG" for target in node.targets) and isinstance(node.value, ast.Dict):
            config = {}
            for key_node, value_node in zip(node.value.keys, node.value.values):
                try:
                    key, value = ast.literal_eval(key_node), ast.literal_eval(value_node)
                except (ValueError, TypeError):
                    continue
                if key in CONFIG_KEYS and isinstance(value, (str, int, float, bool)):
                    config[key] = value
            return config
    raise ValueError("Literal DEFAULT_CONFIG not found")


def discover_config():
    if os.getenv("PET_CHAT_CONFIG_PATH"):
        return Path(os.environ["PET_CHAT_CONFIG_PATH"]).expanduser()
    reference = Path(__file__).parent / "data" / "chat-config-path.txt"
    if reference.is_file():
        return Path(reference.read_text(encoding="utf-8-sig").strip()).expanduser()
    directory = os.getenv("KUGOU_PET_CHAT_DIR")
    if directory:
        root = Path(directory).expanduser()
        candidates = [root / "scripts" / "chat.py", root / "kugou-pet-chat" / "scripts" / "chat.py"]
        return next((candidate for candidate in candidates if candidate.is_file()), candidates[0])
    desktop = Path(os.environ.get("USERPROFILE", str(Path.home()))) / "Desktop" / "kugou-pet-chat"
    return next((candidate for candidate in (desktop / "kugou-pet-chat" / "scripts" / "chat.py", desktop / "scripts" / "chat.py") if candidate.is_file()), None)


def numeric_error_code(payload):
    if not isinstance(payload, dict):
        return None
    for key in ("errcode", "error_code", "code"):
        value = payload.get(key)
        if isinstance(value, (int, str)) and str(value).isdigit() and int(value) != 0:
            return str(value)[:10]
    error = payload.get("error")
    if isinstance(error, str):
        found = re.search(r"(?:错误原因|错误码|error\s*code)\s*[:：]?\s*(\d{3,10})", error, re.IGNORECASE)
        if found:
            return found.group(1)
    return None


class RemoteError(Exception):
    def __init__(self, stage, reason, code=None):
        self.stage, self.reason, self.code = stage, reason, code
        label = {"token": "酷狗登录", "chat": "酷狗聊天", "recommendation": "歌曲推荐", "kmr": "歌曲详情", "config": "酷狗接口配置"}.get(stage, "酷狗服务")
        suffix = f"（错误码 {code}）" if code else ""
        detail = {
            "unconfigured": "尚未就绪，请检查本地配置文件或环境变量",
            "invalid_config": "读取失败，请检查本机接口脚本路径及配置",
            "network": "暂时无法连接，请检查当前网络是否能访问服务",
            "timeout": "连接超时，请稍后重试",
            "auth": "未成功，请更新原文件中的登录凭据或设置有效的 PET_CHAT_TOKEN",
            "http": "返回错误，请稍后重试或检查接口配置",
            "response": "未返回有效最终回复，请检查服务状态",
            "no_songs": "暂未返回有效歌曲卡片，请重试或换个心情",
            "signature": "签名校验未通过，请检查接口脚本中的环境及签名配置",
        }.get(reason, "暂时不可用")
        self.public_message = f"{label}{suffix}{detail}。"
        super().__init__(self.public_message)


def parse_sse(raw):
    """Extract final [TEXT] and songs, never internal THINK events or raw data."""
    text, songs, quick = [], [], []
    code = None
    for line in raw.decode("utf-8", errors="replace").splitlines():
        if not line.strip().startswith("data:"):
            continue
        try:
            event = json.loads(line.strip()[5:].strip())
        except (json.JSONDecodeError, TypeError):
            continue
        if not isinstance(event, dict):
            continue
        code = code or numeric_error_code(event)
        tag, content = event.get("tag"), event.get("content")
        if tag == "[END]":
            break
        if tag == "[ERROR]":
            code = code or numeric_error_code({"error": str(content)})
        if tag == "[TEXT]" and isinstance(content, str):
            text.append(content)
        if tag in ("[JSON]", "[THINK_JSON]"):
            try:
                item = json.loads(content) if isinstance(content, str) else content
            except (json.JSONDecodeError, TypeError):
                continue
            if not isinstance(item, dict):
                continue
            if item.get("msgtype") == 9012 and isinstance(item.get("song_list"), list):
                songs.extend(s for s in item["song_list"] if isinstance(s, dict) and s.get("mixsongid"))
            elif item.get("msgtype") == 9015 and isinstance(item.get("quick_command"), list):
                quick.extend(c["content"] for c in item["quick_command"] if isinstance(c, dict) and isinstance(c.get("content"), str))
    if not text:
        try:
            code = code or numeric_error_code(json.loads(raw))
        except (ValueError, TypeError):
            pass
    return {"reply": "".join(text).strip(), "songs": list({str(s["mixsongid"]): s for s in songs}.values()), "quickCommands": quick[:3], "errorCode": code}


class KugouClient:
    def __init__(self, mode=None):
        self.local_mode = (mode or os.getenv("PET_CHAT_MODE", "auto")).lower() == "local"
        self.config = {"appid": "1005", "area_code": "1", "clientver": "11111", "pet_name": "乌萨奇", "kmr_url": "http://openapi.kugou.com/kmr/v2/audio", "serverid": 1596, "clientip": "127.0.0.1"}
        self.config_source, self.config_error = "none", None
        if not self.local_mode:
            path = discover_config()
            if path:
                try:
                    self.config.update(read_local_config(path))
                    self.config_source = "local-file"
                except (OSError, ValueError, SyntaxError, KeyError):
                    self.config_error = RemoteError("config", "invalid_config")
        for key in CONFIG_KEYS:
            env = "PET_CHAT_" + key.upper()
            if env in os.environ:
                self.config[key] = os.environ[env]
                self.config_source = "local-file+environment" if self.config_source.startswith("local-file") else "environment"
        self.base_url = str(self.config.get("base_url", "")).rstrip("/")
        self.protocol = self.config.get("protocol", "pet-v1")
        self.key, self.token, self.userid = (str(self.config.get(key, "")) for key in ("appkey", "token", "userid"))
        self.enabled = not self.local_mode and all((self.base_url, self.key, self.userid)) and bool(self.protocol == "assistant-v2" or self.token or (self.config.get("password") and self.config.get("token_url")))
        self.state = "disabled" if self.local_mode else "ready" if self.enabled else "error"
        self.last_error = self.config_error or (RemoteError("config", "unconfigured") if not self.enabled and not self.local_mode else None)
        self.last_checked = None
        self.auth_lock = RLock()

    def integration(self):
        detail = self.last_error.public_message if self.last_error else "已连接酷狗实时聊天接口" if self.state == "connected" else "已读取接口配置，首次对话时验证连接" if self.enabled else "当前明确选择本地演示推荐"
        return {"provider": "酷狗宠物聊天", "configured": bool(self.enabled), "state": self.state, "detail": detail, "configSource": self.config_source, "sessionPersistent": True, "lastCheckedAt": self.last_checked, "errorCode": self.last_error.code if self.last_error else None}

    def mode(self):
        return "local" if self.local_mode else "kugou" if self.state == "connected" else "kugou-error" if self.enabled and self.state == "error" else "kugou-pending" if self.enabled else "unconfigured"

    def fail(self, error):
        self.state, self.last_error = "error", error
        self.last_checked = datetime.now(timezone.utc).isoformat()
        return error

    def request(self, url, body, headers, stage, timeout=30):
        if urlparse(url).scheme not in ("http", "https"):
            raise RemoteError("config", "invalid_config")
        req = Request(url, data=compact_json(body).encode("utf-8"), headers={"Content-Type": "application/json", **headers}, method="POST")
        try:
            # The supplied script explicitly bypasses HTTP proxies for its gateway.
            with build_opener(ProxyHandler({})).open(req, timeout=timeout) as response:
                return response.read(2_000_000)
        except HTTPError as error:
            raise RemoteError(stage, "auth" if error.code in (401, 403) else "http", str(error.code)) from None
        except (TimeoutError, OSError) as error:
            timeout_error = isinstance(error, TimeoutError) or isinstance(getattr(error, "reason", None), TimeoutError)
            raise RemoteError(stage, "timeout" if timeout_error else "network") from None

    def ensure_token(self, force=False):
        with self.auth_lock:
            if self.token and not force:
                return
            if not self.config.get("password") or not self.config.get("token_url"):
                raise RemoteError("token", "auth")
            password = str(self.config["password"])
            try:
                body = {"username": self.userid, "serverid": int(self.config.get("serverid", 1596)), "clientip": str(self.config.get("clientip", "127.0.0.1")), "userid": int(self.userid) if self.userid.isdigit() else self.userid, "appid": int(self.config.get("appid", 1005)), "pwd": hashlib.md5(password.encode("utf-8")).hexdigest(), "mid": str(self.config.get("mid", ""))}
                payload = json.loads(self.request(str(self.config["token_url"]), body, {}, "token", timeout=15))
            except (ValueError, TypeError):
                raise RemoteError("token", "response") from None
            data = payload.get("data") if isinstance(payload, dict) else None
            token = (data.get("token") if isinstance(data, dict) else None) or (payload.get("token") if isinstance(payload, dict) else None)
            if not isinstance(token, str) or not token.strip():
                raise RemoteError("token", "auth", numeric_error_code(payload))
            self.token = token.strip()

    def params(self, session_id=None):
        return {**{key: str(self.config.get(key, "")) for key in ("appid", "area_code", "clientver", "dfid", "mid", "pet_name")}, "clienttime": str(int(time.time())), "token": self.token, "userid": self.userid, "uuid": session_id or str(self.config.get("uuid", "h5-companion"))}

    def post(self, url, params, body, host=None, stage="chat"):
        if self.protocol == "assistant-v2":
            joined = "".join(f"{key}={params[key]}" for key in sorted(params))
            signature = hashlib.md5((self.key + joined + compact_json(body) + self.key).encode("utf-8")).hexdigest()
        else:
            signature = sign(params, body, self.key)
        params = {**params, "signature": signature}
        headers = {"Accept": "text/event-stream, application/json"}
        if host:
            headers["Host"] = str(host)
        if self.config.get("kg_tid"):
            headers["KG-TID"] = str(self.config["kg_tid"])
        return self.request(url + "?" + urlencode(params), body, headers, stage)

    def song_details(self, songs, session_id):
        ids = [str(song["mixsongid"]) for song in songs]
        if not ids or not self.config.get("kmr_url"):
            return songs
        try:
            params = {k: v for k, v in self.params(session_id).items() if k in ("appid", "clientver", "clienttime", "mid", "uuid", "dfid")}
            params["moduleid"] = "3"
            payload = json.loads(self.post(str(self.config["kmr_url"]), params, {"fields": "base", "data": [{"entity_id": id_} for id_ in ids]}, stage="kmr"))
            items = payload.get("data", [])
            if isinstance(items, dict):
                items = items.get("items", items.get("info", []))
            if not isinstance(items, list):
                return songs
            lookup = {}
            for index, item in enumerate(items):
                if not isinstance(item, dict) or not isinstance(item.get("base"), dict):
                    continue
                id_ = str(item.get("entity_id") or item.get("mixsongid") or (ids[index] if index < len(ids) else ""))
                if id_:
                    lookup[id_] = item["base"]
            for song in songs:
                base = lookup.get(str(song["mixsongid"]), {})
                if base.get("songname"):
                    song["ori_song_name"] = base["songname"]
                if base.get("author_name"):
                    song["singer_name"] = base["author_name"]
        except (RemoteError, ValueError, TypeError, AttributeError):
            pass
        return songs

    def chat(self, message, history=None, session_id=None, recommend=False):
        if not self.enabled:
            raise self.fail(self.config_error or RemoteError("config", "unconfigured"))
        try:
            if self.protocol != "assistant-v2":
                self.ensure_token()
            # The supplied API documents only query; pass bounded context there,
            # plus a persistent UUID, instead of inventing unsupported body fields.
            context = []
            for item in (history or [])[-10:]:
                if item.get("role") in ("user", "assistant") and isinstance(item.get("content"), str):
                    context.append(("用户" if item["role"] == "user" else "助手") + "：" + item["content"][:600])
            query = "以下为本次对话最近的上下文，仅供理解当前问题：\n" + "\n".join(context) + "\n\n请回复用户当前问题：\n" + message if context else message
            for attempt in range(2):
                try:
                    if self.protocol == "assistant-v2":
                        params = {key: str(self.config.get(key, "")) for key in ("appid", "clientver", "dfid", "mid", "serverid", "userid")}
                        params.update(business="pet")
                        params[self.config.get("time_field", "clienttime")] = str(int(time.time()))
                        body = {"query": query, "role_name": message[:1000], "role_type": 1, "query_command": 10001}
                        if recommend:
                            body["query_command_extend"] = {"intention": "recommend"}
                        result = parse_sse(self.post(self.base_url + "/v2/assistant/stream", params, body, self.config.get("host")))
                    else:
                        result = parse_sse(self.post(self.base_url + "/v1/pet_chat/completions", self.params(session_id), {"query": query}, self.config.get("host")))
                    if result["errorCode"] or not (result["reply"] or (recommend and result["songs"])):
                        reason = "signature" if result["errorCode"] in ("20010", "20006") else "auth" if result["errorCode"] in ("401", "403") else "response"
                        raise RemoteError("chat", reason, result["errorCode"])
                    break
                except RemoteError as error:
                    if attempt == 0 and error.reason == "auth" and self.config.get("password") and self.config.get("token_url"):
                        self.ensure_token(force=True)
                        continue
                    raise
            result["songs"] = self.song_details(result["songs"], session_id)
            self.state, self.last_error = "connected", None
            self.last_checked = datetime.now(timezone.utc).isoformat()
            return result
        except RemoteError as error:
            raise self.fail(error) from None
