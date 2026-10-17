# AXLE 后端接口清单

Spring Boot + MyBatis-Plus + MySQL + Redis 的后端。数据模型源自黑马点评（hmdp）教程，
业务语义已由 `usedcar.sql` 就地改造成二手车：**车源 / 品牌 / 口碑**。

> 存储层刻意沿用教程的表名（`tb_shop` / `tb_shop_type` / `tb_blog`），
> Java 侧靠 `@TableName` 显式映射。详见 [`../CLAUDE.md`](../CLAUDE.md) 的「表名不改」一节。

## 认证

- **登录态**：`POST /user/login` 返回 token 字符串，之后所有需登录的接口都带请求头
  `authorization: <token>`（注意是**小写** header 名，拦截器读的就是这个 key）。
- **Token 存储**：Redis `login:token:<token>`（Hash：id / nickName / icon），TTL 30 分钟，
  每次带 token 请求都会被 `RefreshTokenInterceptor` 续期。
- **拦截器规则**（`config/MvcConfig.java`）：仅以下路径免登录，其余一律需要 token。

  ```
  /user/code  /user/login  /review/hot  /car/**  /brand/**  /upload/**  /voucher/**  /error
  ```

- **未登录**访问受保护接口 → **裸 HTTP 401，响应体为空**（`LoginInterceptor` 只 `setStatus(401)`，
  不写 JSON）。前端判断登录态要看状态码，不要解析 body。
- 统一响应体：`{"success":bool,"errorMsg":string|null,"data":any,"total":long|null}`。
  注意：列表接口通过 `Result.ok(list)` 返回，`total` 恒为 `null`。

## 用户 `/user`

| 方法 | 路径 | 说明 | 登录 |
|------|------|------|------|
| POST | `/user/code?phone=` | 发验证码，存 Redis `login:code:<phone>` TTL 2min | 🔓 |
| POST | `/user/login` | body `{"phone":"...","code":"..."}`，返回 token 字符串 | 🔓 |
| POST | `/user/logout` | ⚠️ **未实现**，返回 `功能未完成` | 🔐 |
| GET | `/user/me` | 当前用户 | 🔐 |
| GET | `/user/{id}` | 用户简讯（昵称/头像） | 🔐 |
| GET | `/user/info/{id}` | 用户详情（含粉丝数、关注数、是否已关注） | 🔐 |
| POST | `/user/sign` | 签到（Redis BitMap 按月存） | 🔐 |
| GET | `/user/sign/count` | 本月连续签到天数 | 🔐 |

## 品牌 `/brand`

| 方法 | 路径 | 说明 | 登录 |
|------|------|------|------|
| GET | `/brand/list` | 全部品牌（含拉丁字标 `mark`），Redis List 缓存 | 🔓 |

## 车源 `/car`

| 方法 | 路径 | 说明 | 登录 |
|------|------|------|------|
| GET | `/car/{id}` | 详情。缓存穿透用空值缓存、缓存击穿用**逻辑过期** | 🔓 |
| POST | `/car` | 新增（body: Car） | 🔓 |
| PUT | `/car` | 更新，同时删缓存 | 🔓 |
| GET | `/car/list?typeId=&current=&kind=&x=&y=` | 带 x/y 走 Redis GEO 距离排序（半径硬编码 5 km），不带则普通分页 | 🔓 |
| GET | `/car/search?name=&current=` | 按名称模糊搜 | 🔓 |

> 单页条数由 `SystemConstants.MAX_PAGE_SIZE` 控制（当前 10）。
>
> ⚠️ `/car/{id}` 走逻辑过期缓存：**冷缓存直接返回「车源不存在」，不回查数据库**。
> 清过 Redis 后必须先跑 `scripts/init-car-cache.sh`。

## 优惠券 `/voucher`

| 方法 | 路径 | 说明 | 登录 |
|------|------|------|------|
| GET | `/voucher/list/{carId}` | 该车源的券（普通券 + 秒杀券） | 🔓 |
| POST | `/voucher` | 新增普通券 | 🔓 |
| POST | `/voucher/seckill` | 新增秒杀券 | 🔓 |

> 路径变量名是 `carId`，但底层列仍是 `shop_id`（`Voucher.carId` 上有 `@TableField("shop_id")`）。

## 秒杀下单 `/voucher-order`

| 方法 | 路径 | 说明 | 登录 |
|------|------|------|------|
| POST | `/voucher-order/seckill/{voucherId}` | 下单。成功返回订单 id（Redis 自增） | 🔐 |

失败响应（Lua 返回码 → 文案）：

| code | errorMsg |
|------|----------|
| 1 | 库存不足 |
| 2 | 禁止重复下单 |
| 3 | 优惠券不存在或库存未预热 |

## 口碑 `/review`

| 方法 | 路径 | 说明 | 登录 |
|------|------|------|------|
| POST | `/review` | 发布口碑（body: Review，images 为逗号分隔 URL） | 🔐 |
| GET | `/review/{id}` | 详情，带作者信息与当前用户是否点赞 | 🔐 |
| PUT | `/review/like/{id}` | 点赞 / 取消（SortedSet 存点赞时间） | 🔐 |
| GET | `/review/likes/{id}` | 点赞排行榜 Top5 | 🔐 |
| GET | `/review/hot?current=` | 热门口碑分页 | 🔓 |
| GET | `/review/of/me?current=` | 我的口碑 | 🔐 |
| GET | `/review/of/user?id=&current=` | 指定用户的口碑 | 🔐 |
| GET | `/review/of/follow?lastId=&offset=` | 关注流（滚动分页，返回 ScrollResult） | 🔐 |

## 关注 `/follow`

| 方法 | 路径 | 说明 | 登录 |
|------|------|------|------|
| PUT | `/follow/{id}/{isFollow}` | 关注 / 取关（Set 存双向关系） | 🔐 |
| GET | `/follow/or/not/{id}` | 是否已关注 | 🔐 |
| GET | `/follow/common/{id}` | 共同关注（Set 交集） | 🔐 |

## 上传 `/upload`

| 方法 | 路径 | 说明 | 登录 |
|------|------|------|------|
| POST | `/upload/review` | multipart 字段名 `file`，返回图片路径 | 🔓 |
| GET | `/upload/review/delete?name=` | 删图 | 🔓 |

> 落盘目录见 `SystemConstants.IMAGE_UPLOAD_DIR`（默认 `src/main/resources/static/imgs`），
> 可用 `-Daxle.upload.dir=...` 覆盖。

## 没实现的部分（别照着写前端）

- `/review-comments` 是个空 Controller，**口碑评论功能后端没做**（只有 entity / mapper）。
- UV 统计（HyperLogLog）只在测试类里跑过，没有对外接口。
- 秒杀是**异步**的：接口返回订单 id 时，订单可能还没落库（走 Redis Stream + 后台消费者）。
  前端别拿返回值立刻查订单表。
