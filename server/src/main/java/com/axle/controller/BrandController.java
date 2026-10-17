package com.axle.controller;


import com.axle.dto.Result;
import com.axle.entity.Brand;
import com.axle.service.IBrandService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import javax.annotation.Resource;
import java.util.List;

/**
 * <p>
 * 前端控制器
 * </p>
 *
 * @author 虎哥
 * @since 2021-12-22
 */
@RestController
@RequestMapping("/brand")
public class BrandController {
    @Resource
    private IBrandService typeService;

    @GetMapping("list")
    public Result queryTypeList() {
        return typeService.getTypeList();
    }
}
