package com.axle.service;

import com.baomidou.mybatisplus.extension.service.IService;
import com.axle.dto.Result;
import com.axle.entity.Brand;

/**
 * <p>
 *  服务类
 * </p>
 *
 * @author 虎哥
 * @since 2021-12-22
 */
public interface IBrandService extends IService<Brand> {

    /**
     * 获取商品类型列表
     *
     * @return {@link Result}
     */
    Result getTypeList();
}
