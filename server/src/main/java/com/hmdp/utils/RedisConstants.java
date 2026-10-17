package com.hmdp.utils;

public class RedisConstants {
    public static final String LOGIN_CODE_KEY = "login:code:";
    public static final Long LOGIN_CODE_TTL = 2L;
    public static final String LOGIN_USER_KEY = "login:token:";
    public static final Long LOGIN_USER_TTL = 30L;

    public static final Long CACHE_NULL_TTL = 2L;

    public static final Long CACHE_SHOP_TTL = 30L;
    public static final String CACHE_SHOP_KEY = "cache:shop:";

    public static final String LOCK_SHOP_KEY = "lock:shop:";
    public static final Long LOCK_SHOP_TTL = 10L;

    public static final String CACHE_TYPE_KEY = "cache:type";

    public static final String SECKILL_STOCK_KEY = "seckill:stock:";
    public static final String BLOG_LIKED_KEY = "blog:liked:";
    public static final String FEED_KEY = "feed:";
    public static final String SHOP_GEO_KEY = "shop:geo:";

    /**
     * 全量坐标索引，键名固定为 shop:geo:all。
     *
     * 为什么需要它：`shop:geo:{typeId}` 是按类型分片的，而「不筛类型的附近车源」
     * （`/shop/of/type` 不带 typeId 但带 x/y）在分片键上无法一次查完 —— 得遍历所有分片再归并。
     * 多写一份全量索引是最省的解法，代价是一份冗余数据，由 init-redis-geo.sh 一并重建。
     */
    public static final String SHOP_GEO_ALL_KEY = "shop:geo:all";
    public static final String USER_SIGN_KEY = "sign:";
}
