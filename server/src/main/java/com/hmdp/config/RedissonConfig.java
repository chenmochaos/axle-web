package com.hmdp.config;

import cn.hutool.core.util.StrUtil;
import org.redisson.Redisson;
import org.redisson.api.RedissonClient;
import org.redisson.config.Config;
import org.redisson.config.SingleServerConfig;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * redisson配置
 *
 * @author CHEN
 * @date 2022/10/10
 */
@Configuration
public class RedissonConfig {
    @Value("${spring.redis.host}")
    private String host;
    @Value("${spring.redis.port}")
    private String port;
    @Value("${spring.redis.password:}")
    private String password;
    @Bean
    public RedissonClient redissonClient(){
        //配置
        Config config=new Config();
        SingleServerConfig serverConfig = config.useSingleServer()
                .setAddress("redis://"+host+":"+port);
        //本机 Redis 未设密码；setPassword("") 仍会发出 AUTH 命令并被服务端拒绝，
        //必须留空不调用 setPassword（Redisson 3.x 不会跳过空字符串）
        if (StrUtil.isNotBlank(password)) {
            serverConfig.setPassword(password);
        }
        //创建对并且返回
        return Redisson.create(config);
    }

}
