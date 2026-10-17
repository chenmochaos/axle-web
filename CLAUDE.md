# AXLE — 精选二手车平台（monorepo）

一个可深链、可刷新、可真机下单的二手车交易平台。前端 Vue 3 + TS，后端 Spring Boot，
数据模型源自[黑马程序员 Redis 教程](https://www.bilibili.com/video/BV1cr4y1671t)的 hmdp 项目，
业务语义被改造成「二手车」：一辆车对应一条 `tb_shop` 记录，限时特价对应秒杀券，口碑对应 `tb_blog`。

## 结构

```
.
├── web/          Vue 3.5 + Vite + TS 前端
│   ├── src/api/  client（axios 实例 + USE_MOCK 唯一读者）/ adapt（唯一允许做字段映射的地方）
│   └── CLAUDE.md 前端设计约束（零彩色 UI / 动效 / data-reveal 纪律）—— 改样式前先读
├── server/       Spring Boot 2.7.4 + MyBatis-Plus + MySQL 8 + Redis 8
│   └── CLAUDE.md 后端规则（教程基线 / 接口路径 / Redis key / 初始化脚本顺序）
└── docs/         产品级文档：设计 spec、实施计划、截图
```

**两边的 toolchain 完全独立**：`web/` 有自己的 `package.json` 与 `node_modules`，`server/` 是 Maven 工程。
不要把前端源码挪进 `server/src/main/resources/` —— Maven 会把 `node_modules` 整份复制进
`target/classes/`，jar 涨到几百 MB，而且开发时失去 HMR。需要「一个 jar 跑全套」时用
`pnpm build:embed`（见下）。

## 命名：三层词汇，落差是刻意的

| 层 | 词汇 | 例子 |
|---|---|---|
| 前端展示模型 | `Car` / `Brand` / `Review` | `web/src/api/types.ts` |
| 后端领域类与接口 | `Car` / `Brand` / `Review` | `GET /car/{id}`、`GET /brand/list` |
| 数据库 | `tb_shop` / `tb_shop_type` / `tb_blog` | 教程原始 schema |

**表名不改是刻意的取舍**：`schema.sql` 与 `usedcar.sql` 与上游教程保持一致，
类名与表名之间靠实体的 `@TableName` 显式声明。改表名会让教程 SQL 失效、与 upstream 对照断裂，
而收益只是「名字好看」。新增字段仍可以加，但**不要重命名表或列**。

字段语义也有三处落差，全部由 `web/src/api/adapt.ts` 抹平，不要在其他地方摊平：

- `avgPrice` 单位是**分**（÷100 才是元）
- `score` 是 **×10 的整数**（÷10）
- `images` 是**逗号串**（split 并滤空段）

## 命令

```bash
# 前端
cd web && pnpm install
pnpm dev                 # 5173，默认走内置 mock，不需要后端
VITE_USE_MOCK=false pnpm dev --port 5174   # 连真后端（8081）
pnpm typecheck && pnpm test && pnpm build
pnpm build:embed         # 构建产物写进 ../server/src/main/resources/static（被 gitignore）

# 后端
cd server && mvn spring-boot:run           # 8081
mvn -q clean test-compile                  # 改完先验编译

# Redis 预热（三个都要跑，顺序见 server/CLAUDE.md）
cd server && ./scripts/init-car-cache.sh && ./scripts/init-car-geo.sh && ./scripts/init-seckill-stock.sh
```

## 验证

改完必须跑：

```bash
cd server && mvn -q clean test-compile
cd web && pnpm typecheck && pnpm test && pnpm build
```

**一条接口改动要在两种模式下都验**（`VITE_USE_MOCK` 开/关）。两条数据源的分叉不只在数据内容，
更在**形状**（真机是逗号串、平铺作者、没有 total）—— 只验 mock 会漏掉整块 section 消失这类故障。

关键 curl（后端起来后）：

```bash
curl -s http://127.0.0.1:8081/brand/list
curl -s 'http://127.0.0.1:8081/car/list?typeId=1&current=1&x=121.4737&y=31.2304'
curl -s http://127.0.0.1:8081/car/5
curl -s http://127.0.0.1:8081/review/hot
curl -si http://127.0.0.1:8081/user/me | head -1     # 期望裸 401
```

## 密钥

`server/.env` 存 `MYSQL_PASSWORD`，由 `application.yaml` 的
`spring.config.import: optional:file:.env[.properties]` 读取。**已在 `.gitignore` 中，不要提交。**
新环境拉代码后自己建：

```
MYSQL_PASSWORD=<本机 MySQL 密码>
```

## 已知缺口

- `tb_shop_type` 里两个品牌（保时捷 / 沃尔沃）没有车源，点进去是空态。
- 后端 `mvn test` 会因教程遗留测试重复创建手机号 `17600000000` 而失败（唯一索引冲突）；
  日常验证用 `mvn -q clean test-compile`。测试生成的账号可用
  `server/cleanup-test-data.sql` 清理。
