#!/usr/bin/env bash
#
# 把 tb_shop 的经纬度刷进 Redis GEO，供「附近商铺」接口使用。
#
# 为什么需要这个：hmdp.sql 只灌了 MySQL，Redis 里的 shop:geo:{typeId} 是空的，
# 而教程是靠 IDE 里手动跑一个 @Test loadShopData() 导入的，没有落成脚本。
# Redis 重启后 GEO 数据会丢，重跑本脚本即可。
#
# 用法：./scripts/init-redis-geo.sh
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

# **先清空再重建。** GEOADD 对已存在的 member 只更新坐标、不移除 —— 所以当某家店的
# type_id 变了（usedcar.sql 把餐饮店改成车源就是这种），旧 key 里的那个 member 会留下来，
# 而 /shop/of/type 拿到 GEO 结果后**不会**再按 type_id 过滤。于是类型切换过的店会同时
# 出现在两个品牌下，凭空多出一批不该有的车。
#
# 这个脚本的语义本来就是「用 MySQL 覆盖 Redis」（见文件头），所以整块删掉再重建是对的 ——
# 数据全部来自 tb_shop，删掉即可从源头还原。
redis-cli --scan --pattern 'shop:geo:*' | xargs -r redis-cli del >/dev/null

# 从 MySQL 读坐标，逐条 GEOADD。坐标在 tb_shop.x / tb_shop.y
#
# 每条坐标写**两份**：按类型分片的 `shop:geo:{typeId}`，以及全量索引 `shop:geo:all`。
# 后者服务于「不筛品牌的附近车源」—— 那种查询在分片键上没法一次查完
# （得遍历所有分片再归并），多一份冗余索引是最省的解法。
# 两者必须由同一个脚本一起写，只更新其中一个会让「全部」和「某品牌」的附近结果对不上。
count=0
while IFS=$'\t' read -r type_id id x y; do
    [ -z "${type_id:-}" ] && continue
    redis-cli geoadd "shop:geo:${type_id}" "$x" "$y" "$id" >/dev/null
    redis-cli geoadd "shop:geo:all"      "$x" "$y" "$id" >/dev/null
    count=$((count + 1))
done < <(mysql -udev -p"$PW" hmdp -N -B \
    -e "select type_id, id, x, y from tb_shop where x is not null and y is not null;" 2>/dev/null)

echo "已写入 $count 条商铺坐标"
redis-cli --scan --pattern 'shop:geo:*' | sort | while read -r k; do
    printf '  %s -> %s 条\n' "$k" "$(redis-cli zcard "$k")"
done
