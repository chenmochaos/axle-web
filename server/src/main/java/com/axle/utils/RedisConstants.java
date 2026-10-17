package com.axle.utils;

public class RedisConstants {
    public static final String LOGIN_CODE_KEY = "login:code:";
    public static final Long LOGIN_CODE_TTL = 2L;
    public static final String LOGIN_USER_KEY = "login:token:";
    public static final Long LOGIN_USER_TTL = 30L;

    public static final Long CACHE_NULL_TTL = 2L;

    public static final Long CACHE_CAR_TTL = 30L;
    public static final String CACHE_CAR_KEY = "cache:car:";

    public static final String LOCK_CAR_KEY = "lock:car:";
    public static final Long LOCK_CAR_TTL = 10L;

    public static final String CACHE_TYPE_KEY = "cache:brand";

    public static final String SECKILL_STOCK_KEY = "seckill:stock:";
    public static final String REVIEW_LIKED_KEY = "review:liked:";
    public static final String FEED_KEY = "feed:";
    public static final String CAR_GEO_KEY = "car:geo:";

    /**
     * 全量坐标索引，键名固定为 car:geo:all。
     *
     * 为什么需要它：`car:geo:{typeId}` 是按类型分片的，而「不筛类型的附近车源」
     * （`/car/list` 不带 typeId 但带 x/y）在分片键上无法一次查完 —— 得遍历所有分片再归并。
     * 多写一份全量索引是最省的解法，代价是一份冗余数据，由 init-car-geo.sh 一并重建。
     */
    public static final String CAR_GEO_ALL_KEY = "car:geo:all";
    public static final String USER_SIGN_KEY = "sign:";
}
