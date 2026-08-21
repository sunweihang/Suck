# Suck 游戏服务端

按微信小游戏规范做登录态，存关卡、金币、道具。

完整接口、错误码、合并规则、上线清单见仓库 [`doc/服务器接口说明.md`](../doc/服务器接口说明.md)。

```bash
cp .env.example .env   # 填 WX_APPID / WX_SECRET
npm i
npm run dev            # http://127.0.0.1:8787
```

正式环境：`ALLOW_GUEST=0`，HTTPS，并在微信后台配置 request 合法域名。`session_key` 不得下发客户端。
