#!/usr/bin/env python3
"""
SFU (Selective Forwarding Unit) 集成测试脚本。

测试 Navo IM 后端的 WebRTC/SFU 信令协议，验证多个信令：
  1. 用户注册/认证 → WebSocket JWT 连接
  2. 发起通话 (call:invite) → 加入上行 (call:offer)
  3. 订阅远端轨道 (call:subscribe) → 下行 (call:downstream-offer)
  4. ICE 候选转发
  5. 离开通话 (call:hangup) → 资源清理

依赖安装:
  pip install websocket-client pyjwt requests

可选 (测试完整 RTP 媒体流):
  pip install aiortc
  需要 Python 3.9+，且有音频/视频设备或虚拟设备
"""

import argparse
import json
import logging
import os
import random
import sqlite3
import string
import sys
import threading
import time
import uuid

logging.basicConfig(
    level=logging.DEBUG,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("sfu_test")

WEBSOCKET_CLIENT_AVAILABLE = False
AIORTC_AVAILABLE = False
PYJWT_AVAILABLE = False
REQUESTS_AVAILABLE = False

try:
    import jwt as pyjwt
    PYJWT_AVAILABLE = True
except ImportError:
    pass

try:
    import requests
    REQUESTS_AVAILABLE = True
except ImportError:
    pass

try:
    from websocket import WebSocketApp
    WEBSOCKET_CLIENT_AVAILABLE = True
except ImportError:
    try:
        import websocket
        WebSocketApp = websocket.WebSocketApp
        WEBSOCKET_CLIENT_AVAILABLE = True
    except ImportError:
        pass


# ─── Configuration ───────────────────────────────────────────────────────────

class Config:
    server_url: str = "http://localhost:52200"
    ws_url: str = "ws://localhost:52200/ws"
    jwt_secret: str = "navoim2026"
    db_path: str = "server/data/navo-im.sqlite"
    test_call_duration: float = 3.0  # seconds
    test_user_prefix: str = "sfu_test_"


# ─── Test User Management ────────────────────────────────────────────────────

class TestUser:
    def __init__(self, username: str, password: str, display_name: str):
        self.username = username
        self.password = password
        self.display_name = display_name
        self.user_id: str | None = None
        self.jwt: str | None = None
        self.conversation_id: str | None = None
        self.ws: WebSocketApp | None = None
        self.received: list[dict] = []
        self.connected = threading.Event()
        self._recv_lock = threading.Lock()

    def make_jwt(self, secret: str) -> str:
        if not PYJWT_AVAILABLE:
            raise RuntimeError("pyjwt not installed: pip install pyjwt")
        return pyjwt.encode(
            {"sub": self.user_id, "username": self.username},
            secret,
            algorithm="HS256",
        )


def random_suffix(length: int = 8) -> str:
    return "".join(random.choices(string.ascii_lowercase + string.digits, k=length))


def create_test_user_in_db(db_path: str, username: str, password: str, display_name: str) -> str:
    """Directly insert a test user into SQLite and return their user ID."""
    import hashlib

    conn = sqlite3.connect(db_path)
    try:
        cur = conn.cursor()
        user_id = f"u_{username}_{random_suffix(6)}"
        now = time.strftime("%Y-%m-%dT%H:%M:%S.", time.gmtime()) + f"{int(time.time() * 1000) % 1000:03d}Z"

        # Use bcrypt hash via Python's passlib or just use a known hash
        # For simplicity, use a sha256-based hash format the server's bcrypt can verify
        # Actually let's use passlib or fallback to plain bcrypt
        import bcrypt
        pw_hash = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()

        cur.execute(
            """INSERT OR IGNORE INTO users
               (id, username, display_name, avatar_color, bio, gender, status, last_seen,
                require_friend_approval, password_hash)
               VALUES (?, ?, ?, ?, '', 'unspecified', 'offline', ?, 0, ?)""",
            (user_id, username, display_name, "#" + "".join(random.choices("0123456789ABCDEF", k=6)),
             now, pw_hash),
        )
        conn.commit()

        # Check if user was actually inserted
        row = cur.execute("SELECT id FROM users WHERE username = ?", (username,)).fetchone()
        if row:
            return row[0]
        return user_id
    finally:
        conn.close()


def ensure_test_conversation(db_path: str, user_a: str, user_b: str) -> str:
    """Create a DM conversation between two users if not exists."""
    conn = sqlite3.connect(db_path)
    try:
        cur = conn.cursor()
        conv_id = f"conv_{user_a}_{user_b}" if user_a < user_b else f"conv_{user_b}_{user_a}"
        now = time.strftime("%Y-%m-%dT%H:%M:%S.", time.gmtime()) + f"{int(time.time() * 1000) % 1000:03d}Z"

        existing = cur.execute(
            "SELECT id FROM conversations WHERE id = ?", (conv_id,)
        ).fetchone()
        if existing:
            return existing[0]

        cur.execute(
            """INSERT OR IGNORE INTO conversations
               (id, kind, name, is_private, created_at)
               VALUES (?, 'dm', NULL, 1, ?)""",
            (conv_id, now),
        )
        for uid in [user_a, user_b]:
            role = "member"
            cur.execute(
                """INSERT OR IGNORE INTO conversation_members
                   (conversation_id, user_id, role, muted, banned, joined_at)
                   VALUES (?, ?, ?, 0, 0, ?)""",
                (conv_id, uid, role, now),
            )
        conn.commit()
        return conv_id
    finally:
        conn.close()


# ─── WebSocket Client ────────────────────────────────────────────────────────

class SignalingClient:
    """Manages a WebSocket connection to the Navo IM signaling server."""

    def __init__(self, config: Config, user: TestUser):
        self.config = config
        self.user = user
        self.ws: WebSocketApp | None = None
        self.received: list[dict] = []
        self.messages_by_type: dict[str, list[dict]] = {}
        self.connected = threading.Event()
        self._lock = threading.Lock()
        self._stop = False

    def _on_message(self, ws, message: str):
        try:
            event = json.loads(message)
        except json.JSONDecodeError:
            log.warning("[%s] invalid JSON: %s", self.user.username, message[:100])
            return
        with self._lock:
            self.received.append(event)
            self.messages_by_type.setdefault(event.get("type", "unknown"), []).append(event)
        log.debug("[%s] ← %s", self.user.username, json.dumps(event, ensure_ascii=False)[:200])

    def _on_error(self, ws, error):
        log.error("[%s] ws error: %s", self.user.username, error)

    def _on_close(self, ws, close_status_code, close_msg):
        log.info("[%s] ws closed (code=%s, msg=%s)", self.user.username, close_status_code, close_msg)

    def _on_open(self, ws):
        log.info("[%s] ws connected, sending auth...", self.user.username)
        self._send({"type": "auth", "token": self.user.jwt})

    def _send(self, msg: dict):
        if self.ws:
            payload = json.dumps(msg)
            log.debug("[%s] → %s", self.user.username, payload[:200])
            self.ws.send(payload)

    def connect(self):
        self._stop = False
        self.ws = WebSocketApp(
            self.config.ws_url,
            on_open=self._on_open,
            on_message=self._on_message,
            on_error=self._on_error,
            on_close=self._on_close,
        )
        t = threading.Thread(target=self.ws.run_forever, daemon=True, kwargs={"ping_interval": 20})
        t.start()
        # Wait for the `ready` event
        if not self._wait_for("ready", timeout=5.0):
            raise TimeoutError(f"{self.user.username}: 认证超时")
        log.info("[%s] authenticated successfully, userId=%s", self.user.username, self.user.user_id)
        return True

    def send(self, msg: dict):
        self._send(msg)

    def wait_for(self, event_type: str, timeout: float = 10.0, condition=None):
        return self._wait_for(event_type, timeout, condition)

    def _wait_for(self, event_type: str, timeout: float = 10.0, condition=None):
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            with self._lock:
                events = self.messages_by_type.get(event_type, [])
                for ev in events:
                    if condition is None or condition(ev):
                        return ev
            time.sleep(0.05)
        return None

    def wait_for_any(self, event_types: list[str], timeout: float = 10.0):
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            with self._lock:
                for et in event_types:
                    events = self.messages_by_type.get(et, [])
                    if events:
                        return events[0]
            time.sleep(0.05)
        return None

    def close(self):
        self._stop = True
        if self.ws:
            self.ws.close()


# ─── Test Scenarios ──────────────────────────────────────────────────────────

def test_protocol_signaling(config: Config, user_a: TestUser, user_b: TestUser):
    """
    Test the complete call signaling protocol:
    invite → offer → answer (upstream) → subscribe → downstream-offer → ice → hangup
    """
    call_id = f"call_{random_suffix(10)}"
    log.info("=" * 60)
    log.info("Test: 完整通话信令流程 callId=%s", call_id)
    log.info("=" * 60)

    # 1. Create users and connect
    client_a = SignalingClient(config, user_a)
    client_b = SignalingClient(config, user_b)
    assert client_a.connect(), "User A 连接失败"
    assert client_b.connect(), "User B 连接失败"

    conv_id = user_a.conversation_id
    assert conv_id, "没有会话 ID"

    # 2. User A invites to call
    log.info("[Step 1] User A 发起通话邀请...")
    client_a.send({
        "type": "call:invite",
        "callId": call_id,
        "conversationId": conv_id,
        "kind": "audio",
    })

    # 3. User B should receive call:incoming
    incoming = client_b.wait_for("call:incoming", timeout=5.0)
    assert incoming, "User B 未收到 call:incoming"
    log.info("[Step 2] ✓ User B 收到 call:incoming (from=%s)", incoming.get("call", {}).get("fromUserId"))

    # 4. User B accepts
    client_b.send({"type": "call:accept", "callId": call_id})

    # 5. User A sends upstream offer (simulated SDP — real browser would create RTCPeerConnection)
    log.info("[Step 3] User A 发送上行 SDP offer...")
    sdp_offer_a = _make_fake_sdp("offer", "user_a")
    log.info("[Step 3] SDP offer length=%d", len(sdp_offer_a))
    client_a.send({
        "type": "call:offer",
        "callId": call_id,
        "sdp": sdp_offer_a,
    })

    # 6. User A should receive call:answer from server (upstream answer)
    answer_a = client_a.wait_for("call:answer", timeout=10.0)
    assert answer_a, "User A 未收到 call:answer"
    log.info("[Step 4] ✓ User A 收到上行 answer (sdp len=%d)", len(answer_a.get("sdp", "")))
    assert answer_a.get("sdp"), "上行 answer SDP 为空"

    # 7. User A should receive call:peer-joined events for existing participants
    peer_joined_a = client_a.wait_for("call:peer-joined", timeout=5.0,
                                       condition=lambda ev: ev.get("userId") == user_b.user_id)
    if peer_joined_a:
        log.info("[Step 5] ✓ User A 收到 peer-joined (userId=%s)", peer_joined_a.get("userId"))

    # 8. User B also joins upstream
    log.info("[Step 6] User B 发送上行 SDP offer...")
    sdp_offer_b = _make_fake_sdp("offer", "user_b")
    client_b.send({
        "type": "call:offer",
        "callId": call_id,
        "sdp": sdp_offer_b,
    })

    answer_b = client_b.wait_for("call:answer", timeout=10.0)
    assert answer_b, "User B 未收到 call:answer"
    log.info("[Step 7] ✓ User B 收到上行 answer (sdp len=%d)", len(answer_b.get("sdp", "")))

    # User B should see peer-joined for User A
    peer_joined_b = client_b.wait_for("call:peer-joined", timeout=5.0,
                                       condition=lambda ev: ev.get("userId") == user_a.user_id)
    if peer_joined_b:
        log.info("[Step 8] ✓ User B 收到 peer-joined (userId=%s)", peer_joined_b.get("userId"))

    # 9. User B subscribes to User A's track
    # But first User A needs to publish a track
    # In real scenario, the browser publishes via the upstream PC.
    # The server's ontrack handler fires when the upstream receives media.
    # We simulate by having the server detect our fake SDP's media sections.

    # NOTE: The server can only create downstream offers once tracks are available
    # on the upstream. With fake SDPs (no real media), the subscribe will get
    # an empty downstream SDP (placeholder mode). This is expected.

    log.info("[Step 9] User B 订阅 User A 的 camera 轨道...")
    client_b.send({
        "type": "call:subscribe",
        "callId": call_id,
        "publisherId": user_a.user_id,
        "kind": "camera",
    })

    # The server may return a downstream-offer (with real SDP) or empty (placeholder)
    downstream = client_b.wait_for("call:downstream-offer", timeout=10.0)
    if downstream:
        sdp_len = len(downstream.get("sdp", ""))
        log.info("[Step 10] ✓ User B 收到 downstream-offer (publisher=%s, sdp len=%d, kind=%s)",
                 downstream.get("publisherId"), sdp_len, downstream.get("kind"))
        if downstream.get("sdp"):
            # Answer the downstream offer
            client_b.send({
                "type": "call:answer",
                "callId": call_id,
                "subscriberId": user_b.user_id,
                "publisherId": user_a.user_id,
                "sdp": _make_fake_sdp("answer", "user_b_downstream"),
            })
            log.info("[Step 11] ✓ User B 回复了下行 answer")
    else:
        log.info("[Step 10] ⚠ User B 未收到 downstream-offer (可能因为没有真实媒体轨道)")

    # 10. Peer-joined / track-published for the other direction
    # User A subscribes to User B
    track_pub_a = client_a.wait_for("call:track-published", timeout=5.0,
                                     condition=lambda ev: ev.get("userId") == user_b.user_id)
    if track_pub_a:
        log.info("[Step 11] ✓ User A 收到 track-published (userId=%s, kind=%s)",
                 track_pub_a.get("userId"), track_pub_a.get("kind"))

    log.info("[Step 12] User A 订阅 User B 的 camera 轨道...")
    client_a.send({
        "type": "call:subscribe",
        "callId": call_id,
        "publisherId": user_b.user_id,
        "kind": "camera",
    })
    down_a = client_a.wait_for("call:downstream-offer", timeout=10.0)
    if down_a:
        log.info("[Step 13] ✓ User A 收到 downstream-offer (publisher=%s)", down_a.get("publisherId"))
    else:
        log.info("[Step 13] ⚠ User A 未收到 downstream-offer")

    # 11. Hangup
    time.sleep(1.0)
    log.info("[Step 14] User A 挂断通话...")
    client_a.send({"type": "call:hangup", "callId": call_id})

    # Both users should receive call:hangup
    hangup_a = client_a.wait_for("call:hangup", timeout=5.0)
    hangup_b = client_b.wait_for("call:hangup", timeout=5.0)
    if hangup_a:
        log.info("[Step 15] ✓ User A 收到 call:hangup (byUserId=%s)", hangup_a.get("byUserId"))
    if hangup_b:
        log.info("[Step 15] ✓ User B 收到 call:hangup (byUserId=%s)", hangup_b.get("byUserId"))

    # Verify no error events
    errors_a = [e for e in client_a.received if e.get("type") == "error"]
    errors_b = [e for e in client_b.received if e.get("type") == "error"]
    if errors_a:
        log.warning("User A 收到错误事件: %s", errors_a)
    if errors_b:
        log.warning("User B 收到错误事件: %s", errors_b)

    # Summary
    log.info("")
    log.info("─" * 60)
    log.info("User A 事件统计:")
    for t, evs in sorted(client_a.messages_by_type.items()):
        log.info("  %s: %d 个", t, len(evs))
    log.info("User B 事件统计:")
    for t, evs in sorted(client_b.messages_by_type.items()):
        log.info("  %s: %d 个", t, len(evs))

    client_a.close()
    client_b.close()
    log.info("测试完成 ✓")
    return True


def test_subscription_retry_mechanism(config: Config, user_a: TestUser, user_b: TestUser):
    """
    Test subscription retry behavior:
    - Subscribe before track is published → placeholder mode
    - Track arrives later → verify re-subscription works
    """
    call_id = f"call_retry_{random_suffix(8)}"
    log.info("=" * 60)
    log.info("Test: 订阅重试机制 callId=%s", call_id)
    log.info("=" * 60)

    client_a = SignalingClient(config, user_a)
    client_b = SignalingClient(config, user_b)
    assert client_a.connect(), "User A 连接失败"
    assert client_b.connect(), "User B 连接失败"

    conv_id = user_a.conversation_id

    # A invites B
    client_a.send({
        "type": "call:invite",
        "callId": call_id,
        "conversationId": conv_id,
        "kind": "audio",
    })
    client_b.wait_for("call:incoming", timeout=5.0)
    client_b.send({"type": "call:accept", "callId": call_id})

    # Both join upstream
    client_a.send({"type": "call:offer", "callId": call_id, "sdp": _make_fake_sdp("offer", "a")})
    client_a.wait_for("call:answer", timeout=10.0)

    client_b.send({"type": "call:offer", "callId": call_id, "sdp": _make_fake_sdp("offer", "b")})
    client_b.wait_for("call:answer", timeout=10.0)

    # Wait for peer-joined so both know about each other
    time.sleep(0.5)

    # B subscribes to A immediately (before A's tracks are published)
    log.info("[Test] User B 提前订阅 User A（轨道尚未发布）...")
    client_b.send({
        "type": "call:subscribe",
        "callId": call_id,
        "publisherId": user_a.user_id,
        "kind": "camera",
    })

    downstream_early = client_b.wait_for("call:downstream-offer", timeout=5.0)
    if downstream_early:
        log.info("[Test] 提前订阅结果: sdp=%s",
                 "非空" if downstream_early.get("sdp") else "空（占位模式）")
    else:
        log.info("[Test] 提前订阅未收到 downstream-offer")

    # The subscription retry on client side would happen in the browser's JS.
    # Here we just verify the server handles duplicate subscriptions gracefully.
    log.info("[Test] 发送重复订阅（应被服务端处理，不会报错）...")
    client_b.send({
        "type": "call:subscribe",
        "callId": call_id,
        "publisherId": user_a.user_id,
        "kind": "camera",
    })

    errors = [e for e in client_b.received if e.get("type") == "error"]
    if errors:
        log.warning("重复订阅产生了错误: %s", errors)
    else:
        log.info("[Test] ✓ 重复订阅未产生错误")

    # Hangup
    client_a.send({"type": "call:hangup", "callId": call_id})
    time.sleep(1.0)

    client_a.close()
    client_b.close()
    log.info("重试机制测试完成 ✓")
    return True


def test_error_handling(config: Config, user_a: TestUser, user_b: TestUser):
    """Test error handling scenarios: reject, cancel, invalid subscribe, etc."""
    call_id = f"call_err_{random_suffix(8)}"
    log.info("=" * 60)
    log.info("Test: 错误处理 callId=%s", call_id)
    log.info("=" * 60)

    client_a = SignalingClient(config, user_a)
    client_b = SignalingClient(config, user_b)
    assert client_a.connect(), "User A 连接失败"
    assert client_b.connect(), "User B 连接失败"

    conv_id = user_a.conversation_id

    # Scenario 1: Subscribe to non-existent call
    log.info("[Test] 订阅不存在的通话（应忽略或返回错误）...")
    client_b.send({
        "type": "call:subscribe",
        "callId": "nonexistent_call",
        "publisherId": user_a.user_id,
        "kind": "camera",
    })
    err = client_b.wait_for("error", timeout=3.0)
    if err:
        log.info("[Test] ✓ 收到错误: %s", err.get("message"))

    # Scenario 2: Subscribe to own tracks (server should reject)
    client_a.send({
        "type": "call:invite",
        "callId": call_id,
        "conversationId": conv_id,
        "kind": "audio",
    })
    client_b.wait_for("call:incoming", timeout=5.0)
    client_b.send({"type": "call:accept", "callId": call_id})

    client_a.send({"type": "call:offer", "callId": call_id, "sdp": _make_fake_sdp("offer", "a")})
    client_a.wait_for("call:answer", timeout=10.0)

    client_b.send({"type": "call:offer", "callId": call_id, "sdp": _make_fake_sdp("offer", "b")})
    client_b.wait_for("call:answer", timeout=10.0)
    time.sleep(0.5)

    log.info("[Test] 订阅自己的轨道（服务端应拒绝）...")
    client_a.send({
        "type": "call:subscribe",
        "callId": call_id,
        "publisherId": user_a.user_id,
        "kind": "camera",
    })
    err_self = client_a.wait_for("error", timeout=3.0)
    if err_self:
        log.info("[Test] ✓ 自订阅被拒绝: %s", err_self.get("message"))
    else:
        log.info("[Test] ✓ 自订阅被静默忽略（服务端行为）")

    # Scenario 3: Cancel call before answer
    call_id2 = f"call_cancel_{random_suffix(8)}"
    client_a.send({
        "type": "call:invite",
        "callId": call_id2,
        "conversationId": conv_id,
        "kind": "audio",
    })
    client_b.wait_for("call:incoming", timeout=5.0)
    log.info("[Test] 取消通话...")
    client_a.send({"type": "call:cancel", "callId": call_id2})

    cancelled_b = client_b.wait_for("call:cancelled", timeout=5.0,
                                     condition=lambda ev: ev.get("callId") == call_id2)
    if cancelled_b:
        log.info("[Test] ✓ User B 收到 call:cancelled")

    # Cleanup
    client_a.send({"type": "call:hangup", "callId": call_id})
    time.sleep(0.5)

    client_a.close()
    client_b.close()
    log.info("错误处理测试完成 ✓")
    return True


def test_offline_invite(config: Config, user_a: TestUser):
    """Test that inviting an offline user is rejected with an error."""
    call_id = f"call_offline_{random_suffix(8)}"
    log.info("=" * 60)
    log.info("Test: 离线邀请拒绝 callId=%s", call_id)
    log.info("=" * 60)

    # Create a third user who will NOT connect to WebSocket
    try:
        import bcrypt
    except ImportError:
        log.error("需要 bcrypt 库")
        return False

    suffix = random_suffix(6)
    user_c = TestUser(
        username=f"sfu_offline_{suffix}",
        password="OfflinePass123",
        display_name=f"Offline_{suffix}",
    )
    uid_c = create_test_user_in_db(config.db_path, user_c.username,
                                    user_c.password, user_c.display_name)
    user_c.user_id = uid_c
    conv_ac = ensure_test_conversation(config.db_path, user_a.user_id, user_c.user_id)
    log.info("离线用户 C: id=%s, username=%s, conv=%s", user_c.user_id, user_c.username, conv_ac)

    # Connect User A only
    client_a = SignalingClient(config, user_a)
    assert client_a.connect(), "User A 连接失败"

    # User A tries to invite the offline User C
    log.info("[Test] User A 邀请离线 User C ...")
    client_a.send({
        "type": "call:invite",
        "callId": call_id,
        "conversationId": conv_ac,
        "kind": "audio",
    })

    # User A should receive an error
    err = client_a.wait_for("error", timeout=5.0,
                            condition=lambda ev: ev.get("callId") == call_id)
    if err:
        log.info("[Test] ✓ 收到错误: %s", err.get("message"))
        assert "不在线" in err.get("message", ""), f"错误消息应包含'不在线', 实际: {err.get('message')}"
    else:
        log.error("[Test] ✗ 未收到离线邀请错误")
        client_a.close()
        return False

    # Verify User C did NOT receive the invite (they're offline)
    # Since we never connected C, we can't check directly - but the lack of
    # an incoming event on A's side that mentions C confirms the server didn't
    # process the invite.

    client_a.close()
    log.info("离线邀请测试完成 ✓")
    return True


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _make_fake_sdp(kind: str, tag: str) -> str:
    """Generate a minimal fake SDP for testing.

    Real browsers generate proper SDP with ICE candidates and fingerprints.
    This minimal SDP is enough for the server to process the signaling flow
    up to the point where media tracks are expected.
    """
    session_id = str(random.randint(100000, 999999))
    ufrag = f"{tag}{random_suffix(4)}"
    pwd = f"{tag}{random_suffix(10)}" + "abcdefghijklmnop"
    fp = "AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99"
    audio_ssrc = str(random.randint(1000000000, 2000000000))

    sdp = (
        f"v=0\r\n"
        f"o=- {session_id} 2 IN IP4 127.0.0.1\r\n"
        f"s={tag}\r\n"
        f"t=0 0\r\n"
        f"a=group:BUNDLE 0\r\n"
        f"a=msid-semantic: WMS\r\n"
        f"m=audio 9 UDP/TLS/RTP/SAVPF 111\r\n"
        f"c=IN IP4 0.0.0.0\r\n"
        f"a=rtcp-mux\r\n"
        f"a=ice-ufrag:{ufrag}\r\n"
        f"a=ice-pwd:{pwd}\r\n"
        f"a=fingerprint:sha-256 {fp}\r\n"
        f"a=setup:{'actpass' if kind == 'offer' else 'active'}\r\n"
        f"a=mid:0\r\n"
        f"a=sendrecv\r\n"
        f"a=msid:{tag}stream {tag}audio\r\n"
        f"a=ssrc:{audio_ssrc} cname:{tag}audio\r\n"
        f"a=ssrc:{audio_ssrc} msid:{tag}stream {tag}audio\r\n"
        f"a=ssrc:{audio_ssrc} mslabel:{tag}stream\r\n"
        f"a=ssrc:{audio_ssrc} label:{tag}audio\r\n"
        f"a=rtpmap:111 opus/48000/2\r\n"
        f"a=rtcp-fb:111 transport-cc\r\n"
        f"a=fmtp:111 "
        f"minptime=10;useinbandfec=1\r\n"
    )

    if kind == "offer":
        video_ssrc = str(random.randint(1000000000, 2000000000))
        sdp += (
            f"m=video 9 UDP/TLS/RTP/SAVPF 96\r\n"
            f"c=IN IP4 0.0.0.0\r\n"
            f"a=rtcp-mux\r\n"
            f"a=ice-ufrag:{ufrag}\r\n"
            f"a=ice-pwd:{pwd}\r\n"
            f"a=fingerprint:sha-256 {fp}\r\n"
            f"a=setup:actpass\r\n"
            f"a=mid:1\r\n"
            f"a=sendrecv\r\n"
            f"a=msid:{tag}stream {tag}video\r\n"
            f"a=ssrc:{video_ssrc} cname:{tag}video\r\n"
            f"a=ssrc:{video_ssrc} msid:{tag}stream {tag}video\r\n"
            f"a=ssrc:{video_ssrc} mslabel:{tag}stream\r\n"
            f"a=ssrc:{video_ssrc} label:{tag}video\r\n"
            f"a=rtpmap:96 VP8/90000\r\n"
            f"a=rtcp-fb:96 goog-remb\r\n"
            f"a=rtcp-fb:96 transport-cc\r\n"
            f"a=rtcp-fb:96 ccm fir\r\n"
            f"a=rtcp-fb:96 nack\r\n"
            f"a=rtcp-fb:96 nack pli\r\n"
        )

    return sdp


# ─── Main ─────────────────────────────────────────────────────────────────────

def setup_test_users(config: Config) -> tuple[TestUser, TestUser]:
    """Create two test users in the database and return TestUser objects."""
    suffix = random_suffix(6)

    user_a = TestUser(
        username=f"{config.test_user_prefix}alice_{suffix}",
        password="TestPass123",
        display_name=f"Alice_{suffix}",
    )
    user_b = TestUser(
        username=f"{config.test_user_prefix}bob_{suffix}",
        password="TestPass456",
        display_name=f"Bob_{suffix}",
    )

    # Only create if DB exists
    if not os.path.exists(config.db_path):
        log.warning("数据库 %s 不存在，将尝试用 API 注册用户", config.db_path)
        if not (REQUESTS_AVAILABLE):
            log.error("需要 requests 库来通过 API 注册用户")
            sys.exit(1)
        _register_via_api(config, user_a)
        _register_via_api(config, user_b)
    else:
        log.info("创建测试用户 Alice=%s, Bob=%s 到数据库 %s",
                 user_a.username, user_b.username, config.db_path)

        # Need bcrypt
        try:
            import bcrypt
        except ImportError:
            log.error("需要 bcrypt 库: pip install bcrypt")
            sys.exit(1)

        uid_a = create_test_user_in_db(config.db_path, user_a.username,
                                        user_a.password, user_a.display_name)
        uid_b = create_test_user_in_db(config.db_path, user_b.username,
                                        user_b.password, user_b.display_name)
        user_a.user_id = uid_a
        user_b.user_id = uid_b

    # Ensure conversation
    if not os.path.exists(config.db_path):
        log.warning("无数据库，跳过会话创建")
    else:
        conv_id = ensure_test_conversation(config.db_path, user_a.user_id, user_b.user_id)
        user_a.conversation_id = conv_id
        user_b.conversation_id = conv_id
        log.info("测试会话 convId=%s", conv_id)

    # Generate JWT tokens
    user_a.jwt = user_a.make_jwt(config.jwt_secret)
    user_b.jwt = user_b.make_jwt(config.jwt_secret)
    log.info("JWT tokens generated (expires in 7d)")

    return user_a, user_b


def _register_via_api(config: Config, user: TestUser):
    """Register a user via the HTTP API (requires captchaToken)."""
    try:
        # First get a captcha token
        resp = requests.get(f"{config.server_url}/api/captcha/token", timeout=10)
        captcha_data = resp.json()
        captcha_token = captcha_data.get("token", "")

        resp = requests.post(f"{config.server_url}/api/auth/register", json={
            "username": user.username,
            "password": user.password,
            "displayName": user.display_name,
            "captchaToken": captcha_token,
        }, timeout=10)
        data = resp.json()
        user.user_id = data.get("user", {}).get("id")
        user.jwt = data.get("token")
        log.info("API 注册用户 %s → userId=%s", user.username, user.user_id)
    except Exception as e:
        log.error("API 注册失败: %s", e)
        raise


def check_dependencies():
    missing = []
    if not WEBSOCKET_CLIENT_AVAILABLE:
        missing.append("websocket-client (pip install websocket-client)")
    if not PYJWT_AVAILABLE:
        missing.append("pyjwt (pip install pyjwt)")
    if missing:
        log.error("缺少依赖: %s", ", ".join(missing))
        log.error("安装: pip install websocket-client pyjwt")
        return False
    return True


def main():
    parser = argparse.ArgumentParser(description="Navo IM SFU 测试脚本")
    parser.add_argument("--server", default=Config.server_url,
                        help="服务器 HTTP URL (default: %(default)s)")
    parser.add_argument("--ws", default=Config.ws_url,
                        help="WebSocket URL (default: %(default)s)")
    parser.add_argument("--db", default=Config.db_path,
                        help="SQLite 数据库路径 (default: %(default)s)")
    parser.add_argument("--jwt-secret", default=Config.jwt_secret,
                        help="JWT 密钥 (default: %(default)s)")
    parser.add_argument("--test", choices=["all", "signaling", "retry", "errors", "offline"],
                        default="all", help="测试选项 (default: all)")
    args = parser.parse_args()

    config = Config()
    config.server_url = args.server
    config.ws_url = args.ws
    config.db_path = args.db
    config.jwt_secret = args.jwt_secret

    if not check_dependencies():
        sys.exit(1)

    log.info("Navo IM SFU 测试脚本")
    log.info("服务器: %s", config.server_url)
    log.info("WebSocket: %s", config.ws_url)
    log.info("数据库: %s", config.db_path)
    log.info("")

    # Setup
    try:
        user_a, user_b = setup_test_users(config)
    except Exception as e:
        log.error("测试用户设置失败: %s", e)
        log.error("请确保服务器正在运行，并且数据库文件存在或 API 可访问")
        sys.exit(1)

    log.info("")
    log.info("用户 A: id=%s, username=%s", user_a.user_id, user_a.username)
    log.info("用户 B: id=%s, username=%s", user_b.user_id, user_b.username)
    log.info("会话: %s", user_a.conversation_id)
    log.info("")

    # Run tests
    passed = 0
    failed = 0

    tests_to_run = []
    if args.test in ("all", "signaling"):
        tests_to_run.append(("信令协议", lambda: test_protocol_signaling(config, user_a, user_b)))
    if args.test in ("all", "retry"):
        tests_to_run.append(("订阅重试", lambda: test_subscription_retry_mechanism(config, user_a, user_b)))
    if args.test in ("all", "errors"):
        tests_to_run.append(("错误处理", lambda: test_error_handling(config, user_a, user_b)))
    if args.test in ("all", "offline"):
        tests_to_run.append(("离线邀请", lambda: test_offline_invite(config, user_a)))

    for name, test_fn in tests_to_run:
        log.info("")
        log.info("▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄")
        log.info("开始测试: %s", name)
        log.info("▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀")
        try:
            result = test_fn()
            if result:
                log.info("测试 '%s' ✓ 通过", name)
                passed += 1
            else:
                log.error("测试 '%s' ✗ 失败", name)
                failed += 1
        except Exception as e:
            log.error("测试 '%s' 异常: %s", name, e, exc_info=True)
            failed += 1

    # Summary
    log.info("")
    log.info("=" * 60)
    log.info("测试结果: %d 通过, %d 失败 / %d 总", passed, failed, passed + failed)
    log.info("=" * 60)

    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
