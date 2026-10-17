package com.axle.config;

import com.axle.interceptor.LoginInterceptor;
import com.axle.interceptor.RefreshTokenInterceptor;
import com.axle.utils.SystemConstants;
import org.springframework.boot.autoconfigure.web.servlet.WebMvcAutoConfiguration;
import org.springframework.cache.annotation.CacheConfig;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import javax.annotation.Resource;
import java.nio.file.Paths;

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
                        // 登出必须放行：token 已过期时也要能清掉服务端副本（删除不存在的 key 是幂等的）
                        , "/user/logout"
                        // 车商主页是公开页；不含手机号等私有字段。
                        // 用单星号：`/user/profile/**` 会连 `PUT /user/profile`（无尾段）一起放行，
                        // 那样改资料就不再要求登录了。
                        , "/user/profile/*"
                        , "/review/hot"
                        // 口碑详情 / 点赞榜 / 某作者的口碑，都是公开内容。
                        // `/review/of/me`、`/review/of/follow` 是两段路径，不会被 `/review/*` 放行。
                        , "/review/*"
                        , "/review/likes/*"
                        , "/review/of/user"
                        , "/car/**"
                        , "/brand/**"
                        , "/upload/**"
                        // 上传后的图片是静态资源，通过 /imgs/** 直接访问。
                        // 不放行的话 <img src> 会拿到 401，页面只显示裂图。
                        , "/imgs/**"
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

    /**
     * 上传目录在 classpath 之外（见 `SystemConstants.IMAGE_UPLOAD_DIR` 的注释），
     * 必须显式把 URL 前缀映射到真实文件系统，否则写进去的图永远 404。
     */
    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        String location = Paths.get(SystemConstants.IMAGE_UPLOAD_DIR)
                .toAbsolutePath()
                .normalize()
                .toUri()
                .toString();
        // Spring 要求 location 以 `/` 结尾；目录尚不存在时 toUri() 不会补
        if (!location.endsWith("/")) {
            location += "/";
        }
        registry.addResourceHandler("/imgs/**").addResourceLocations(location);
    }
}
