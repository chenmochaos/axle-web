package com.axle.service.impl;

import cn.hutool.core.util.StrUtil;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.axle.dto.Result;
import com.axle.entity.Car;
import com.axle.mapper.CarMapper;
import com.axle.service.ICarService;
import com.axle.utils.CacheClient;
import com.axle.utils.RedisConstants;
import com.axle.utils.SystemConstants;
import org.springframework.data.geo.Distance;
import org.springframework.data.geo.GeoResult;
import org.springframework.data.geo.GeoResults;
import org.springframework.data.redis.connection.RedisGeoCommands;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.domain.geo.GeoReference;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import javax.annotation.Resource;

import java.util.*;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;

import static com.axle.utils.RedisConstants.*;

/**
 * <p>
 * 服务实现类
 * </p>
 *
 * @author 虎哥
 * @since 2021-12-22
 */
@Service
public class CarServiceImpl extends ServiceImpl<CarMapper, Car> implements ICarService {
    @Resource
    private StringRedisTemplate stringRedisTemplate;
    @Resource
    private CacheClient cacheClient;

    @Override
    public Result queryById(Long id) {
        //缓存穿透
//        Car car = queryWithPassThrough(id);
//        Car car = cacheClient.queryWithPassThrough(CACHE_CAR_KEY, id, Car.class, this::getById, CACHE_CAR_TTL, TimeUnit.MINUTES);
        //互斥锁解决缓存击穿
//        Car car = queryWithMutex(id);
        //逻辑过期解决缓存击穿
//        Car car = queryWithLogicalExpire(id);
        Car car = cacheClient.queryWithLogicalExpire(CACHE_CAR_KEY, id, Car.class, this::getById, CACHE_CAR_TTL, TimeUnit.MINUTES);
        if (car == null) {
            return Result.fail("车源不存在");
        }
        return Result.ok(car);
    }

    /**
     * 互斥锁解决缓存击穿
     *
     * @param id id
     * @return {@link Car}
     */
    /*private Car queryWithMutex(Long id) {
        String carKey = CACHE_CAR_KEY + id;
        //从redis中查询
        String carJson = stringRedisTemplate.opsForValue().get(carKey);
        //判断是否存在
        if (StringUtils.isNotEmpty(carJson)) {
            //存在直接返回
            return JSONUtil.toBean(carJson, Car.class);
        }
        //判断控值
        if ("".equals(carJson)) {
            return null;
        }
        //实现缓存重建
        //获取互斥锁
        String lockKey = LOCK_CAR_KEY + id;
        Car car = null;
        try {
            boolean isLock = tryLock(lockKey);
            //是否获取成功
            if (!isLock) {
                //获取失败 休眠并且重试
                Thread.sleep(50);
                return queryWithMutex(id);
            }
            //成功 通过id查询数据库
            car = getById(id);
            //模拟重建延时
            Thread.sleep(200);
            if (car == null) {
                //redis写入空值
                stringRedisTemplate.opsForValue().set(carKey, "", CACHE_NULL_TTL, TimeUnit.MINUTES);
                //数据库不存在 返回错误
                return null;
            }
            //数据库存在 写入redis
            stringRedisTemplate.opsForValue().set(carKey, JSONUtil.toJsonStr(car), CACHE_CAR_TTL, TimeUnit.MINUTES);
        } catch (InterruptedException e) {
            throw new RuntimeException(e);
        } finally {
            //释放互斥锁
            unLock(lockKey);
        }
        //返回
        return car;
    }*/

    /**
     * 逻辑过期解决缓存击穿
     *
     * @param id id
     * @return {@link Car}
     */
    /*private Car queryWithLogicalExpire(Long id) {
        String carKey = CACHE_CAR_KEY + id;
        //从redis中查询
        String carJson = stringRedisTemplate.opsForValue().get(carKey);
        //判断是否存在
        if (StringUtils.isEmpty(carJson)) {
            //不存在返回空
            return null;
        }
        //命中 反序列化
        RedisDate redisDate = JSONUtil.toBean(carJson, RedisDate.class);
        JSONObject jsonObject = (JSONObject) redisDate.getData();
        Car car = BeanUtil.toBean(jsonObject, Car.class);
        LocalDateTime expireTime = redisDate.getExpireTime();
        //判断是否过期
        if (expireTime.isAfter(LocalDateTime.now())) {
            //未过期 直接返回
            return car;
        }
        //已过期
        //获取互斥锁
        String lockKey = LOCK_CAR_KEY + id;
        boolean flag = tryLock(lockKey);
        //是否获取锁成功
        if (flag) {
            //成功 异步重建
            CACHE_REBUILD_EXECUTOR.submit(() -> {
                try {
                    this.saveCarToRedis(id, 20L);
                } catch (InterruptedException e) {
                    throw new RuntimeException(e);
                } finally {
                    //释放锁
                    unLock(lockKey);
                }
            });
        }
        //返回过期车源信息
        return car;
    }*/

    /**
     * 使用设置空值解决缓存穿透
     */
   /* private Car queryWithPassThrough(Long id) {
        String carKey = CACHE_CAR_KEY + id;
        //从redis中查询
        String carJson = stringRedisTemplate.opsForValue().get(carKey);
        //判断是否存在
        if (StringUtils.isNotEmpty(carJson)) {
            //存在直接返回
            return JSONUtil.toBean(carJson, Car.class);
        }
        //判断空值
        if ("".equals(carJson)) {
            return null;
        }
        //不存在 查询数据库
        Car car = getById(id);
        if (car == null) {
            //redis写入空值
            stringRedisTemplate.opsForValue().set(carKey, "", CACHE_NULL_TTL, TimeUnit.MINUTES);
            //数据库不存在 返回错误
            return null;
        }
        //数据库存在 写入redis
        stringRedisTemplate.opsForValue().set(carKey, JSONUtil.toJsonStr(car), CACHE_CAR_TTL, TimeUnit.MINUTES);
        //返回
        return car;
    }*/
    @Override
    @Transactional(rollbackFor = Exception.class)
    public Result update(Car car) {
        Long id = car.getId();
        if (id == null) {
            return Result.fail("id不能为空");
        }
        //更新数据库
        updateById(car);
        //删除缓存
        stringRedisTemplate.delete(CACHE_CAR_KEY + car.getId());
        return Result.ok();
    }

    @Override
    public Result queryCarByType(Integer typeId, Integer current, String kind, Double x, Double y) {
        //判断是否需要坐标查询
        if (x == null || y == null) {
            //不需要坐标查询
            // typeId / kind 都是可选条件：`eq(condition, ...)` 的第一个参数为 false 时该条件
            // 整条不拼进 SQL。因此「不筛品牌」与「不筛大类」不需要各写一个分支。
            //
            // `orderByAsc(id)` 不能省。没有 ORDER BY 时 MySQL 不保证任何顺序，而
            // **分页的正确性依赖一个稳定顺序** —— 两次请求若给出不同顺序，第 1 页与第 2 页
            // 会互相重叠、也会漏掉行，而且不报错。实践中 InnoDB 走主键扫描恰好是升序，
            // 但那是实现细节不是契约。前端的 mock 按同一口径（id 升序）排，
            // 两边顺序必须一致，否则「同一页、两种数据源」这条验收判据不成立。
            Page<Car> page = lambdaQuery()
                    .eq(typeId != null, Car::getTypeId, typeId)
                    .eq(StrUtil.isNotBlank(kind), Car::getKind, kind)
                    .orderByAsc(Car::getId)
                    .page(new Page<>(current, SystemConstants.MAX_PAGE_SIZE));
            return Result.ok(page.getRecords());
        }
        //计算分页参数
        int from = (current - 1) * SystemConstants.MAX_PAGE_SIZE;
        int end = current * SystemConstants.MAX_PAGE_SIZE;
        //查询redis 距离排序 分页
        // 不筛类型时走全量索引，否则走该类型的分片键
        String key = typeId == null ? CAR_GEO_ALL_KEY : CAR_GEO_KEY + typeId;
        GeoResults<RedisGeoCommands.GeoLocation<String>> results = stringRedisTemplate.opsForGeo()
                .search(key
                        , GeoReference.fromCoordinate(x, y)
                        , new Distance(5000)
                        , RedisGeoCommands.GeoSearchCommandArgs.newGeoSearchArgs().includeDistance().limit(end)
                );
        //解析出id
        if (results==null){
            return Result.ok(Collections.emptyList());
        }
        List<GeoResult<RedisGeoCommands.GeoLocation<String>>> content = results.getContent();
        //注意是 <= 而非 <：from=0 且 GEO 中无数据时，< 判断会放行，
        //随后拼出 "order by field(id,)" 这条非法 SQL，接口报「服务器异常」
        if (content.size()<=from){
            //没有下一页
            return Result.ok(Collections.emptyList());
        }
        //截取
        List<Long> ids=new ArrayList<>(content.size());
        Map<String,Distance> distanceMap=new HashMap<>();
        content.stream().skip(from).forEach(result->{
            //车源id
            String carId = result.getContent().getName();
            ids.add(Long.valueOf(carId));
            //距离
            Distance distance = result.getDistance();
            distanceMap.put(carId,distance);
        });
        //根据id查询car
        String join = StrUtil.join(",", ids);
        // kind 在**这一层**筛，不是在 GEO 那一步 —— GEO 只认坐标，没有属性过滤能力。
        // 代价是：筛完之后这一页可能不足 10 条，甚至为空，而窗口外其实还有匹配的车。
        // 附近优先 + 大类同时开的时候，「这一页少」不等于「没有了」，前端不要据此断定到底了。
        List<Car> carList = lambdaQuery()
                .in(Car::getId, ids)
                .eq(StrUtil.isNotBlank(kind), Car::getKind, kind)
                .last("order by field(id," + join + ")").list();
        for (Car car : carList) {
            car.setDistance(distanceMap.get(car.getId().toString()).getValue());
        }
        return Result.ok(carList);
    }

//    private static final ExecutorService CACHE_REBUILD_EXECUTOR = Executors.newFixedThreadPool(10);

    /*    *//**
     * 获取锁
     *
     * @param key 关键
     * @return boolean
     *//*
    private boolean tryLock(String key) {
        Boolean flag = stringRedisTemplate.opsForValue().setIfAbsent(key, "1", LOCK_CAR_TTL, TimeUnit.SECONDS);
        return BooleanUtil.isTrue(flag);
    }

    *//**
     * 释放锁
     *
     * @param key 关键
     *//*
    private void unLock(String key) {
        stringRedisTemplate.delete(key);
    }

    *//**
     * 存入redis 携带逻辑过期时间
     *//*
    public void saveCarToRedis(Long id, Long expireSeconds) throws InterruptedException {
        //查询车源数据
        Car car = getById(id);
        Thread.sleep(200);
        //封装逻辑过期
        RedisDate redisDate = new RedisDate();
        redisDate.setData(car);
        redisDate.setExpireTime(LocalDateTime.now().plusSeconds(expireSeconds));
        //写了redis
        stringRedisTemplate.opsForValue().set(CACHE_CAR_KEY + id, JSONUtil.toJsonStr(redisDate));
    }*/
}
