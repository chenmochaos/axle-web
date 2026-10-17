#!/usr/bin/env bash
#
# 预热秒杀库存到 Redis：seckill:stock:{voucherId}
#
# 为什么需要这个：seckill.lua 第 21 行是
#     if (tonumber(redis.call('get', stockKey)) <= 0) then
# stockKey 不存在时 GET 返回 false，tonumber(false) 得到 nil，
# nil <= 0 直接抛 "attempt to compare nil with number"，
# 接口对外表现为「服务器异常」而不是「库存不足」。
# 教程里是手工在 Redis 里 SET 的，没落成脚本；Redis 重启后要重跑。
#
# 幂等：重复执行会把库存重置为数据库里的值（已扣减的订单不会回滚）。
# 用法：./scripts/init-seckill-stock.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT/.env"

if [ ! -f "$ENV_FILE" ]; then
    echo "找不到 $ENV_FILE —— 需要里面的 MYSQL_PASSWORD" >&2
    exit 1
fi
PW="$(grep -E '^MYSQL_PASSWORD=' "$ENV_FILE" | cut -d= -f2-)"

if ! redis-cli ping >/dev/null 2>&1; then
    echo "Redis 没起来（redis-cli ping 失败）" >&2
    exit 1
fi

echo "预热秒杀库存："
while IFS=$'\t' read -r vid stock; do
    [ -z "${vid:-}" ] && continue
    redis-cli set "seckill:stock:${vid}" "$stock" >/dev/null
    printf '  seckill:stock:%s = %s\n' "$vid" "$stock"
done < <(mysql -udev -p"$PW" hmdp -N -B \
    -e "select voucher_id, stock from tb_seckill_voucher;" 2>/dev/null)
