#!/usr/bin/env bash
#
# 预热商铺详情缓存 cache:shop:{id}（逻辑过期方案）。
#
# ── 为什么必须有这个脚本 ─────────────────────────────────────────────────
#
# `ShopServiceImpl.queryById` 走的是 `CacheClient.queryWithLogicalExpire`，
# 而它的实现是：**缓存没命中就直接返回 null，不回查数据库**（假设缓存已被预热）。
# 于是 `GET /shop/{id}` 会返回 `{"success":false,"errorMsg":"店铺不存在"}` ——
# 店铺明明在 MySQL 里。这不是接口坏了，是缓存冷启动。
#
# 教程里这一步靠 IDE 手动跑 `RedisTest#testSaveShop`，没落成脚本；Redis 一重启
# 详情页就全挂。Geo（`init-redis-geo.sh`）和秒杀库存（`init-seckill-stock.sh`）
# 都已经被脚本化了，这是第三块。
#
# 预热一次即可：值的 `expireTime` 到点后，下一次读会拿到互斥锁、异步回源重建，
# 之后自维持。**Redis 被 flush 或重启后需要重跑。**
#
# 用法：./scripts/init-shop-cache.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT/.env"

if [ ! -f "$ENV_FILE" ]; then
    echo "找不到 $ENV_FILE —— 需要里面的 MYSQL_PASSWORD" >&2
    exit 1
fi

PW="$(grep -E '^MYSQL_PASSWORD=' "$ENV_FILE" | cut -d= -f2-)"
if [ -z "$PW" ]; then
    echo "$ENV_FILE 里没有 MYSQL_PASSWORD" >&2
    exit 1
fi

if ! redis-cli ping >/dev/null 2>&1; then
    echo "Redis 没起来（redis-cli ping 失败）" >&2
    exit 1
fi

# **先清空再重建**：键一旦存在就一直是它，`SET` 会覆盖但删掉的店铺会留下幽灵键。
redis-cli --scan --pattern 'cache:shop:*' | xargs -r redis-cli del >/dev/null

# ── JSON 形状必须和 Java 端逐字一致 ────────────────────────────────────────
#
# `CacheClient.setWithLogicalExpire` 写的是 `JSONUtil.toJsonStr(RedisData)`，
# Hutool 的产物长这样（实测自 `RedisTest#testSaveShop` 写下的值）：
#
#   {"expireTime":1792146143313,"data":{"id":5,"name":"…","typeId":1,…}}
#
# 两个容易踩的点：
#   1. `expireTime` 是 **epoch 毫秒数字**，不是 ISO 串。Hutool 反序列化时把数字
#      当毫秒解析成 LocalDateTime；写成字符串会解析失败。
#   2. `sold` / `comments` / `score` 这几列在 DDL 里是 `ZEROFILL`，直接 SELECT
#      出来是 `0000004215` 这种带前导零的**字符串**。JSON_OBJECT 里必须套一次
#      CAST(... AS SIGNED)，否则前端拿到的是字符串、`v-for` 里做算术会出现
#      "0000004215" 这类结果。
#
# `expireTime` 取 30 分钟，与 `RedisConstants.CACHE_SHOP_TTL` 对齐。
count=0
while IFS=$'\t' read -r key val; do
    [ -z "${key:-}" ] && continue
    printf '%s' "$val" | redis-cli -x set "$key" >/dev/null
    count=$((count + 1))
done < <(mysql -udev -p"$PW" hmdp -N -B -e "
select concat('cache:shop:', id),
       json_object(
         'expireTime', unix_timestamp(date_add(now(), interval 30 minute)) * 1000,
         'data', json_object(
           'id',           id,
           'name',         name,
           'typeId',       type_id,
           'images',       images,
           'area',         area,
           'address',      address,
           'x',            x,
           'y',            y,
           'avgPrice',     avg_price,
           'sold',         cast(sold     as signed),
           'comments',     cast(comments as signed),
           'score',        cast(score    as signed),
           'openHours',    open_hours,
           'mileage',      mileage,
           'registerDate', register_date,
           'gearbox',      gearbox,
           'fuel',         fuel,
           'displacement', displacement,
           'ownerCount',   owner_count,
           'kind',         kind,
           'originalPrice', original_price,
           'createTime',   unix_timestamp(create_time) * 1000,
           'updateTime',   unix_timestamp(update_time) * 1000
         )
       )
  from tb_shop;" 2>/dev/null)

echo "已预热 $count 条商铺详情缓存"
redis-cli --scan --pattern 'cache:shop:*' | wc -l | xargs printf '  cache:shop:* 共 %s 个键\n'
