# hmdp 完整版后端接口清单

分支 `master-local`（源自原作者 `master`，本机适配）。写前端时对照这份表。

## 认证

- **登录态**：`POST /user/login` 返回 token 字符串，之后所有需登录的接口都带请求头
  `authorization: <token>`（注意是**小写** header 名，拦截器读的就是这个 key）。
- **Token 存储**：Redis `login:token:<token>`（Hash：id / nickName / icon），TTL 30 分钟，
  每次带 token 请求都会被 `RefreshTokenInterceptor` 续期。
- **拦截器规则**（`config/MvcConfig.java`）：仅以下路径免登录，其余一律需要 token。

  ```
  /user/code  /user/login  /blog/hot  /shop/**  /shop-type/**  /upload/**  /voucher/**
  ```

- 未登录访问受保护接口 → `{"success":false,"errorMsg":"请登录"}`。
- 统一响应体：`{"success":bool,"errorMsg":string|null,"data":any,"total":long|null}`。

## 用户 `/user`

| 方法 | 路径 | 说明 | 登录 |
|------|------|------|------|
| POST | `/user/code?phone=` | 发验证码，存 Redis `login:code:<phone>` TTL 2min | 🔓 |
| POST | `/user/login` | body `{"phone":"...","code":"..."}`，返回 token | 🔓 |
| POST | `/user/logout` | 登出，删 Redis token | 🔐 |
| GET | `/user/me` | 当前用户 | 🔐 |
| GET | `/user/{id}` | 用户简讯（昵称/头像） | 🔐 |
| GET | `/user/info/{id}` | 用户详情（含粉丝数、关注数、是否已关注） | 🔐 |
| POST | `/user/sign` | 签到（Redis BitMap 按月存） | 🔐 |
| GET | `/user/sign/count` | 本月连续签到天数 | 🔐 |

## 商户类型 `/shop-type`

| 方法 | 路径 | 说明 | 登录 |
|------|------|------|------|
| GET | `/shop-type/list` | 全部类型，Redis List 缓存 | 🔓 |

## 商户 `/shop`

| 方法 | 路径 | 说明 | 登录 |
|------|------|------|------|
| GET | `/shop/{id}` | 详情。缓存穿透用空值缓存、缓存击穿用逻辑过期 | 🔓 |
| POST | `/shop` | 新增（body: Shop） | 🔓 |
| PUT | `/shop` | 更新，同时删缓存 | 🔓 |
| GET | `/shop/of/type?typeId=&current=&x=&y=` | 带 x/y 走 Redis GEO 距离排序，不带则普通分页 | 🔓 |
| GET | `/shop/of/name?name=&current=` | 按名称模糊搜 | 🔓 |

> 单页条数由 `SystemConstants.MAX_PAGE_SIZE` 控制（当前 10）。

## 优惠券 `/voucher`

| 方法 | 路径 | 说明 | 登录 |
|------|------|------|------|
| GET | `/voucher/list/{shopId}` | 该店铺的券（普通券 + 秒杀券） | 🔓 |
| POST | `/voucher` | 新增普通券 | 🔓 |
| POST | `/voucher/seckill` | 新增秒杀券 | 🔓 |

## 秒杀下单 `/voucher-order`

| 方法 | 路径 | 说明 | 登录 |
|------|------|------|------|
| POST | `/voucher-order/seckill/{voucherId}` | 下单。成功返回订单 id（雪花式 Redis 自增） | 🔐 |

失败响应（Lua 返回码 → 文案）：

| code | errorMsg |
|------|----------|
| 1 | 库存不足 |
| 2 | 禁止重复下单 |
| 3 | 优惠券不存在或库存未预热 |

## 探店笔记 `/blog`

| 方法 | 路径 | 说明 | 登录 |
|------|------|------|------|
| POST | `/blog` | 发布笔记（body: Blog，images 为逗号分隔 URL） | 🔐 |
| GET | `/blog/{id}` | 详情，带作者信息与当前用户是否点赞 | 🔐 |
| PUT | `/blog/like/{id}` | 点赞 / 取消（SortedSet 存点赞时间） | 🔐 |
| GET | `/blog/likes/{id}` | 点赞排行榜 Top5 | 🔐 |
| GET | `/blog/hot?current=` | 热门笔记分页 | 🔓 |
| GET | `/blog/of/me?current=` | 我的笔记 | 🔐 |
| GET | `/blog/of/user?id=&current=` | 指定用户的笔记 | 🔐 |
| GET | `/blog/of/follow?lastId=&offset=` | 关注流（滚动分页，返回 ScrollResult） | 🔐 |

## 关注 `/follow`

| 方法 | 路径 | 说明 | 登录 |
|------|------|------|------|
| PUT | `/follow/{id}/{isFollow}` | 关注 / 取关（Set 存双向关系） | 🔐 |
| GET | `/follow/or/not/{id}` | 是否已关注 | 🔐 |
| GET | `/follow/common/{id}` | 共同关注（Set 交集） | 🔐 |

## 上传 `/upload`

| 方法 | 路径 | 说明 | 登录 |
|------|------|------|------|
| POST | `/upload/blog` | multipart 字段名 `file`，返回图片路径 | 🔓 |
| GET | `/upload/blog/delete?name=` | 删图 | 🔓 |

> 落盘目录见 `SystemConstants.IMAGE_UPLOAD_DIR`，可用 `-Dhmdp.upload.dir=...` 覆盖。

## 没实现的部分（别照着写前端）

- `/blog-comments` 是个空 Controller，**笔记评论功能后端没做**（只有 entity / mapper）。
- UV 统计（HyperLogLog）只在测试类里跑过，没有对外接口。
- 秒杀是**异步**的：接口返回订单 id 时，订单可能还没落库（走 Redis Stream + 后台消费者）。
  前端别拿返回值立刻查订单表。
