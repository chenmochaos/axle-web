package com.axle.controller;


import cn.hutool.core.util.StrUtil;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.axle.dto.Result;
import com.axle.entity.Car;
import com.axle.service.ICarService;
import com.axle.utils.SystemConstants;
import org.springframework.web.bind.annotation.*;

import javax.annotation.Resource;

/**
 * <p>
 * 前端控制器
 * </p>
 *
 * @author 虎哥
 * @since 2021-12-22
 */
@RestController
@RequestMapping("/car")
public class CarController {

    @Resource
    public ICarService carService;

    /**
     * 根据id查询车源信息
     * @param id 车源id
     * @return 车源详情数据
     */
    @GetMapping("/{id}")
    public Result queryCarById(@PathVariable("id") Long id) {
        return carService.queryById(id);
    }

    /**
     * 新增车源信息
     * @param car 车源数据
     * @return 车源id
     */
    @PostMapping
    public Result saveCar(@RequestBody Car car) {
        // 写入数据库
        carService.save(car);
        return Result.ok();
    }

    /**
     * 更新车源信息
     * @param car 车源数据
     * @return 无
     */
    @PutMapping
    public Result updateCar(@RequestBody Car car) {
        // 写入数据库
        return carService.update(car);
    }

    /**
     * 根据车源类型分页查询车源信息
     * @param typeId 车源类型
     * @param current 页码
     * @return 车源列表
     */
    @GetMapping("/list")
    public Result queryCarByType(
            // typeId 原来是必填的。改成可选的直接原因：「全部车源」这个页面态
            // （不选品牌）根本发不出必填参数，而缺参会被 Spring 抛
            // MissingServletRequestParameterException —— 那次转发会打到 /error 上，
            // 前端收到的是一个**401**（见 MvcConfig 里对 /error 的排除），
            // 表现得像没登录。改成可选之后这个坑也就没了。
            @RequestParam(value = "typeId", required = false) Integer typeId,
            @RequestParam(value = "current", defaultValue = "1") Integer current,
            // 车辆大类。非车辆库（原来的餐饮数据）没有这一列，传了也只会筛空。
            @RequestParam(value = "kind", required = false) String kind,
            @RequestParam(value = "x",required = false) Double x,
            @RequestParam(value = "y",required = false) Double y
    ) {
        return carService.queryCarByType(typeId, current, kind, x, y);
    }

    /**
     * 根据车源名称关键字分页查询车源信息
     * @param name 车源名称关键字
     * @param current 页码
     * @return 车源列表
     */
    @GetMapping("/search")
    public Result queryCarByName(
            @RequestParam(value = "name", required = false) String name,
            @RequestParam(value = "current", defaultValue = "1") Integer current
    ) {
        // 根据类型分页查询
        Page<Car> page = carService.query()
                .like(StrUtil.isNotBlank(name), "name", name)
                .page(new Page<>(current, SystemConstants.MAX_PAGE_SIZE));
        // 返回数据
        return Result.ok(page.getRecords());
    }
}
