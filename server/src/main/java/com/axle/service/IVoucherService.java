package com.axle.service;

import com.baomidou.mybatisplus.extension.service.IService;
import com.axle.dto.Result;
import com.axle.entity.Voucher;

/**
 * <p>
 *  服务类
 * </p>
 *
 * @author 虎哥
 * @since 2021-12-22
 */
public interface IVoucherService extends IService<Voucher> {

    Result queryVoucherOfCar(Long carId);

    void addSeckillVoucher(Voucher voucher);
}
