package com.axle.service;

import com.baomidou.mybatisplus.extension.service.IService;
import com.axle.dto.Result;
import com.axle.entity.Car;

/**
 * <p>
 *  服务类
 * </p>
 *
 * @author 虎哥
 * @since 2021-12-22
 */
public interface ICarService extends IService<Car> {

    /**
     * 根据id查询商户信息
     *
     * @param id id
     * @return {@link Result}
     */
    Result queryById(Long id);

    /**
     * 更新车源信息
     *
     * @param car 商店
     * @return {@link Result}
     */
    Result update(Car car);

    /**
     * 按类型查询商店
     *
     * @param typeId  分类 id；**可为 null**，表示不按分类筛（全部车源）
     * @param current 当前页码
     * @param kind    车辆大类 car / motorcycle；可为 null，表示不筛。非车辆数据此参数无意义
     * @param x       经度；与 y 同时给出才走 GEO 距离排序
     * @param y       纬度
     * @return {@link Result}
     */
    Result queryCarByType(Integer typeId, Integer current, String kind, Double x, Double y);
}
