package com.axle;

import org.mybatis.spring.annotation.MapperScan;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * 启动类
 *
 * @author CHEN
 * @date 2022/10/07
 */
@MapperScan("com.axle.mapper")
@SpringBootApplication
public class AxleApplication {

    public static void main(String[] args) {
        SpringApplication.run(AxleApplication.class, args);
    }

}
