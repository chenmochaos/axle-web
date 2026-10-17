# server/ — AXLE 后端（Spring Boot）

hmdp（黑马点评）完整版后端的**二手车改造版**。领域词汇已统一到 `Car` / `Brand` / `Review`，
但存储层刻意沿用教程 schema（`tb_shop` / `tb_shop_type` / `tb_blog`）。

> **来源**：本目录是从同级 `hm-dianping/hmdp-master`（`本地生活点评平台` 的 git worktree）
> 拷贝进来的工作区快照。那份 worktree 现在只作为历史副本，**不要再在它上面开发**。
> 教程练习仓库 `本地生活点评平台` 与本目录无关，不要合并。

## 技术栈

Spring Boot 2.7.4 / Spring 5.3.23 · MyBatis-Plus 3.5.2 · MySQL 8.4 · Redis 8.0.5（Lettuce）·
Redisson 3.17.7 · 编译目标 Java 8，实际运行 JDK 21/25

## 运行

```bash
mvn -q clean test-compile        # 改完先验编译
mvn spring-boot:run              # 8081
```

`application.yaml` 的库密码走 `${MYSQL_PASSWORD:}`，从项目根目录的 `.env` 读
（`spring.config.import: optional:file:.env[.properties]`）。**`.env` 已在 `.gitignore` 中。**

## 包与命名

- 包名 `com.axle`，主类 `AxleApplication`（`@MapperScan("com.axle.mapper")`）
- 领域类：`Car` / `Brand` / `Review` / `ReviewComment`，每层各一套
  （`entity` / `mapper` / `service` / `service.impl` / `controller`）
- **与点评无关的一律不改**：`Voucher` / `SeckillVoucher` / `VoucherOrder` / `User` /
  `UserInfo` / `Follow` / `Upload`

## 表名不改（刻意的）

10 个实体**全部**显式写了 `@TableName`，所以类名与表名解耦：

| 实体 | `@TableName` |
|---|---|
| `Car` | `tb_shop` |
| `Brand` | `tb_shop_type` |
| `Review` | `tb_blog` |
| `ReviewComment` | `tb_blog_comments` |
| `Voucher` / `SeckillVoucher` / `VoucherOrder` | `tb_voucher` / `tb_seckill_voucher` / `tb_voucher_order` |
| `User` / `UserInfo` / `Follow` | `tb_user` / `tb_user_info` / `tb_follow` |

改表名会让教程的 `schema.sql` 失效、与 upstream 对照断裂，收益只是「名字好看」。
**不要重命名表或列**；加列可以（`usedcar.sql` 就是这么给 `tb_shop` 加 8 个车辆列的）。

## 接口路径

| 路径 | 说明 |
|---|---|
| `GET /car/{id}` | 车辆详情（走**逻辑过期缓存**，见下） |
| `GET /car/list` | 品牌 + 大类 + GEO 附近，分页 |
| `GET /car/search` | 按名称模糊搜索 |
| `POST /car`、`PUT /car` | 新增 / 更新 |
| `GET /brand/list` | 品牌列表（带拉丁字标 `mark`） |
| `GET /review/hot` | 热门口碑 |
| `GET /review/{id}`、`/likes/{id}`、`/of/me`、`/of/user`、`/of/follow`、`POST /review`、`PUT /review/like/{id}` | 口碑其余端点（前端尚未使用） |
| `POST /upload/review` | 图片上传 |
| `/user/**`、`/voucher/**`、`/voucher-order/**`、`/follow/**` | 与业务无关，保持原路径 |

### ⚠️ 白名单陷阱（最容易漏的一处）

`config/MvcConfig.java` 的 `excludePathPatterns` 里是**写死的路径字符串**，它**不含任何领域词**，
所以 `grep Car` 永远搜不到它。改了 `@RequestMapping` 而漏改这里，表现是：
**编译通过、启动通过、公开接口全部 401**，没有任何编译期提示。

当前白名单：`/user/code` `/user/login` `/review/hot` `/car/**` `/brand/**` `/upload/**`
`/voucher/**` `/error`。

**`/error` 那一条不能删**：Spring 处理未捕获异常时会把请求转发到 `/error`，那是一次新的分发，
会再过一遍拦截器。不排除的话任何后端异常（500、缺参数、SQL 写错）都会被改写成 401。

## Redis key

| 常量 | 值 |
|---|---|
| `LOGIN_CODE_KEY` | `login:code:` |
| `LOGIN_USER_KEY` | `login:token:` |
| `CACHE_CAR_KEY` | `cache:car:` |
| `LOCK_CAR_KEY` | `lock:car:` |
| `CACHE_TYPE_KEY` | `cache:brand` |
| `CAR_GEO_KEY` / `CAR_GEO_ALL_KEY` | `car:geo:` / `car:geo:all` |
| `REVIEW_LIKED_KEY` | `review:liked:` |
| `SECKILL_STOCK_KEY` / `FEED_KEY` / `USER_SIGN_KEY` | `seckill:stock:` / `feed:` / `sign:` |

**`login:*` 两个绝对不能改** —— 改了会让所有已登录用户静默掉线，没有任何报错。

### 初始化脚本（顺序有讲究）

```bash
./scripts/init-car-geo.sh          # car:geo:{typeId} + car:geo:all  ← 「附近优先」
./scripts/init-seckill-stock.sh    # seckill:stock:{voucherId}
./scripts/init-car-cache.sh        # cache:car:{id}                  ← 详情页
```

**`init-car-cache.sh` 是必须的，而且必须放在详情页验收之前。**
`ShopServiceImpl`（现 `CarServiceImpl`）的 `queryById` 走
`CacheClient.queryWithLogicalExpire`，它的语义是**缓存没命中就直接返回 null、不回查数据库**
（假设已被预热）。所以冷缓存下 `GET /car/{id}` 会回「店铺不存在」，而车明明在 MySQL 里。
`init-car-cache.sh` 自己就是「先清空再重建」，**不要再单独 `del` 一次**。
预热一次即可 —— 值的 `expireTime` 到点后下一次读会拿互斥锁异步回源，之后自维持。

## 数据

- `schema.sql`：教程原始建表（11 张表，含未使用的 `tb_sign`）。**不含 `CREATE DATABASE`**，需先建库：

  ```bash
  mysql -udev -e "CREATE DATABASE IF NOT EXISTS hmdp DEFAULT CHARSET utf8mb4 COLLATE utf8mb4_general_ci;"
  mysql -udev hmdp < schema.sql
  ```

- `usedcar.sql`：**幂等**的二手车迁移 —— 给 `tb_shop` 加 8 个车辆列、`tb_shop_type` 加 `mark`、
  14 行商铺改写成车源、重指券。不删任何行。必须用 `mysql` 命令行客户端执行（脚本里用了 `DELIMITER`）。

- **坐标集中在 3 个城市**：上海 5 台（1/2/3/7/9）、北京 5 台（6/11/12/13/14）、深圳 4 台（4/5/8/10）。
  原因是 `/car/list` 的 GEO 半径**硬编码 5 km**（`CarServiceImpl` 的 `new Distance(5000)`），
  散在 8 个城市时「附近优先」在任何地方都只能查出 1 台。
  代价：这 3 城之外的定位查出来是空的（前端有空态文案，不静默降级）。
  **改 `usedcar.sql` 的 `x`/`y` 必须同步改 `../web/src/api/mock.ts` 的 `mockCarCoords`**，连同 `address`。

## 已知坑

### 1. Lombok 版本（已修，改动别回退）

Spring Boot 2.7.4 父 POM 默认管理 lombok **1.18.24**，不支持 JDK 17+ 的注解处理器，
在 JDK 21/25 上会**静默失效** —— 表现为满屏「找不到符号 getXxx()」，而不是 lombok 自身的错。
`pom.xml` 两处缺一不可：

1. `<lombok.version>1.18.46</lombok.version>`
2. `maven-compiler-plugin` 显式声明 `<annotationProcessorPaths>` —— JDK 23 起 javac
   不再从 classpath 隐式启用注解处理器，只升级版本号无效。

### 2. Mapper XML 里的全限定名

`src/main/resources/mapper/*.xml` 的 `namespace` 与 `resultType` 是**全限定类名**。
IDE 的「重命名」操作默认不会改 XML —— 改包名或类名后必须手动同步，否则启动或首次查询才炸。

### 3. 图片上传目录

`SystemConstants.IMAGE_UPLOAD_DIR` 原先写死 Windows 路径 `D:\lesson\...`，在 Linux 上必然
`NoSuchFileException`。已改为 `src/main/resources/static/imgs/`（与 `pnpm build:embed` 的产物同目录）。

## 验证

```bash
mvn -q clean test-compile
curl -s http://127.0.0.1:8081/brand/list
curl -s 'http://127.0.0.1:8081/car/list?typeId=1&current=1&x=121.4737&y=31.2304'
curl -s http://127.0.0.1:8081/car/5
curl -s http://127.0.0.1:8081/review/hot
curl -s http://127.0.0.1:8081/voucher/list/5        # 走 VoucherMapper.xml，验 XML 全限定名
curl -si http://127.0.0.1:8081/user/me | head -1    # 期望裸 401
```
