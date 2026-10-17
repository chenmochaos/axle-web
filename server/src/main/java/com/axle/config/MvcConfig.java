package com.axle.config;

import com.axle.interceptor.LoginInterceptor;
import com.axle.interceptor.RefreshTokenInterceptor;
import org.springframework.boot.autoconfigure.web.servlet.WebMvcAutoConfiguration;
import org.springframework.cache.annotation.CacheConfig;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import javax.annotation.Resource;

/**
 * mvc配置
 *
 * @author CHEN
 * @date 2022/10/07
 */
@Configuration
public class MvcConfig implements WebMvcConfigurer {
    @Resource
    private StringRedisTemplate stringRedisTemplate;

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        //登陆拦截器
        registry
                .addInterceptor(new LoginInterceptor())
                .excludePathPatterns("/user/code"
                        , "/user/login"
                        , "/review/hot"
                        , "/car/**"
                        , "/brand/**"
                        , "/upload/**"
                        , "/voucher/**"
                        // "/error" 必须排除：Spring 处理未捕获异常时会把请求**转发**到 /error，
                        // 那是一次新的分发，会再过一遍拦截器。不排除的话任何后端异常
                        // （500、缺参数、SQL 写错）最后都会被改写成 401 —— 前端看到的是
                        // 「请登录」，而真实原因被吞掉了。排查时最坑的一种错。
                        , "/error"
                )
                .order(1);
        //Token续命拦截器
        registry
                .addInterceptor(new RefreshTokenInterceptor(stringRedisTemplate))
                .addPathPatterns("/**")
                .order(0);
    }
}
