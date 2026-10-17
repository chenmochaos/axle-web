import cn.hutool.core.bean.BeanUtil;
import cn.hutool.json.JSONUtil;
import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.axle.AxleApplication;
import com.axle.entity.Car;
import com.axle.entity.Voucher;
import com.axle.service.impl.CarServiceImpl;
import com.axle.utils.CacheClient;
import com.axle.utils.RedisConstants;
import com.axle.utils.RedisIdWorker;
import lombok.extern.slf4j.Slf4j;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.data.geo.Point;
import org.springframework.data.redis.connection.RedisGeoCommands;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.domain.geo.GeoLocation;
import org.springframework.http.converter.json.Jackson2ObjectMapperFactoryBean;

import javax.annotation.Resource;
import java.io.Writer;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;

import static com.axle.utils.RedisConstants.*;

@SpringBootTest(classes = AxleApplication.class)
public class RedisTest {
    @Resource
    private CacheClient cacheClient;
    @Resource
    private CarServiceImpl carService;
    @Resource
    private RedisIdWorker redisIdWorker;
    @Resource
    private StringRedisTemplate stringRedisTemplate;

    @Test
    public void testSaveCar() throws InterruptedException {
        //预热
        List<Car> carList = carService.list();
        for (Car car : carList) {
            cacheClient.setWithLogicalExpire(CACHE_CAR_KEY + car.getId(), car, 30L, TimeUnit.MINUTES);
        }
    }

    @Test
    public void testIdWorker() throws InterruptedException {
        ExecutorService executorService = Executors.newFixedThreadPool(500);
        CountDownLatch countDownLatch = new CountDownLatch(300);
        Runnable task = () -> {
            for (int i = 0; i < 100; i++) {
                Long id = redisIdWorker.nextId("order");
                //println有同步锁 会增加耗时
                System.out.println("id:" + id);
            }
            countDownLatch.countDown();
        };
        long begin = System.currentTimeMillis();
        for (int i = 0; i < 300; i++) {
            executorService.submit(task);
        }
        countDownLatch.await();
        long end = System.currentTimeMillis();
        System.out.println("耗时：" + (end - begin));
    }

    @Test
    public void testLoadCarData() {
        //查询店铺信息
        List<Car> list = carService.list();
        //分组
        Map<Long, List<Car>> map = list.stream().collect(Collectors.groupingBy(Car::getTypeId));
        //分批写入
        for (Map.Entry<Long, List<Car>> longListEntry : map.entrySet()) {
            //获取类型id
            Long typeId = longListEntry.getKey();
            //获取店铺集合
            List<Car> value = longListEntry.getValue();
            List<RedisGeoCommands.GeoLocation<String>> locations=new ArrayList<>(value.size());
            //写入redis
            String key = CAR_GEO_KEY + typeId;
            /*for (Car car : value) {
                Double x = car.getX();
                Double y = car.getY();
                stringRedisTemplate.opsForGeo()
                        .add(key
                                , new Point(x, y)
                                , car.getId().toString());
            }*/
            for (Car car : value) {
                locations.add(new RedisGeoCommands.GeoLocation<>(car.getId().toString(),new Point(car.getX(),car.getY())));
            }
            stringRedisTemplate.opsForGeo().add(key,locations);
        }
    }

    @Test
    public void testHyperLogLog(){
        String[] values=new String[1000];
        int j=0;
        for (int i = 0; i < 1000000; i++) {
            j=i%1000;
            values[j]="user_"+i;
            if (j==999){
                stringRedisTemplate.opsForHyperLogLog().add("hl1",values);
            }
        }
        Long hl1 = stringRedisTemplate.opsForHyperLogLog().size("hl1");
        System.out.println(hl1);
    }
}
